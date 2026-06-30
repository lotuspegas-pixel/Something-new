import Foundation
import CoreGraphics
import simd

/// The source of truth for the 30 built-in film recipes.
///
/// User-facing names are brand-safe; `inspiration` records the internal
/// reference stock for development only. Parameters are deterministic and
/// versioned; ``FilmRenderer`` turns them into the final look.
enum FilmRecipeCatalog {

    static let all: [FilmRecipe] = [
        // MARK: - Color negative
        FilmRecipe(
            id: "gold-daylight", displayName: "Gold Daylight",
            inspiration: "Kodak Gold 200", category: .colorNegative,
            bestUse: "Warm, sunny everyday moments.",
            contrast: 1.05, saturation: 1.08, temperatureShiftK: 250,
            highlightRecovery: 0.2, shadowLift: 0.1, grainAmount: 0.24,
            vignetteAmount: 0.12, toneCurve: FilmRecipe.Curves.filmS,
            rgbBalance: SIMD3<Float>(1.05, 1.0, 0.95)),

        FilmRecipe(
            id: "everyday-max-400", displayName: "Everyday Max 400",
            inspiration: "Kodak UltraMax 400", category: .colorNegative,
            bestUse: "All-purpose daylight and snapshots.",
            contrast: 1.04, saturation: 1.06, temperatureShiftK: 150,
            shadowLift: 0.08, grainAmount: 0.3, vignetteAmount: 0.12,
            toneCurve: FilmRecipe.Curves.filmS,
            rgbBalance: SIMD3<Float>(1.03, 1.0, 0.98)),

        FilmRecipe(
            id: "disposable-flash-800", displayName: "Disposable Flash 800",
            inspiration: "Single-use flash camera", category: .colorNegative,
            bestUse: "Direct-flash party look.",
            contrast: 1.12, saturation: 1.05, temperatureShiftK: -80,
            tintShift: 6, grainAmount: 0.45, vignetteAmount: 0.28,
            vignetteRadius: 1.2, toneCurve: FilmRecipe.Curves.punchy,
            rgbBalance: SIMD3<Float>(0.99, 1.02, 1.0)),

        FilmRecipe(
            id: "soft-portrait-160", displayName: "Soft Portrait 160",
            inspiration: "Kodak Portra 160", category: .colorNegative,
            bestUse: "Flattering low-contrast portraits.",
            contrast: 0.96, saturation: 0.95, temperatureShiftK: 200,
            highlightRecovery: 0.3, shadowLift: 0.12, grainAmount: 0.18,
            vignetteAmount: 0.08, toneCurve: FilmRecipe.Curves.softHi,
            rgbBalance: SIMD3<Float>(1.04, 1.0, 0.97)),

        FilmRecipe(
            id: "open-shade-400", displayName: "Open Shade 400",
            inspiration: "Kodak Portra 400", category: .colorNegative,
            bestUse: "Even skin tones in shade.",
            contrast: 1.0, saturation: 0.98, temperatureShiftK: 180,
            highlightRecovery: 0.25, shadowLift: 0.1, grainAmount: 0.22,
            vignetteAmount: 0.1, toneCurve: FilmRecipe.Curves.softHi,
            rgbBalance: SIMD3<Float>(1.03, 1.0, 0.98)),

        FilmRecipe(
            id: "portrait-push-800", displayName: "Portrait Push 800",
            inspiration: "Kodak Portra 800", category: .colorNegative,
            bestUse: "Low-light portraits with body.",
            contrast: 1.1, saturation: 1.02, temperatureShiftK: 150,
            highlightRecovery: 0.2, shadowLift: 0.06, grainAmount: 0.32,
            vignetteAmount: 0.14, toneCurve: FilmRecipe.Curves.filmS,
            rgbBalance: SIMD3<Float>(1.04, 1.0, 0.97), defaultUnlock: .endOfWeek),

        FilmRecipe(
            id: "night-portrait-800", displayName: "Night Portrait 800",
            inspiration: "High-ISO tungsten night", category: .colorNegative,
            bestUse: "City nights and neon.",
            contrast: 1.08, saturation: 1.05, temperatureShiftK: 350,
            shadowLift: 0.05, grainAmount: 0.4, vignetteAmount: 0.2,
            toneCurve: FilmRecipe.Curves.filmS, halation: 0.25, bloom: 0.2,
            rgbBalance: SIMD3<Float>(1.06, 1.0, 0.92)),

        // MARK: - Slide
        FilmRecipe(
            id: "ultra-vivid-100", displayName: "Ultra Vivid 100",
            inspiration: "Fujifilm Velvia 100", category: .slide,
            bestUse: "Punchy, saturated landscapes.",
            contrast: 1.2, saturation: 1.35, temperatureShiftK: -40,
            grainAmount: 0.12, vignetteAmount: 0.15, fade: 0,
            toneCurve: FilmRecipe.Curves.punchy, colorChrome: 0.3,
            rgbBalance: SIMD3<Float>(1.0, 1.02, 1.02)),

        FilmRecipe(
            id: "clean-slide-100", displayName: "Clean Slide 100",
            inspiration: "Fujifilm Provia 100F", category: .slide,
            bestUse: "Accurate, clean color.",
            contrast: 1.08, saturation: 1.1, grainAmount: 0.1,
            vignetteAmount: 0.08, toneCurve: FilmRecipe.Curves.filmS,
            colorChrome: 0.15),

        FilmRecipe(
            id: "balanced-chrome", displayName: "Balanced Chrome",
            inspiration: "Kodak E100", category: .slide,
            bestUse: "Balanced everyday slide.",
            contrast: 1.06, saturation: 1.05, grainAmount: 0.12,
            vignetteAmount: 0.1, toneCurve: FilmRecipe.Curves.filmS),

        FilmRecipe(
            id: "pushed-chrome", displayName: "Pushed Chrome",
            inspiration: "Pushed E6", category: .slide,
            bestUse: "Contrasty, vivid editorial.",
            contrast: 1.18, saturation: 1.15, grainAmount: 0.2,
            vignetteAmount: 0.16, toneCurve: FilmRecipe.Curves.punchy,
            colorChrome: 0.2),

        FilmRecipe(
            id: "vivid-landscape", displayName: "Vivid Landscape",
            inspiration: "Fujifilm Velvia 50", category: .slide,
            bestUse: "Dramatic nature greens and blues.",
            contrast: 1.22, saturation: 1.4, temperatureShiftK: -60,
            grainAmount: 0.1, vignetteAmount: 0.18,
            toneCurve: FilmRecipe.Curves.punchy, colorChrome: 0.35,
            rgbBalance: SIMD3<Float>(0.99, 1.03, 1.02)),

        FilmRecipe(
            id: "soft-slide", displayName: "Soft Slide",
            inspiration: "Fujifilm Astia 100F", category: .slide,
            bestUse: "Gentle slide for skin.",
            contrast: 0.98, saturation: 1.0, grainAmount: 0.12,
            vignetteAmount: 0.08, fade: 0.06, toneCurve: FilmRecipe.Curves.softHi),

        // MARK: - More color negative / consumer
        FilmRecipe(
            id: "pastel-pro-400", displayName: "Pastel Pro 400",
            inspiration: "Pastel pro negative", category: .colorNegative,
            bestUse: "Muted pastel editorial.",
            contrast: 0.95, saturation: 0.9, temperatureShiftK: 120,
            shadowLift: 0.14, grainAmount: 0.22, vignetteAmount: 0.08,
            fade: 0.15, toneCurve: FilmRecipe.Curves.faded,
            rgbBalance: SIMD3<Float>(1.03, 1.0, 0.99)),

        FilmRecipe(
            id: "reportage-chrome", displayName: "Reportage Chrome",
            inspiration: "Reportage slide", category: .slide,
            bestUse: "Documentary color with bite.",
            contrast: 1.08, saturation: 1.05, grainAmount: 0.18,
            vignetteAmount: 0.12, toneCurve: FilmRecipe.Curves.filmS),

        FilmRecipe(
            id: "memory-negative", displayName: "Memory Negative",
            inspiration: "Expired consumer negative", category: .colorNegative,
            bestUse: "Nostalgic faded memories.",
            contrast: 0.98, saturation: 0.92, temperatureShiftK: 280,
            shadowLift: 0.16, grainAmount: 0.3, vignetteAmount: 0.2,
            fade: 0.2, toneCurve: FilmRecipe.Curves.faded,
            rgbBalance: SIMD3<Float>(1.05, 1.0, 0.94)),

        FilmRecipe(
            id: "amber-nostalgia", displayName: "Amber Nostalgia",
            inspiration: "Warm aged print", category: .colorNegative,
            bestUse: "Golden-hour nostalgia.",
            contrast: 1.02, saturation: 1.0, temperatureShiftK: 400,
            tintShift: 4, shadowLift: 0.1, grainAmount: 0.26,
            vignetteAmount: 0.16, fade: 0.15, halation: 0.2,
            toneCurve: FilmRecipe.Curves.filmS,
            rgbBalance: SIMD3<Float>(1.08, 1.0, 0.9)),

        // MARK: - Cine
        FilmRecipe(
            id: "cinema-still", displayName: "Cinema Still",
            inspiration: "Tungsten cine in daylight", category: .cine,
            bestUse: "Cinematic stills with halation.",
            contrast: 1.05, saturation: 0.98, temperatureShiftK: -150,
            shadowLift: 0.08, grainAmount: 0.3, vignetteAmount: 0.16,
            toneCurve: FilmRecipe.Curves.filmS, halation: 0.3, bloom: 0.2,
            rgbBalance: SIMD3<Float>(0.98, 1.0, 1.05)),

        FilmRecipe(
            id: "tungsten-halo", displayName: "Tungsten Halo",
            inspiration: "Tungsten-balanced cine", category: .cine,
            bestUse: "Cool nights with glowing lights.",
            contrast: 1.06, saturation: 0.96, temperatureShiftK: -220,
            grainAmount: 0.28, vignetteAmount: 0.18,
            toneCurve: FilmRecipe.Curves.filmS, halation: 0.35, bloom: 0.25,
            rgbBalance: SIMD3<Float>(0.95, 1.0, 1.08)),

        // MARK: - Experimental
        FilmRecipe(
            id: "cross-process-slide", displayName: "Cross Process Slide",
            inspiration: "E6 in C41", category: .experimental,
            bestUse: "Bold, shifted experimental color.",
            contrast: 1.25, saturation: 1.2, temperatureShiftK: -120,
            tintShift: -12, grainAmount: 0.26, vignetteAmount: 0.22,
            toneCurve: FilmRecipe.Curves.punchy, colorChrome: 0.4,
            rgbBalance: SIMD3<Float>(0.95, 1.08, 0.98)),

        // MARK: - Black & white
        FilmRecipe(
            id: "street-mono-400", displayName: "Street Mono 400",
            inspiration: "Kodak Tri-X 400", category: .blackAndWhite,
            bestUse: "Gritty street reportage.",
            contrast: 1.1, grainAmount: 0.35, vignetteAmount: 0.16,
            toneCurve: FilmRecipe.Curves.filmS, lumaWeights: LumaPreset.panchromatic),

        FilmRecipe(
            id: "pushed-street-mono", displayName: "Pushed Street Mono",
            inspiration: "Tri-X pushed to 1600", category: .blackAndWhite,
            bestUse: "High-contrast, grainy night street.",
            contrast: 1.25, grainAmount: 0.5, grainSize: 0.65,
            vignetteAmount: 0.2, toneCurve: FilmRecipe.Curves.punchy,
            lumaWeights: LumaPreset.panchromatic, defaultUnlock: .endOfWeek),

        FilmRecipe(
            id: "classic-reporter", displayName: "Classic Reporter",
            inspiration: "Ilford HP5 Plus", category: .blackAndWhite,
            bestUse: "Timeless documentary B&W.",
            contrast: 1.08, grainAmount: 0.32, vignetteAmount: 0.14,
            toneCurve: FilmRecipe.Curves.filmS, lumaWeights: LumaPreset.panchromatic),

        FilmRecipe(
            id: "pushed-reporter", displayName: "Pushed Reporter",
            inspiration: "HP5 pushed", category: .blackAndWhite,
            bestUse: "Moody pushed reportage.",
            contrast: 1.2, grainAmount: 0.45, grainSize: 0.6,
            vignetteAmount: 0.18, toneCurve: FilmRecipe.Curves.punchy,
            lumaWeights: LumaPreset.panchromatic),

        FilmRecipe(
            id: "fine-detail-mono", displayName: "Fine Detail Mono",
            inspiration: "Kodak T-Max 100", category: .blackAndWhite,
            bestUse: "Crisp, fine-grained detail.",
            contrast: 1.05, grainAmount: 0.12, grainSize: 0.3,
            vignetteAmount: 0.1, sharpen: 0.4, toneCurve: FilmRecipe.Curves.filmS,
            lumaWeights: LumaPreset.neutral),

        FilmRecipe(
            id: "clean-delta-mono", displayName: "Clean Delta Mono",
            inspiration: "Ilford Delta 100", category: .blackAndWhite,
            bestUse: "Clean, smooth monochrome.",
            contrast: 1.06, grainAmount: 0.14, grainSize: 0.35,
            vignetteAmount: 0.1, sharpen: 0.2, toneCurve: FilmRecipe.Curves.filmS,
            lumaWeights: LumaPreset.neutral),

        FilmRecipe(
            id: "available-light-mono", displayName: "Available Light Mono",
            inspiration: "Ilford Delta 3200", category: .blackAndWhite,
            bestUse: "Atmospheric high-ISO available light.",
            contrast: 1.15, grainAmount: 0.55, grainSize: 0.7,
            vignetteAmount: 0.2, toneCurve: FilmRecipe.Curves.filmS,
            lumaWeights: LumaPreset.panchromatic),

        FilmRecipe(
            id: "precision-mono-100", displayName: "Precision Mono 100",
            inspiration: "Ilford Pan F Plus", category: .blackAndWhite,
            bestUse: "Ultra-fine studio monochrome.",
            contrast: 1.1, grainAmount: 0.1, grainSize: 0.25,
            vignetteAmount: 0.08, sharpen: 0.5, toneCurve: FilmRecipe.Curves.punchy,
            lumaWeights: LumaPreset.redFilter),

        FilmRecipe(
            id: "smooth-c41-mono", displayName: "Smooth C41 Mono",
            inspiration: "Ilford XP2 Super", category: .blackAndWhite,
            bestUse: "Smooth tonal C41 black & white.",
            contrast: 1.0, grainAmount: 0.2, grainSize: 0.45,
            vignetteAmount: 0.1, toneCurve: FilmRecipe.Curves.softHi,
            lumaWeights: LumaPreset.greenFilter),

        FilmRecipe(
            id: "deep-tone-acros", displayName: "Deep Tone Acros",
            inspiration: "Fujifilm Acros 100", category: .blackAndWhite,
            bestUse: "Deep blacks and dramatic skies.",
            contrast: 1.12, grainAmount: 0.16, grainSize: 0.35,
            vignetteAmount: 0.14, sharpen: 0.3, toneCurve: FilmRecipe.Curves.punchy,
            lumaWeights: LumaPreset.redFilter)
    ]

    /// The default recipe used when a roll is created without an explicit choice.
    static var `default`: FilmRecipe { all[0] }

    /// Looks up a recipe by its stable slug.
    static func recipe(for id: String) -> FilmRecipe? {
        all.first { $0.id == id }
    }
}
