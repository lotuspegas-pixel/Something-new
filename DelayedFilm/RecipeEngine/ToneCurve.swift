import Foundation
import CoreGraphics

/// Pure, deterministic helpers for the `[CGPoint]` tone curves stored on
/// ``FilmRecipe``. Kept free of Core Image so they can be unit tested anywhere;
/// the renderer feeds the resampled 5 points into `CIToneCurve`.
enum ToneCurveMath {

    /// Samples a piecewise-linear curve at `x` (clamped to 0…1). Monotonic given
    /// monotonic control points — this is the reference the tests assert against.
    static func sample(_ points: [CGPoint], at x: CGFloat) -> CGFloat {
        let clamped = min(max(x, 0), 1)
        guard let first = points.first else { return clamped }
        if clamped <= first.x { return first.y }
        guard let last = points.last else { return clamped }
        if clamped >= last.x { return last.y }
        for i in 1..<points.count {
            let a = points[i - 1], b = points[i]
            if clamped <= b.x {
                let span = b.x - a.x
                guard span > 0 else { return a.y }
                let t = (clamped - a.x) / span
                return a.y + t * (b.y - a.y)
            }
        }
        return last.y
    }

    /// `CIToneCurve` accepts exactly five points (input 0, 0.25, 0.5, 0.75, 1).
    /// Resample any control-point set onto that fixed grid.
    static func fivePoints(from points: [CGPoint]) -> [CGPoint] {
        let xs: [CGFloat] = [0, 0.25, 0.5, 0.75, 1]
        return xs.map { CGPoint(x: $0, y: sample(points, at: $0)) }
    }
}
