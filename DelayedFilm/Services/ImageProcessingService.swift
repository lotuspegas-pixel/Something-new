import Foundation
import CoreImage
import Metal

/// The result of processing one captured frame to disk.
struct ProcessedFrameInfo: Sendable {
    /// File name of the written, protected image (relative to the roll dir).
    let fileName: String
    let pixelWidth: Int
    let pixelHeight: Int
}

/// Develops a captured photo through a recipe and writes the result into a
/// roll's protected directory — all off the main thread, with no value ever
/// returned for display.
///
/// Phase 1 ships the contract and a working skeleton: a shared Metal-backed
/// `CIContext`, the renderer/grain dependencies, JPEG encoding, and file
/// protection. The film math itself is a passthrough until **Phase 3/4** fill in
/// ``FilmRenderer`` and ``GrainRenderer``.
protocol ImageProcessingService {
    /// Renders `photo` with `recipe` and writes it to `destinationDirectory`,
    /// returning the on-disk metadata. The image is never handed back.
    func process(
        _ photo: CapturedPhoto,
        recipe: FilmRecipe,
        destinationDirectory: URL,
        fileName: String
    ) async throws -> ProcessedFrameInfo
}

/// Default implementation backed by a shared Metal `CIContext`.
final class DefaultImageProcessingService: ImageProcessingService {

    private let renderer: FilmRenderer
    private let grain: GrainRenderer
    private let context: CIContext
    private let colorSpace: CGColorSpace

    init(
        renderer: FilmRenderer = PassthroughFilmRenderer(),
        grain: GrainRenderer = NoGrainRenderer()
    ) {
        self.renderer = renderer
        self.grain = grain
        if let device = MTLCreateSystemDefaultDevice() {
            self.context = CIContext(mtlDevice: device)
        } else {
            // Simulators without a Metal device fall back to a software context.
            self.context = CIContext(options: [.useSoftwareRenderer: true])
        }
        self.colorSpace = CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()
    }

    func process(
        _ photo: CapturedPhoto,
        recipe: FilmRecipe,
        destinationDirectory: URL,
        fileName: String
    ) async throws -> ProcessedFrameInfo {
        // Heavy work stays off the main actor.
        try await Task.detached(priority: .userInitiated) { [renderer, grain, context, colorSpace] in
            let developed = renderer.render(photo.image, with: recipe)
            let grained = grain.applyGrain(to: developed, params: recipe.grain)

            guard let data = context.jpegRepresentation(
                of: grained,
                colorSpace: colorSpace,
                options: [:]
            ) else {
                throw CameraError.captureFailed
            }

            let url = destinationDirectory.appendingPathComponent(fileName)
            try data.write(to: url, options: [.atomic, .completeFileProtection])

            return ProcessedFrameInfo(
                fileName: fileName,
                pixelWidth: photo.pixelWidth,
                pixelHeight: photo.pixelHeight
            )
        }.value
    }
}
