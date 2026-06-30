import Foundation
import CoreImage
import CoreImage.CIFilterBuiltins
import simd

/// Applies a ``FilmRecipe`` to a full-resolution captured image.
///
/// The renderer is the only component that turns sensor pixels into a developed
/// look. It runs post-capture, off the main thread, and its result is written
/// straight to the locked roll — never returned to the camera UI.
protocol FilmRenderer {
    func render(_ input: CIImage, with recipe: FilmRecipe) -> CIImage
}

/// A no-op renderer used in tests and headless pipelines.
struct PassthroughFilmRenderer: FilmRenderer {
    func render(_ input: CIImage, with recipe: FilmRecipe) -> CIImage { input }
}

/// The production renderer: a deterministic Core Image chain with separate
/// color and black-and-white paths.
///
/// Determinism: every step is a pure function of the recipe; grain is seeded
/// from a stable hash of the recipe id, so the same recipe always produces the
/// same output (modulo the input image).
struct DefaultFilmRenderer: FilmRenderer {

    private let grain: GrainRenderer

    init(grain: GrainRenderer = DefaultGrainRenderer()) {
        self.grain = grain
    }

    func render(_ input: CIImage, with recipe: FilmRecipe) -> CIImage {
        let extent = input.extent
        let seed = Self.stableSeed(recipe.id)
        let img = recipe.isMonochrome
            ? renderMonochrome(input, recipe, seed: seed)
            : renderColor(input, recipe, seed: seed)
        // Generators/blur can expand the extent; crop back to the original.
        return img.cropped(to: extent)
    }

    // MARK: Color path

    private func renderColor(_ input: CIImage, _ r: FilmRecipe, seed: UInt64) -> CIImage {
        var img = input
        img = exposure(img, r.ev)
        img = temperatureTint(img, k: r.temperatureShiftK, tint: r.tintShift)
        img = highlightShadow(img, highlight: r.highlightRecovery, shadow: r.shadowLift)
        img = toneCurve(img, r.toneCurve)
        img = colorControls(img, contrast: r.contrast, saturation: r.saturation)
        img = rgbBalance(img, r.rgbBalance)
        img = colorBaseMatrix(img, r.colorBase)
        if r.colorChrome > 0 { img = vibrance(img, r.colorChrome) }
        if r.fade > 0 { img = fade(img, r.fade) }
        if r.bloom > 0 { img = bloom(img, intensity: r.bloom, radiusScale: 10) }
        if r.halation > 0 { img = bloom(img, intensity: r.halation, radiusScale: 14) }
        if r.vignetteAmount > 0 { img = vignette(img, amount: r.vignetteAmount, radius: r.vignetteRadius) }
        if r.sharpen > 0 { img = sharpen(img, r.sharpen) }
        if r.blur > 0 { img = blur(img, r.blur) }
        if r.grainAmount > 0 {
            img = grain.applyGrain(to: img, amount: r.grainAmount, size: r.grainSize, seed: seed)
        }
        return img
    }

    // MARK: Monochrome path

    private func renderMonochrome(_ input: CIImage, _ r: FilmRecipe, seed: UInt64) -> CIImage {
        var img = input
        img = exposure(img, r.ev)
        img = temperatureTint(img, k: r.temperatureShiftK, tint: r.tintShift)
        img = highlightShadow(img, highlight: r.highlightRecovery, shadow: r.shadowLift)
        img = toLuma(img, weights: r.lumaWeights ?? LumaPreset.panchromatic)
        img = toneCurve(img, r.toneCurve)
        img = colorControls(img, contrast: r.contrast, saturation: 0)
        if r.fade > 0 { img = fade(img, r.fade) }
        if r.sharpen > 0 { img = sharpen(img, r.sharpen) }
        if r.vignetteAmount > 0 { img = vignette(img, amount: r.vignetteAmount, radius: r.vignetteRadius) }
        if r.grainAmount > 0 {
            img = grain.applyGrain(to: img, amount: r.grainAmount, size: r.grainSize, seed: seed)
        }
        return img
    }

    // MARK: Steps

    private func exposure(_ img: CIImage, _ ev: Float) -> CIImage {
        guard ev != 0 else { return img }
        let f = CIFilter.exposureAdjust()
        f.inputImage = img
        f.ev = ev
        return f.outputImage ?? img
    }

    private func temperatureTint(_ img: CIImage, k: Float, tint: Float) -> CIImage {
        guard k != 0 || tint != 0 else { return img }
        let f = CIFilter.temperatureAndTint()
        f.inputImage = img
        f.neutral = CIVector(x: 6500, y: 0)
        f.targetNeutral = CIVector(x: CGFloat(6500 + k), y: CGFloat(tint))
        return f.outputImage ?? img
    }

    private func highlightShadow(_ img: CIImage, highlight: Float, shadow: Float) -> CIImage {
        guard highlight != 0 || shadow != 0 else { return img }
        let f = CIFilter.highlightShadowAdjust()
        f.inputImage = img
        f.radius = 8
        f.highlightAmount = 1 - highlight   // 1 = no change, lower recovers
        f.shadowAmount = shadow             // >0 lifts shadows
        return f.outputImage ?? img
    }

    private func toneCurve(_ img: CIImage, _ points: [CGPoint]) -> CIImage {
        let pts = ToneCurveMath.fivePoints(from: points)
        // Skip if effectively linear.
        if pts == ToneCurveMath.fivePoints(from: FilmRecipe.Curves.linear) { return img }
        let f = CIFilter.toneCurve()
        f.inputImage = img
        f.point0 = pts[0]; f.point1 = pts[1]; f.point2 = pts[2]
        f.point3 = pts[3]; f.point4 = pts[4]
        return f.outputImage ?? img
    }

    private func colorControls(_ img: CIImage, contrast: Float, saturation: Float) -> CIImage {
        let f = CIFilter.colorControls()
        f.inputImage = img
        f.contrast = contrast
        f.saturation = saturation
        f.brightness = 0
        return f.outputImage ?? img
    }

    private func rgbBalance(_ img: CIImage, _ b: SIMD3<Float>) -> CIImage {
        guard b != SIMD3<Float>(1, 1, 1) else { return img }
        let f = CIFilter.colorMatrix()
        f.inputImage = img
        f.rVector = CIVector(x: CGFloat(b.x), y: 0, z: 0, w: 0)
        f.gVector = CIVector(x: 0, y: CGFloat(b.y), z: 0, w: 0)
        f.bVector = CIVector(x: 0, y: 0, z: CGFloat(b.z), w: 0)
        f.aVector = CIVector(x: 0, y: 0, z: 0, w: 1)
        return f.outputImage ?? img
    }

    private func colorBaseMatrix(_ img: CIImage, _ base: MatrixBasePreset) -> CIImage {
        guard base != .identity else { return img }
        let m = base.coefficients
        let f = CIFilter.colorMatrix()
        f.inputImage = img
        f.rVector = CIVector(x: m.r[0], y: m.r[1], z: m.r[2], w: m.r[3])
        f.gVector = CIVector(x: m.g[0], y: m.g[1], z: m.g[2], w: m.g[3])
        f.bVector = CIVector(x: m.b[0], y: m.b[1], z: m.b[2], w: m.b[3])
        f.aVector = CIVector(x: 0, y: 0, z: 0, w: 1)
        f.biasVector = CIVector(x: m.bias[0], y: m.bias[1], z: m.bias[2], w: m.bias[3])
        return f.outputImage ?? img
    }

    private func toLuma(_ img: CIImage, weights w: SIMD3<Float>) -> CIImage {
        let f = CIFilter.colorMatrix()
        f.inputImage = img
        let r = CGFloat(w.x), g = CGFloat(w.y), b = CGFloat(w.z)
        // Map every output channel to the same luma combination.
        f.rVector = CIVector(x: r, y: g, z: b, w: 0)
        f.gVector = CIVector(x: r, y: g, z: b, w: 0)
        f.bVector = CIVector(x: r, y: g, z: b, w: 0)
        f.aVector = CIVector(x: 0, y: 0, z: 0, w: 1)
        return f.outputImage ?? img
    }

    private func vibrance(_ img: CIImage, _ amount: Float) -> CIImage {
        let f = CIFilter.vibrance()
        f.inputImage = img
        f.amount = amount
        return f.outputImage ?? img
    }

    private func fade(_ img: CIImage, _ amount: Float) -> CIImage {
        // Lift blacks and slightly compress range for a matte print look.
        let lift = CGFloat(amount) * 0.12
        let scale = 1 - CGFloat(amount) * 0.10
        let f = CIFilter.colorMatrix()
        f.inputImage = img
        f.rVector = CIVector(x: scale, y: 0, z: 0, w: 0)
        f.gVector = CIVector(x: 0, y: scale, z: 0, w: 0)
        f.bVector = CIVector(x: 0, y: 0, z: scale, w: 0)
        f.biasVector = CIVector(x: lift, y: lift, z: lift, w: 0)
        return f.outputImage ?? img
    }

    private func bloom(_ img: CIImage, intensity: Float, radiusScale: Float) -> CIImage {
        let f = CIFilter.bloom()
        f.inputImage = img
        f.intensity = intensity
        f.radius = intensity * radiusScale
        return f.outputImage ?? img
    }

    private func vignette(_ img: CIImage, amount: Float, radius: Float) -> CIImage {
        let f = CIFilter.vignette()
        f.inputImage = img
        f.intensity = amount * 1.5
        f.radius = radius
        return f.outputImage ?? img
    }

    private func sharpen(_ img: CIImage, _ amount: Float) -> CIImage {
        let f = CIFilter.sharpenLuminance()
        f.inputImage = img
        f.sharpness = amount
        return f.outputImage ?? img
    }

    private func blur(_ img: CIImage, _ radius: Float) -> CIImage {
        let f = CIFilter.gaussianBlur()
        f.inputImage = img.clampedToExtent()
        f.radius = radius
        return f.outputImage ?? img
    }

    // MARK: Determinism

    /// FNV-1a over the recipe id — stable across launches (unlike `hashValue`).
    static func stableSeed(_ string: String) -> UInt64 {
        var hash: UInt64 = 0xcbf29ce484222325
        for byte in string.utf8 {
            hash ^= UInt64(byte)
            hash = hash &* 0x100000001b3
        }
        return hash
    }
}
