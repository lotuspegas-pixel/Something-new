import Foundation

/// The source of truth for built-in film recipes.
///
/// Phase 1 seeds a small, representative set so every other layer (roll
/// creation, picker, renderer, tests) has real recipes to resolve. **Phase 4**
/// expands this to the full 30 film-inspired recipes and is the only place that
/// changes — the model and rendering contracts are already fixed.
enum FilmRecipeCatalog {

    /// All built-in recipes, in display order.
    static let all: [FilmRecipe] = [
        FilmRecipe(
            id: "classic-chrome-64",
            name: "Classic Chrome 64",
            summary: "Muted slide film with restrained saturation and deep tones.",
            isMonochrome: false,
            toneCurve: .filmS,
            contrast: 1.08,
            temperature: 120,
            saturation: 0.86,
            rgbBalance: RGBBalance(red: 1.02, green: 1.0, blue: 0.97),
            colorMatrix: .kodakWarm,
            highlightRolloff: 0.35,
            shadowLift: 0.08,
            vignette: VignetteParams(intensity: 0.18, radius: 1.1, softness: 0.6),
            grain: GrainParams(intensity: 0.22, size: 0.4, seed: 0x10F)
        ),
        FilmRecipe(
            id: "sunlit-consumer-400",
            name: "Sunlit Consumer 400",
            summary: "Warm, nostalgic drugstore film with golden highlights.",
            toneCurve: .filmS,
            contrast: 1.03,
            temperature: 320,
            tint: 4,
            saturation: 1.08,
            rgbBalance: RGBBalance(red: 1.05, green: 1.0, blue: 0.94),
            colorMatrix: .fadedConsumer,
            highlightRolloff: 0.28,
            shadowLift: 0.14,
            fade: 0.12,
            vignette: VignetteParams(intensity: 0.22, radius: 1.0, softness: 0.55),
            grain: GrainParams(intensity: 0.34, size: 0.55, seed: 0x2B7)
        ),
        FilmRecipe(
            id: "cool-cine-250d",
            name: "Cool Cine 250D",
            summary: "Cinematic daylight stock with teal shadows and clean skin.",
            toneCurve: .filmS,
            contrast: 1.05,
            temperature: -180,
            saturation: 0.95,
            rgbBalance: RGBBalance(red: 0.98, green: 1.0, blue: 1.04),
            colorMatrix: .cineTeal,
            highlightRolloff: 0.4,
            shadowLift: 0.1,
            vignette: VignetteParams(intensity: 0.16, radius: 1.15, softness: 0.65),
            grain: GrainParams(intensity: 0.18, size: 0.35, seed: 0x3C1)
        ),
        FilmRecipe(
            id: "silver-mono-pan",
            name: "Silver Mono Pan",
            summary: "High-contrast black & white with rich grain.",
            isMonochrome: true,
            toneCurve: .filmS,
            contrast: 1.18,
            saturation: 0,
            colorMatrix: .identity,
            highlightRolloff: 0.3,
            shadowLift: 0.05,
            vignette: VignetteParams(intensity: 0.25, radius: 1.0, softness: 0.6),
            grain: GrainParams(intensity: 0.42, size: 0.6, seed: 0x4D9)
        )
    ]

    /// The default recipe used when a roll is created without an explicit choice.
    static var `default`: FilmRecipe { all[0] }

    /// Looks up a recipe by its stable slug.
    static func recipe(for id: String) -> FilmRecipe? {
        all.first { $0.id == id }
    }

    // TODO: [Phase 4] Expand `all` to the full 30 film-inspired recipes.
}
