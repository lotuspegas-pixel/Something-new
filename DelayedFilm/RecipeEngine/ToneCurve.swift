import Foundation

/// A deterministic, monotonic tone curve expressed as control points in the
/// unit square (input → output luminance, both 0…1).
///
/// The curve is pure data and its sampling is pure math, so it can be unit
/// tested with no GPU. ``FilmRenderer`` translates a sampled curve into a
/// `CIToneCurve` / `CIColorCurves` input on device.
struct ToneCurve: Codable, Hashable, Sendable {

    /// A single control point in the unit square.
    struct Point: Codable, Hashable, Sendable {
        var x: Double   // input  0…1
        var y: Double   // output 0…1
        init(_ x: Double, _ y: Double) { self.x = x; self.y = y }
    }

    /// Control points, expected sorted by `x` ascending with endpoints near
    /// 0 and 1. Stored rather than computed so recipes stay declarative.
    var points: [Point]

    /// The identity curve (output == input).
    static let neutral = ToneCurve(points: [Point(0, 0), Point(1, 1)])

    /// A gentle film "S" curve: lifted shadows, compressed highlights.
    static let filmS = ToneCurve(points: [
        Point(0.00, 0.02),
        Point(0.25, 0.20),
        Point(0.50, 0.50),
        Point(0.75, 0.80),
        Point(1.00, 0.97)
    ])

    /// Samples the curve at `x` using piecewise-linear interpolation.
    ///
    /// Linear interpolation keeps the result deterministic and monotonic given
    /// monotonic control points, which is exactly what the unit tests assert.
    /// On device the same control points feed a smooth GPU curve; the math here
    /// is the reference used for tests and previews.
    func sample(_ x: Double) -> Double {
        let clamped = min(max(x, 0), 1)
        guard let first = points.first else { return clamped }
        if clamped <= first.x { return first.y }
        guard let last = points.last else { return clamped }
        if clamped >= last.x { return last.y }

        for i in 1..<points.count {
            let a = points[i - 1]
            let b = points[i]
            if clamped <= b.x {
                let span = b.x - a.x
                guard span > 0 else { return a.y }
                let t = (clamped - a.x) / span
                return a.y + t * (b.y - a.y)
            }
        }
        return last.y
    }
}
