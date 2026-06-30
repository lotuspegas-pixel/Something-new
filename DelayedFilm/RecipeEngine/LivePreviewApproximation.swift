import Foundation

/// Builds a deliberately *weakened* recipe for an optional live-preview
/// approximation.
///
/// Product rule (Phase 3): the live camera preview must never look like the
/// final developed image — that would leak the surprise. If preview styling is
/// added at all, it must be a lightweight hint only:
/// - ≤ 35% of contrast / exposure / highlight-shadow effect
/// - ≤ 20% of saturation effect
/// - ≤ 40% of temperature/tint shift
/// - no grain, vignette, fade, bloom, halation, light leak, border, or date stamp
///
/// Encoding the clamps here means any future preview path is correct by
/// construction. The captured frame is always developed with the *full* recipe.
enum LivePreviewApproximation {

    static func reduced(_ r: FilmRecipe) -> FilmRecipe {
        var p = r
        p.ev = r.ev * 0.35
        p.contrast = 1 + (r.contrast - 1) * 0.35
        p.saturation = 1 + (r.saturation - 1) * 0.20
        p.temperatureShiftK = r.temperatureShiftK * 0.40
        p.tintShift = r.tintShift * 0.40
        p.highlightRecovery = r.highlightRecovery * 0.35
        p.shadowLift = r.shadowLift * 0.35

        // Hard-off: anything that would reveal the final look.
        p.grainAmount = 0
        p.vignetteAmount = 0
        p.fade = 0
        p.bloom = 0
        p.halation = 0
        p.lightLeak = 0
        p.sharpen = 0
        p.blur = 0
        p.colorChrome = 0
        p.borderStyle = "none"
        p.dateStampStyle = "none"
        return p
    }
}
