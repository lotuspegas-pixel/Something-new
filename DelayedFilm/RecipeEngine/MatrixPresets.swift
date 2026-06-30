import Foundation
import simd

/// Named luminance-weight presets for the monochrome rendering path.
///
/// Different B&W stocks respond differently to color: a red-sensitive stock
/// darkens skies and lightens skin, etc. These weights drive the RGB→luma
/// `CIColorMatrix` in ``FilmRenderer``. Sums are ~1.0 to preserve overall
/// brightness.
enum LumaPreset {
    /// Perceptual Rec.709 (neutral).
    static let neutral = SIMD3<Float>(0.2126, 0.7152, 0.0722)
    /// Panchromatic, slightly red-weighted (classic reportage look).
    static let panchromatic = SIMD3<Float>(0.30, 0.59, 0.11)
    /// Red-sensitive: darker skies, brighter skin.
    static let redFilter = SIMD3<Float>(0.50, 0.40, 0.10)
    /// Green-sensitive: smooth skin, lighter foliage.
    static let greenFilter = SIMD3<Float>(0.20, 0.62, 0.18)
    /// Orthochromatic-ish: blue-weighted, dramatic skin.
    static let ortho = SIMD3<Float>(0.10, 0.45, 0.45)
}
