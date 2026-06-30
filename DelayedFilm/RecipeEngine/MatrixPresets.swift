import Foundation

/// Named 3×3 color-mixing matrices that give film stocks their signature
/// channel crosstalk (e.g. cyan shadows, warm skin response).
///
/// Stored as a stable `rawValue` so recipes remain `Codable` and deterministic;
/// the actual coefficients live here, in one auditable place, and are resolved
/// to RGBA vectors for Core Image's `CIColorMatrix` on device.
enum ColorMatrixPreset: String, Codable, Hashable, CaseIterable, Sendable {
    case identity
    case kodakWarm
    case fujiCool
    case crossProcess
    case fadedConsumer
    case cineTeal

    /// Column vectors for `CIColorMatrix` (rVector, gVector, bVector). Each is
    /// `(r, g, b)` weight; alpha handled separately by the renderer.
    var coefficients: (r: SIMDLike, g: SIMDLike, b: SIMDLike) {
        switch self {
        case .identity:
            return (SIMDLike(1, 0, 0), SIMDLike(0, 1, 0), SIMDLike(0, 0, 1))
        case .kodakWarm:
            return (SIMDLike(1.06, 0.02, -0.02),
                    SIMDLike(0.01, 1.00, -0.01),
                    SIMDLike(-0.03, 0.02, 0.95))
        case .fujiCool:
            return (SIMDLike(0.96, 0.02, 0.02),
                    SIMDLike(0.00, 1.02, 0.00),
                    SIMDLike(0.02, 0.03, 1.05))
        case .crossProcess:
            return (SIMDLike(1.10, 0.05, -0.10),
                    SIMDLike(-0.05, 1.05, 0.05),
                    SIMDLike(0.10, -0.05, 0.90))
        case .fadedConsumer:
            return (SIMDLike(0.92, 0.06, 0.04),
                    SIMDLike(0.04, 0.90, 0.06),
                    SIMDLike(0.06, 0.08, 0.86))
        case .cineTeal:
            return (SIMDLike(0.98, -0.02, 0.00),
                    SIMDLike(0.00, 1.00, 0.02),
                    SIMDLike(0.04, 0.06, 1.04))
        }
    }
}

/// A tiny, platform-independent 3-component vector.
///
/// Defined locally so the recipe layer carries no dependency on `simd`/Core
/// Image and can be unit tested anywhere. The renderer maps this onto
/// `CIVector` on device.
struct SIMDLike: Codable, Hashable, Sendable {
    var x: Double
    var y: Double
    var z: Double
    init(_ x: Double, _ y: Double, _ z: Double) { self.x = x; self.y = y; self.z = z }
}
