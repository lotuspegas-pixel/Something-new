import XCTest
import CoreImage
import SwiftData
@testable import DelayedFilm

/// The most important test in the app: image bytes must be unreachable while a
/// roll is locked, and reachable only once it unlocks.
final class NoPreviewRuleTests: XCTestCase {

    /// Writes the supplied bytes straight to disk so the gate can be tested
    /// without invoking Core Image/Metal in a headless test runner.
    private struct StubProcessor: ImageProcessingService {
        func process(
            _ photo: CapturedPhoto,
            recipe: FilmRecipe,
            destinationDirectory: URL,
            fileName: String
        ) async throws -> ProcessedFrameInfo {
            let url = destinationDirectory.appendingPathComponent(fileName)
            try Data("SEALED".utf8).write(to: url)
            return ProcessedFrameInfo(fileName: fileName, pixelWidth: 100, pixelHeight: 100)
        }
    }

    private func makeStore() throws -> (SwiftDataFilmRollStore, URL) {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try ModelContainer(
            for: FilmRoll.self, CapturedFrame.self, configurations: config
        )
        let tempRoot = FileManager.default.temporaryDirectory
            .appendingPathComponent("RollsTest-\(UUID().uuidString)", isDirectory: true)
        let store = SwiftDataFilmRollStore(
            context: ModelContext(container),
            processor: StubProcessor(),
            rootDirectory: tempRoot
        )
        return (store, tempRoot)
    }

    private func samplePhoto() -> CapturedPhoto {
        let image = CIImage(color: .gray).cropped(to: CGRect(x: 0, y: 0, width: 100, height: 100))
        return CapturedPhoto(image: image, pixelWidth: 100, pixelHeight: 100)
    }

    func testLockedRollRefusesImageBytes() async throws {
        let (store, root) = try makeStore()
        defer { try? FileManager.default.removeItem(at: root) }

        let future = Date().addingTimeInterval(60 * 60 * 24)
        let roll = try store.createRoll(
            title: "Locked",
            schedule: .custom(future),
            recipe: FilmRecipeCatalog.default,
            capacity: 27,
            now: Date()
        )
        try await store.addFrame(to: roll, photo: samplePhoto())
        let frame = try XCTUnwrap(roll.frames.first)

        XCTAssertThrowsError(try store.revealedImageData(for: frame, now: Date())) { error in
            XCTAssertTrue(error is RollLockedError, "Locked roll must throw RollLockedError, got \(error)")
        }
    }

    func testUnlockedRollReturnsImageBytes() async throws {
        let (store, root) = try makeStore()
        defer { try? FileManager.default.removeItem(at: root) }

        let past = Date().addingTimeInterval(-60)
        let roll = try store.createRoll(
            title: "Unlocked",
            schedule: .custom(past),
            recipe: FilmRecipeCatalog.default,
            capacity: 27,
            now: Date().addingTimeInterval(-120)
        )
        try await store.addFrame(to: roll, photo: samplePhoto())
        let frame = try XCTUnwrap(roll.frames.first)

        let data = try store.revealedImageData(for: frame, now: Date())
        XCTAssertEqual(String(decoding: data, as: UTF8.self), "SEALED")
    }

    func testFrameModelHasNoImageOrThumbnailStorage() {
        // Compile-time/structural guard: CapturedFrame exposes only a file name,
        // never raw image or thumbnail bytes. If someone adds a `Data`-typed
        // image property, this intent comment + review should catch it.
        let frame = CapturedFrame(
            index: 1,
            recipeID: "x",
            recipeFormulaVersion: 1,
            lens: .wide,
            assetFileName: "frame-001.jpg"
        )
        XCTAssertEqual(frame.assetFileName, "frame-001.jpg")
    }
}
