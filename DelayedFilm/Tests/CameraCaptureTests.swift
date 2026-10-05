import XCTest
import SwiftData
@testable import DelayedFilm

/// Phase 2 smoke test: a captured frame flows through the mock camera into the
/// store, increments the counter, and stays hidden behind the lock.
final class CameraCaptureTests: XCTestCase {

    private struct StubProcessor: ImageProcessingService {
        func process(_ photo: CapturedPhoto, recipe: FilmRecipe,
                     destinationDirectory: URL, fileName: String) async throws -> ProcessedFrameInfo {
            try Data("FRAME".utf8).write(to: destinationDirectory.appendingPathComponent(fileName))
            return ProcessedFrameInfo(fileName: fileName,
                                      pixelWidth: photo.pixelWidth,
                                      pixelHeight: photo.pixelHeight)
        }
    }

    func testCaptureStoresHiddenFrameAndIncrementsCounter() async throws {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try ModelContainer(
            for: FilmRoll.self, CapturedFrame.self, configurations: config)
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("CamTest-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let store = SwiftDataFilmRollStore(
            context: ModelContext(container),
            processor: StubProcessor(),
            rootDirectory: root)
        let camera = MockCameraService()
        try await camera.start()

        let roll = try store.createRoll(
            title: "Test", schedule: .endOfMonth,
            recipe: FilmRecipeCatalog.default, capacity: 27, now: Date())

        let photo = try await camera.capture()
        try await store.addFrame(to: roll, photo: photo)

        XCTAssertEqual(roll.frameCount, 1)
        XCTAssertEqual(roll.frames.count, 1)

        // The file exists on disk...
        let frame = try XCTUnwrap(roll.frames.first)
        let url = store.directory(for: roll).appendingPathComponent(frame.assetFileName)
        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path))

        // ...but the bytes are unreachable while the roll is locked.
        XCTAssertThrowsError(try store.revealedImageData(for: frame, now: Date())) { error in
            XCTAssertTrue(error is RollLockedError)
        }
    }
}
