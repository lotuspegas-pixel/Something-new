import XCTest
import SwiftData
import CoreImage
@testable import DelayedFilm

/// Phase 7: export/share never leak locked frames.
@MainActor
final class ExportTests: XCTestCase {

    private struct StubProcessor: ImageProcessingService {
        func process(_ photo: CapturedPhoto, recipe: FilmRecipe,
                     destinationDirectory: URL, fileName: String) async throws -> ProcessedFrameInfo {
            try Data("IMG".utf8).write(to: destinationDirectory.appendingPathComponent(fileName))
            return ProcessedFrameInfo(fileName: fileName, pixelWidth: 10, pixelHeight: 10)
        }
    }

    private func makeStore() throws -> (SwiftDataFilmRollStore, URL) {
        let container = try ModelContainer(
            for: FilmRoll.self, CapturedFrame.self, CustomRecipeRecord.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true))
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("Export-\(UUID().uuidString)", isDirectory: true)
        return (SwiftDataFilmRollStore(context: ModelContext(container),
                                       processor: StubProcessor(), rootDirectory: root), root)
    }

    private func photo() -> CapturedPhoto {
        let img = CIImage(color: .gray).cropped(to: CGRect(x: 0, y: 0, width: 10, height: 10))
        return CapturedPhoto(image: img, pixelWidth: 10, pixelHeight: 10)
    }

    func testShareDataEmptyWhileLocked() async throws {
        let (store, root) = try makeStore()
        defer { try? FileManager.default.removeItem(at: root) }
        let future = Date().addingTimeInterval(3600)
        let roll = try store.createRoll(title: "L", schedule: .custom(future),
                                        recipe: FilmRecipeCatalog.default, capacity: 27, now: Date())
        try await store.addFrame(to: roll, photo: photo())

        let vm = RevealViewModel(roll: roll, store: store)
        XCTAssertTrue(vm.shareData(for: roll.frames).isEmpty, "Locked roll must not yield share data")
    }

    func testShareDataReturnsAfterDevelop() async throws {
        let (store, root) = try makeStore()
        defer { try? FileManager.default.removeItem(at: root) }
        let past = Date().addingTimeInterval(-3600)
        let roll = try store.createRoll(title: "R", schedule: .custom(past),
                                        recipe: FilmRecipeCatalog.default, capacity: 27,
                                        now: Date().addingTimeInterval(-7200))
        try await store.addFrame(to: roll, photo: photo())
        try store.develop(roll, now: Date())

        let vm = RevealViewModel(roll: roll, store: store)
        let data = vm.shareData(for: roll.frames)
        XCTAssertEqual(data.count, 1)
        XCTAssertEqual(String(decoding: data[0], as: UTF8.self), "IMG")
    }
}
