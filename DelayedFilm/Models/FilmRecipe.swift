import Foundation

/// A deterministic, versioned description of a film-inspired look.
///
/// A recipe is **pure data**: it contains no `CIFilter`s and no platform image
/// types. ``FilmRenderer`` consumes a `FilmRecipe` and produces a processed
/// image. Keeping the recipe as plain `Codable` data makes it:
/// - serializable (built-in catalog + user-authored custom recipes),
/// - deterministic (same recipe + same `version` ⇒ same output), and
/// - testable without a GPU.
///
/// ### Versioning
/// `formulaVersion` is bumped whenever the *math* a renderer applies for a given
/// parameter changes. Stored frames record the recipe `id` **and**
/// `formulaVersion` they were developed with, so a revealed photo always looks
/// the way it did the moment it was captured, even if the catalog evolves.
struct FilmRecipe: Codable, Hashable, Identifiable, Sendable {

    /// Stable slug, e.g. `"kodachrome-64"`. Never localized, never reused.
    var id: String

    /// Display name, e.g. `"Kodachrome 64"`.
    var name: String

    /// One-line evocative description for the recipe card.
    var summary: String

    /// Bumped when the rendering math for this recipe changes. See type docs.
    var formulaVersion: Int

    /// `true` for grayscale stocks; instructs the renderer to take the
    /// luma-conversion path before tone/grain.
    var isMonochrome: Bool

    /// `true` for catalog recipes shipped with the app; `false` for
    /// user-authored recipes from the builder.
    var isBuiltIn: Bool

    // MARK: Tone

    var toneCurve: ToneCurve
    /// Exposure offset in stops (EV). 0 = neutral.
    var exposure: Double
    /// Contrast multiplier around mid-grey. 1 = neutral.
    var contrast: Double

    // MARK: Color

    /// Color-temperature shift in Kelvin relative to the captured white point.
    /// Positive = warmer.
    var temperature: Double
    /// Green ↔ magenta tint. 0 = neutral.
    var tint: Double
    /// Global saturation multiplier. 1 = neutral, 0 = grayscale.
    var saturation: Double
    /// Per-channel multiplicative balance applied after temperature/tint.
    var rgbBalance: RGBBalance
    /// Named 3×3 color-mixing matrix that gives a stock its signature crosstalk.
    var colorMatrix: ColorMatrixPreset

    // MARK: Light shaping

    /// Highlight compression. 0 = linear highlights, 1 = strong shoulder.
    var highlightRolloff: Double
    /// Shadow lift. 0 = true black, 1 = strongly lifted.
    var shadowLift: Double
    /// Matte fade: raises the black point for a faded, aged print look. 0…1.
    var fade: Double

    var vignette: VignetteParams
    var grain: GrainParams

    init(
        id: String,
        name: String,
        summary: String,
        formulaVersion: Int = 1,
        isMonochrome: Bool = false,
        isBuiltIn: Bool = true,
        toneCurve: ToneCurve = .neutral,
        exposure: Double = 0,
        contrast: Double = 1,
        temperature: Double = 0,
        tint: Double = 0,
        saturation: Double = 1,
        rgbBalance: RGBBalance = .neutral,
        colorMatrix: ColorMatrixPreset = .identity,
        highlightRolloff: Double = 0,
        shadowLift: Double = 0,
        fade: Double = 0,
        vignette: VignetteParams = .none,
        grain: GrainParams = .none
    ) {
        self.id = id
        self.name = name
        self.summary = summary
        self.formulaVersion = formulaVersion
        self.isMonochrome = isMonochrome
        self.isBuiltIn = isBuiltIn
        self.toneCurve = toneCurve
        self.exposure = exposure
        self.contrast = contrast
        self.temperature = temperature
        self.tint = tint
        self.saturation = saturation
        self.rgbBalance = rgbBalance
        self.colorMatrix = colorMatrix
        self.highlightRolloff = highlightRolloff
        self.shadowLift = shadowLift
        self.fade = fade
        self.vignette = vignette
        self.grain = grain
    }
}

// MARK: - Supporting parameter types

/// Per-channel multiplicative RGB balance. 1 = unchanged.
struct RGBBalance: Codable, Hashable, Sendable {
    var red: Double
    var green: Double
    var blue: Double

    static let neutral = RGBBalance(red: 1, green: 1, blue: 1)
}

/// Parameters for the post-capture vignette.
struct VignetteParams: Codable, Hashable, Sendable {
    /// 0 = no darkening, 1 = heavy corners.
    var intensity: Double
    /// Radius of the clear center, in normalized units (0…2).
    var radius: Double
    /// Softness of the falloff edge (0…1).
    var softness: Double

    static let none = VignetteParams(intensity: 0, radius: 1, softness: 0.5)
}

/// Parameters for deterministic film grain.
struct GrainParams: Codable, Hashable, Sendable {
    /// 0 = clean, 1 = heavy grain.
    var intensity: Double
    /// Relative grain size (0…1); larger ≈ higher ISO stock.
    var size: Double
    /// Fixed seed so a given frame always renders identical grain.
    var seed: UInt64

    static let none = GrainParams(intensity: 0, size: 0.5, seed: 0)
}
