import Foundation
import CoreGraphics
import simd

/// Film-stock family, used for grouping and to pick the rendering path.
enum FilmCategory: String, Codable, Hashable, CaseIterable, Sendable {
    case colorNegative
    case slide
    case cine
    case instant
    case blackAndWhite
    case experimental

    var displayName: String {
        switch self {
        case .colorNegative: return "Color Negative"
        case .slide:         return "Slide"
        case .cine:          return "Cine"
        case .instant:       return "Instant"
        case .blackAndWhite: return "Black & White"
        case .experimental:  return "Experimental"
        }
    }
}

/// A deterministic, versioned description of a film-inspired look.
///
/// Pure `Codable` data — no `CIFilter`s, no platform image types — so recipes
/// are serializable (built-in + custom), deterministic, and unit-testable.
/// ``FilmRenderer`` consumes a recipe and produces the processed image.
///
/// ### Naming
/// User-facing names (`displayName`/`publicName`) are deliberately brand-safe.
/// `inspiration` records the internal reference stock for development only and
/// is never shown to users.
///
/// ### Versioning
/// `version` is bumped when the rendering math for a recipe changes. Each
/// ``CapturedFrame`` records the version it was developed with, so a revealed
/// photo always matches its capture moment even if the catalog later evolves.
struct FilmRecipe: Codable, Hashable, Identifiable, Sendable {

    // MARK: Identity
    var id: String
    /// User-facing name shown in the app (brand-safe).
    var displayName: String
    /// Stable public/API name (brand-safe); usually equals `displayName`.
    var publicName: String
    /// Internal reference stock — development only, never surfaced.
    var inspiration: String
    var category: FilmCategory
    var bestUse: String

    // MARK: Tone / exposure
    var ev: Float
    var contrast: Float          // CIColorControls contrast (1 = neutral)
    var saturation: Float        // CIColorControls saturation (1 = neutral)
    var temperatureShiftK: Float // +warm / −cool, in Kelvin
    var tintShift: Float         // green ↔ magenta
    var highlightRecovery: Float // 0…1
    var shadowLift: Float        // 0…1

    // MARK: Texture
    var grainAmount: Float       // 0…1
    var grainSize: Float         // 0…1
    var vignetteAmount: Float    // 0…1
    var vignetteRadius: Float
    var fade: Float              // matte black-lift 0…1
    var sharpen: Float           // 0…1
    var blur: Float              // px radius (soft focus)

    // MARK: Color shaping
    var toneCurve: [CGPoint]     // control points in unit square
    var rgbBalance: SIMD3<Float> // per-channel multiplier
    var basePreset: String?      // parent recipe id (for custom/derived)
    var lumaWeights: SIMD3<Float>? // B&W channel mix; nil = use category default
    var colorChrome: Float       // vibrance-like boost 0…1
    var lightLeak: Float         // 0…1 (composited, optional)
    var halation: Float          // 0…1 (highlight glow, optional)
    var bloom: Float             // 0…1

    // MARK: Print
    var borderStyle: String      // "none", "white", "instant", …
    var dateStampStyle: String   // "none", "classic", …

    // MARK: Roll defaults
    var defaultFrames: Int
    var defaultUnlock: DevelopmentSchedule
    var version: Int

    /// `true` for grayscale stocks — selects the monochrome rendering path.
    var isMonochrome: Bool { category == .blackAndWhite }

    /// One-line evocative description for cards (derived).
    var summary: String { bestUse }

    init(
        id: String,
        displayName: String,
        publicName: String? = nil,
        inspiration: String = "",
        category: FilmCategory,
        bestUse: String,
        ev: Float = 0,
        contrast: Float = 1.0,
        saturation: Float = 1.0,
        temperatureShiftK: Float = 0,
        tintShift: Float = 0,
        highlightRecovery: Float = 0,
        shadowLift: Float = 0,
        grainAmount: Float = 0.2,
        grainSize: Float = 0.5,
        vignetteAmount: Float = 0.1,
        vignetteRadius: Float = 1.5,
        fade: Float = 0,
        sharpen: Float = 0,
        blur: Float = 0,
        toneCurve: [CGPoint] = [CGPoint(x: 0, y: 0), CGPoint(x: 1, y: 1)],
        rgbBalance: SIMD3<Float> = SIMD3<Float>(1, 1, 1),
        basePreset: String? = nil,
        lumaWeights: SIMD3<Float>? = nil,
        colorChrome: Float = 0,
        lightLeak: Float = 0,
        halation: Float = 0,
        bloom: Float = 0,
        borderStyle: String = "none",
        dateStampStyle: String = "none",
        defaultFrames: Int = 27,
        defaultUnlock: DevelopmentSchedule = .endOfMonth,
        version: Int = 1
    ) {
        self.id = id
        self.displayName = displayName
        self.publicName = publicName ?? displayName
        self.inspiration = inspiration
        self.category = category
        self.bestUse = bestUse
        self.ev = ev
        self.contrast = contrast
        self.saturation = saturation
        self.temperatureShiftK = temperatureShiftK
        self.tintShift = tintShift
        self.highlightRecovery = highlightRecovery
        self.shadowLift = shadowLift
        self.grainAmount = grainAmount
        self.grainSize = grainSize
        self.vignetteAmount = vignetteAmount
        self.vignetteRadius = vignetteRadius
        self.fade = fade
        self.sharpen = sharpen
        self.blur = blur
        self.toneCurve = toneCurve
        self.rgbBalance = rgbBalance
        self.basePreset = basePreset
        self.lumaWeights = lumaWeights
        self.colorChrome = colorChrome
        self.lightLeak = lightLeak
        self.halation = halation
        self.bloom = bloom
        self.borderStyle = borderStyle
        self.dateStampStyle = dateStampStyle
        self.defaultFrames = defaultFrames
        self.defaultUnlock = defaultUnlock
        self.version = version
    }
}

// MARK: - Shared tone-curve presets

extension FilmRecipe {
    /// Common control-point sets reused across the catalog.
    enum Curves {
        static let linear  = [CGPoint(x: 0, y: 0), CGPoint(x: 1, y: 1)]
        static let filmS   = [CGPoint(x: 0, y: 0.03), CGPoint(x: 0.25, y: 0.20),
                              CGPoint(x: 0.5, y: 0.5), CGPoint(x: 0.75, y: 0.80),
                              CGPoint(x: 1, y: 0.97)]
        static let punchy  = [CGPoint(x: 0, y: 0.0), CGPoint(x: 0.25, y: 0.16),
                              CGPoint(x: 0.5, y: 0.5), CGPoint(x: 0.75, y: 0.85),
                              CGPoint(x: 1, y: 1.0)]
        static let faded   = [CGPoint(x: 0, y: 0.10), CGPoint(x: 0.25, y: 0.26),
                              CGPoint(x: 0.5, y: 0.5), CGPoint(x: 0.75, y: 0.74),
                              CGPoint(x: 1, y: 0.92)]
        static let softHi  = [CGPoint(x: 0, y: 0.04), CGPoint(x: 0.25, y: 0.24),
                              CGPoint(x: 0.5, y: 0.52), CGPoint(x: 0.75, y: 0.78),
                              CGPoint(x: 1, y: 0.94)]
    }

    /// Standard Rec.709 luma weights for the monochrome path.
    static let defaultLuma = SIMD3<Float>(0.2126, 0.7152, 0.0722)
}
