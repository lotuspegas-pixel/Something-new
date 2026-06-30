import Foundation
import CoreImage
import CoreImage.CIFilterBuiltins

/// Composites deterministic film grain over a developed image.
protocol GrainRenderer {
    /// - Parameters:
    ///   - image: developed image to grain.
    ///   - amount: 0…1 blend strength (0 returns the image unchanged).
    ///   - size: 0…1 relative grain size (larger ≈ higher-ISO stock).
    ///   - seed: stable seed; same seed ⇒ identical grain.
    func applyGrain(to image: CIImage, amount: Float, size: Float, seed: UInt64) -> CIImage
}

/// No-op grain for tests / headless pipelines.
struct NoGrainRenderer: GrainRenderer {
    func applyGrain(to image: CIImage, amount: Float, size: Float, seed: UInt64) -> CIImage {
        image
    }
}

/// Production grain.
///
/// `CIRandomGenerator` emits a fixed deterministic noise tile; we desaturate it,
/// scale it by `size`, translate it by a `seed`-derived offset (so different
/// recipes grain differently but each is reproducible), center it around mid-grey
/// with contrast set by `amount`, and overlay-blend it onto the image. An overlay
/// of mid-grey is a no-op, so only the noise deviations show through.
struct DefaultGrainRenderer: GrainRenderer {
    func applyGrain(to image: CIImage, amount: Float, size: Float, seed: UInt64) -> CIImage {
        guard amount > 0 else { return image }
        let extent = image.extent

        guard let noise = CIFilter.randomGenerator().outputImage else { return image }

        // Desaturate to monochrome noise.
        let mono = CIFilter.colorMatrix()
        mono.inputImage = noise
        mono.rVector = CIVector(x: 0.333, y: 0.333, z: 0.333, w: 0)
        mono.gVector = CIVector(x: 0.333, y: 0.333, z: 0.333, w: 0)
        mono.bVector = CIVector(x: 0.333, y: 0.333, z: 0.333, w: 0)
        mono.aVector = CIVector(x: 0, y: 0, z: 0, w: 1)
        guard var grainImage = mono.outputImage else { return image }

        // Scale grain size (1× … ~3×) and offset deterministically by seed.
        let scale = CGFloat(1 + size * 2)
        let dx = CGFloat(seed % 512)
        let dy = CGFloat((seed / 512) % 512)
        grainImage = grainImage
            .transformed(by: CGAffineTransform(scaleX: scale, y: scale))
            .transformed(by: CGAffineTransform(translationX: dx, y: dy))

        // Center around 0.5 grey, with deviation scaled by `amount`.
        let contrast = CIFilter.colorControls()
        contrast.inputImage = grainImage
        contrast.saturation = 0
        contrast.contrast = amount      // <1 compresses noise toward mid-grey
        contrast.brightness = 0
        guard let centered = contrast.outputImage?.cropped(to: extent) else { return image }

        // Overlay blend: mid-grey is neutral, deviations add grain.
        let overlay = CIFilter.overlayBlendMode()
        overlay.backgroundImage = image
        overlay.inputImage = centered
        return overlay.outputImage?.cropped(to: extent) ?? image
    }
}
