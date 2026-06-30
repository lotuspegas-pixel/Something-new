import Foundation
import CoreGraphics
import simd

/// Named 3×3(+bias) color-mixing matrices that give film stocks their signature
/// channel crosstalk. Coefficients are calibrated engineering starting points
/// based on analog film characteristics — **not** official manufacturer LUTs.
///
/// Each row is `[r, g, b, a]` applied as `out = row · pixel`; `bias` is added
/// afterwards. The renderer maps these onto a `CIColorMatrix`.
enum MatrixBasePreset: String, Codable, Hashable, CaseIterable, Sendable {
    case identity
    case consumerWarmCN
    case consumerLoFi
    case portraitCN
    case slideNeutral
    case slideVivid
    case fujiPastel
    case docChrome
    case nostalgicAmber
    case cinemaFlat
    case tungstenCine
    case xproSlide

    var displayName: String {
        switch self {
        case .identity:       return "Neutral"
        case .consumerWarmCN: return "Consumer Warm"
        case .consumerLoFi:   return "Consumer Lo-Fi"
        case .portraitCN:     return "Portrait"
        case .slideNeutral:   return "Slide Neutral"
        case .slideVivid:     return "Slide Vivid"
        case .fujiPastel:     return "Pastel"
        case .docChrome:      return "Doc Chrome"
        case .nostalgicAmber: return "Nostalgic Amber"
        case .cinemaFlat:     return "Cinema Flat"
        case .tungstenCine:   return "Tungsten Cine"
        case .xproSlide:      return "Cross-Process"
        }
    }

    /// Row vectors + bias as `CGFloat` for direct `CIVector` construction.
    var coefficients: (r: [CGFloat], g: [CGFloat], b: [CGFloat], bias: [CGFloat]) {
        switch self {
        case .identity:
            return ([1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 0])
        case .consumerWarmCN:
            return ([1.03, 0.01, 0.00, 0.00], [0.00, 1.00, 0.00, 0.00],
                    [0.00, 0.02, 0.96, 0.00], [0.000, 0.000, -0.002, 0.000])
        case .consumerLoFi:
            return ([1.02, 0.02, -0.01, 0.00], [0.01, 0.99, 0.01, 0.00],
                    [-0.01, 0.03, 0.97, 0.00], [0.004, 0.002, 0.000, 0.000])
        case .portraitCN:
            return ([1.01, 0.01, 0.00, 0.00], [0.00, 1.00, 0.00, 0.00],
                    [0.00, 0.01, 0.99, 0.00], [0.002, 0.001, 0.000, 0.000])
        case .slideNeutral:
            return ([1.02, 0.00, -0.01, 0.00], [0.00, 1.01, 0.00, 0.00],
                    [-0.005, 0.01, 1.01, 0.00], [0.000, 0.000, 0.000, 0.000])
        case .slideVivid:
            return ([1.05, 0.00, -0.02, 0.00], [0.01, 1.03, 0.00, 0.00],
                    [-0.01, 0.02, 1.04, 0.00], [0.000, 0.000, -0.001, 0.000])
        case .fujiPastel:
            return ([0.99, 0.01, 0.00, 0.00], [0.00, 1.00, 0.01, 0.00],
                    [0.00, 0.015, 1.02, 0.00], [0.003, 0.003, 0.004, 0.000])
        case .docChrome:
            return ([0.98, 0.01, 0.00, 0.00], [0.00, 0.99, 0.02, 0.00],
                    [0.00, 0.02, 1.04, 0.00], [-0.002, -0.001, 0.002, 0.000])
        case .nostalgicAmber:
            return ([1.04, 0.01, 0.00, 0.00], [0.00, 1.00, 0.00, 0.00],
                    [0.00, 0.01, 0.96, 0.00], [0.004, 0.002, -0.002, 0.000])
        case .cinemaFlat:
            return ([1.00, 0.00, 0.00, 0.00], [0.00, 1.00, 0.00, 0.00],
                    [0.00, 0.01, 1.01, 0.00], [0.002, 0.002, 0.002, 0.000])
        case .tungstenCine:
            return ([0.97, 0.02, 0.00, 0.00], [0.00, 1.00, 0.01, 0.00],
                    [-0.01, 0.02, 1.06, 0.00], [-0.002, 0.000, 0.004, 0.000])
        case .xproSlide:
            return ([1.03, -0.01, 0.02, 0.00], [-0.01, 0.98, 0.02, 0.00],
                    [0.01, 0.01, 1.05, 0.00], [0.002, -0.002, 0.004, 0.000])
        }
    }
}

/// Named luminance-weight presets for the monochrome rendering path.
///
/// Different B&W stocks respond differently to color. These weights drive the
/// RGB→luma `CIColorMatrix` in ``FilmRenderer``. Sums are ~1.0 to preserve
/// overall brightness.
enum LumaPreset {
    static let neutral = SIMD3<Float>(0.2126, 0.7152, 0.0722)
    static let panchromatic = SIMD3<Float>(0.30, 0.59, 0.11)
    static let redFilter = SIMD3<Float>(0.50, 0.40, 0.10)
    static let greenFilter = SIMD3<Float>(0.20, 0.62, 0.18)
    static let ortho = SIMD3<Float>(0.10, 0.45, 0.45)
}
