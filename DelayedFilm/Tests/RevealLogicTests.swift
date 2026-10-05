import XCTest
import SwiftData
import CoreImage
@testable import DelayedFilm

/// Phase 4: develop/reveal/archive gating through the store.
final class RevealLogicTests: XCTestCase {

    private struct StubProcessor: ImageProcessingService {
        func process(_ photo: CapturedPhoto, recipe: FilmRecipe,
                     destinationDirectory: URL, fileName: String) async throws -> ProcessedFrameInfo {
            try Data("FRAME".utf8).write(to: destinationDirectory.appendingPathComponent(fileName))
            return ProcessedFrameInfo(fileName: fileName, pixelWidth: 10, pixelHeight: 10)
        }
    }

    private func makeStore() throws -> (SwiftDataFilmRollStore, URL) {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try ModelContainer(
            for: FilmRoll.self, CapturedFrame.self, configurations: config)
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("Reveal-\(UUID().uuidString)", isDirectory: true)
        return (SwiftDataFilmRollStore(context: ModelContext(container),
                                       processor: StubProcessor(),
                                       rootDirectory: root), root)
    }

    func testDevelopBeforeUnlockIsNoOp() async throws {
        let (store, root) = try makeStore()
        defer { try? FileManager.default.removeItem(at: root) }
        let future = Date().addingTimeInterval(3600)
        let roll = try store.createRoll(title: "L", schedule: .custom(future),
                                        recipe: FilmRecipeCatalog.default, capacity: 27, now: Date())
        try await store.addFrame(to: roll, photo: photo())

        try store.develop(roll, now: Date())          // before unlock → ignored
        XCTAssertNil(roll.developedAt)
        XCTAssertEqual(roll.currentState, .active)

        let frame = try XCTUnwrap(roll.frames.first)
        XCTAssertThrowsError(try store.revealedImageData(for: frame, now: Date()))
    }

    func testDevelopAfterUnlockRevealsBytes() async throws {
        let (store, root) = try makeStore()
        defer { try? FileManager.default.removeItem(at: root) }
        let past = Date().addingTimeInterval(-3600)
        let roll = try store.createRoll(title: "R", schedule: .custom(past),
                                        recipe: FilmRecipeCatalog.default, capacity: 27,
                                        now: Date().addingTimeInterval(-7200))
        try await store.addFrame(to: roll, photo: photo())

        XCTAssertEqual(roll.currentState, .readyToReveal)
        try store.develop(roll, now: Date())
        XCTAssertNotNil(roll.developedAt)
        XCTAssertEqual(roll.currentState, .revealed)

        let frame = try XCTUnwrap(roll.frames.first)
        let data = try store.revealedImageData(for: frame, now: Date())
        XCTAssertEqual(String(decoding: data, as: UTF8.self), "FRAME")
    }

    func testArchiveOnlyAfterDevelop() async throws {
        let (store, root) = try makeStore()
        defer { try? FileManager.default.removeItem(at: root) }
        let past = Date().addingTimeInterval(-3600)
        let roll = try store.createRoll(title: "A", schedule: .custom(past),
                                        recipe: FilmRecipeCatalog.default, capacity: 27,
                                        now: Date().addingTimeInterval(-7200))
        try store.archive(roll)                        // not developed → ignored
        XCTAssertNil(roll.archivedAt)

        try store.develop(roll, now: Date())
        try store.archive(roll)
        XCTAssertNotNil(roll.archivedAt)
        XCTAssertEqual(roll.currentState, .archived)
    }

    private func photo() -> CapturedPhoto {
        let img = CIImage(color: .gray).cropped(to: CGRect(x: 0, y: 0, width: 10, height: 10))
        return CapturedPhoto(image: img, pixelWidth: 10, pixelHeight: 10)
    }
}
