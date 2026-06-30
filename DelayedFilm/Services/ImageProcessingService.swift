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
/// roll's protected directory — off the main thread, with no value ever returned
/// for display.
protocol ImageProcessingService {
    func process(
        _ photo: CapturedPhoto,
        recipe: FilmRecipe,
        destinationDirectory: URL,
        fileName: String
    ) async throws -> ProcessedFrameInfo
}

/// Default implementation backed by a shared Metal `CIContext`, rendering in
/// Display P3 where available.
final class DefaultImageProcessingService: ImageProcessingService {

    private let renderer: FilmRenderer
    private let context: CIContext
    private let workingColorSpace: CGColorSpace
    private let outputColorSpace: CGColorSpace

    init(renderer: FilmRenderer = DefaultFilmRenderer()) {
        self.renderer = renderer
        let working = CGColorSpace(name: CGColorSpace.extendedLinearSRGB)
            ?? CGColorSpaceCreateDeviceRGB()
        if let device = MTLCreateSystemDefaultDevice() {
            self.context = CIContext(mtlDevice: device, options: [
                .workingColorSpace: working
            ])
        } else {
            // Simulators without Metal fall back to a software context.
            self.context = CIContext(options: [
                .useSoftwareRenderer: true,
                .workingColorSpace: working
            ])
        }
        self.workingColorSpace = working
        self.outputColorSpace = CGColorSpace(name: CGColorSpace.displayP3)
            ?? CGColorSpace(name: CGColorSpace.sRGB)
            ?? CGColorSpaceCreateDeviceRGB()
    }

    func process(
        _ photo: CapturedPhoto,
        recipe: FilmRecipe,
        destinationDirectory: URL,
        fileName: String
    ) async throws -> ProcessedFrameInfo {
        try await Task.detached(priority: .userInitiated) { [renderer, context, outputColorSpace] in
            let extent = photo.image.extent
            let developed = renderer.render(photo.image, with: recipe)
                .cropped(to: extent)   // keep output at the original size

            guard let data = context.jpegRepresentation(
                of: developed,
                colorSpace: outputColorSpace,
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
