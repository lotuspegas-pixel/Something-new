import Foundation
import CoreGraphics
import simd

/// The source of truth for the 30 built-in film recipes.
///
/// Values are the calibrated engineering starting points from the project's
/// parameter table (PROMPT 3) — based on analog film characteristics, **not**
/// official manufacturer LUTs. User-facing names are brand-safe; `inspiration`
/// records the internal reference for development only.
enum FilmRecipeCatalog {

    /// Builds a `[CGPoint]` tone curve from five Y values at X = 0, .25, .5, .75, 1.
    private static func curve(_ y: [Double]) -> [CGPoint] {
        let x: [Double] = [0, 0.25, 0.5, 0.75, 1.0]
        return zip(x, y).map { CGPoint(x: $0, y: $1) }
    }

    private static func rgb(_ r: Float, _ g: Float, _ b: Float) -> SIMD3<Float> {
        SIMD3<Float>(r, g, b)
    }

    static let all: [FilmRecipe] = [
        // R01
        FilmRecipe(
            id: "gold-daylight", displayName: "Gold Daylight",
            inspiration: "Warm consumer ISO 200 color negative film",
            category: .colorNegative, bestUse: "Family, daylight, travel",
            ev: -0.10, contrast: 1.06, saturation: 1.12, temperatureShiftK: 180, tintShift: 4,
            highlightRecovery: 0.26, shadowLift: 0.12, grainAmount: 0.18, grainSize: 0.85,
            vignetteAmount: 0.22, vignetteRadius: 1.05, fade: 0.10, sharpen: 0.18, blur: 0,
            toneCurve: curve([0.02, 0.26, 0.53, 0.80, 0.98]), rgbBalance: rgb(1.03, 1.00, 0.95),
            colorBase: .consumerWarmCN, colorChrome: 0.10, lightLeak: 0, halation: 0, bloom: 0.02,
            borderStyle: "none", dateStampStyle: "orange70s", defaultFrames: 27, defaultUnlock: .endOfWeek),
        // R02
        FilmRecipe(
            id: "everyday-max-400", displayName: "Everyday Max 400",
            inspiration: "High-speed consumer ISO 400 color negative film",
            category: .colorNegative, bestUse: "Street, family, everyday",
            ev: -0.05, contrast: 1.10, saturation: 1.16, temperatureShiftK: 120, tintShift: 2,
            highlightRecovery: 0.22, shadowLift: 0.15, grainAmount: 0.28, grainSize: 1.05,
            vignetteAmount: 0.20, vignetteRadius: 1.00, fade: 0.08, sharpen: 0.22, blur: 0,
            toneCurve: curve([0.02, 0.25, 0.52, 0.79, 0.98]), rgbBalance: rgb(1.02, 1.00, 0.97),
            colorBase: .consumerWarmCN, colorChrome: 0.12, lightLeak: 0, halation: 0, bloom: 0.03,
            borderStyle: "none", dateStampStyle: "amber80s", defaultFrames: 27, defaultUnlock: .endOfWeek),
        // R03
        FilmRecipe(
            id: "disposable-flash-800", displayName: "Disposable Flash 800",
            inspiration: "Single-use flash camera with ISO 800 film",
            category: .colorNegative, bestUse: "Parties, flash, kids, snapshots",
            ev: 0.10, contrast: 1.18, saturation: 1.20, temperatureShiftK: 220, tintShift: 6,
            highlightRecovery: 0.18, shadowLift: 0.18, grainAmount: 0.48, grainSize: 1.80,
            vignetteAmount: 0.38, vignetteRadius: 0.92, fade: 0.16, sharpen: 0.10, blur: 0.25,
            toneCurve: curve([0.05, 0.27, 0.53, 0.82, 0.98]), rgbBalance: rgb(1.04, 1.00, 0.94),
            colorBase: .consumerLoFi, colorChrome: 0.14, lightLeak: 0.14, halation: 0.06, bloom: 0.10,
            borderStyle: "whiteThin", dateStampStyle: "redLED", defaultFrames: 27, defaultUnlock: .endOfWeek),
        // R04
        FilmRecipe(
            id: "soft-portrait-160", displayName: "Soft Portrait 160",
            inspiration: "Fine-grain professional portrait film",
            category: .colorNegative, bestUse: "Portraits, soft daylight, family",
            ev: -0.15, contrast: 0.94, saturation: 0.92, temperatureShiftK: 140, tintShift: 3,
            highlightRecovery: 0.32, shadowLift: 0.20, grainAmount: 0.10, grainSize: 0.70,
            vignetteAmount: 0.14, vignetteRadius: 1.10, fade: 0.12, sharpen: 0.10, blur: 0,
            toneCurve: curve([0.04, 0.28, 0.54, 0.77, 0.97]), rgbBalance: rgb(1.02, 1.00, 0.99),
            colorBase: .portraitCN, colorChrome: 0.08, lightLeak: 0, halation: 0, bloom: 0.04,
            borderStyle: "none", dateStampStyle: "off", defaultFrames: 36, defaultUnlock: .endOfMonth),
        // R05
        FilmRecipe(
            id: "open-shade-400", displayName: "Open Shade 400",
            inspiration: "Flexible professional ISO 400 portrait film",
            category: .colorNegative, bestUse: "Portraits, travel, cloudy daylight",
            ev: -0.10, contrast: 1.00, saturation: 1.00, temperatureShiftK: 110, tintShift: 2,
            highlightRecovery: 0.30, shadowLift: 0.18, grainAmount: 0.12, grainSize: 0.75,
            vignetteAmount: 0.16, vignetteRadius: 1.08, fade: 0.09, sharpen: 0.12, blur: 0,
            toneCurve: curve([0.03, 0.27, 0.53, 0.78, 0.98]), rgbBalance: rgb(1.02, 1.00, 0.98),
            colorBase: .portraitCN, colorChrome: 0.10, lightLeak: 0, halation: 0, bloom: 0.04,
            borderStyle: "none", dateStampStyle: "off", defaultFrames: 36, defaultUnlock: .endOfMonth),
        // R06
        FilmRecipe(
            id: "portrait-push-800", displayName: "Portrait Push 800",
            inspiration: "Pushed professional portrait negative",
            category: .colorNegative, bestUse: "Evening portraits, indoor available light",
            ev: 0.18, contrast: 1.08, saturation: 1.00, temperatureShiftK: 90, tintShift: 2,
            highlightRecovery: 0.22, shadowLift: 0.14, grainAmount: 0.28, grainSize: 1.10,
            vignetteAmount: 0.20, vignetteRadius: 1.00, fade: 0.07, sharpen: 0.12, blur: 0,
            toneCurve: curve([0.02, 0.23, 0.49, 0.81, 0.99]), rgbBalance: rgb(1.02, 1.00, 0.98),
            colorBase: .portraitCN, colorChrome: 0.12, lightLeak: 0, halation: 0.02, bloom: 0.04,
            borderStyle: "none", dateStampStyle: "off", defaultFrames: 27, defaultUnlock: .endOfMonth),
        // R07
        FilmRecipe(
            id: "night-portrait-800", displayName: "Night Portrait 800",
            inspiration: "High-speed professional portrait film",
            category: .colorNegative, bestUse: "Night portraits, mixed light, restaurants",
            ev: 0.15, contrast: 1.04, saturation: 1.02, temperatureShiftK: 100, tintShift: 2,
            highlightRecovery: 0.24, shadowLift: 0.16, grainAmount: 0.30, grainSize: 1.20,
            vignetteAmount: 0.18, vignetteRadius: 1.02, fade: 0.08, sharpen: 0.10, blur: 0,
            toneCurve: curve([0.03, 0.25, 0.51, 0.79, 0.98]), rgbBalance: rgb(1.02, 1.00, 0.98),
            colorBase: .portraitCN, colorChrome: 0.10, lightLeak: 0.04, halation: 0.04, bloom: 0.06,
            borderStyle: "none", dateStampStyle: "off", defaultFrames: 27, defaultUnlock: .endOfWeek),
        // R08
        FilmRecipe(
            id: "ultra-vivid-100", displayName: "Ultra Vivid 100",
            inspiration: "Ultra-vivid fine-grain color negative film",
            category: .colorNegative, bestUse: "Landscapes, products, colorful scenes",
            ev: -0.08, contrast: 1.14, saturation: 1.25, temperatureShiftK: -20, tintShift: -2,
            highlightRecovery: 0.28, shadowLift: 0.14, grainAmount: 0.08, grainSize: 0.70,
            vignetteAmount: 0.20, vignetteRadius: 1.08, fade: 0.02, sharpen: 0.28, blur: 0,
            toneCurve: curve([0.01, 0.22, 0.51, 0.82, 0.99]), rgbBalance: rgb(1.05, 1.00, 0.96),
            colorBase: .slideVivid, colorChrome: 0.18, lightLeak: 0, halation: 0, bloom: 0.02,
            borderStyle: "none", dateStampStyle: "off", defaultFrames: 27, defaultUnlock: .endOfQuarter),
        // R09
        FilmRecipe(
            id: "clean-slide-100", displayName: "Clean Slide 100",
            inspiration: "Neutral E-6 slide film",
            category: .slide, bestUse: "Travel, editorial, clean daylight",
            ev: -0.05, contrast: 1.02, saturation: 1.08, temperatureShiftK: -40, tintShift: -2,
            highlightRecovery: 0.26, shadowLift: 0.18, grainAmount: 0.06, grainSize: 0.60,
            vignetteAmount: 0.16, vignetteRadius: 1.15, fade: 0.00, sharpen: 0.24, blur: 0,
            toneCurve: curve([0.00, 0.24, 0.51, 0.80, 0.99]), rgbBalance: rgb(1.01, 1.00, 1.00),
            colorBase: .slideNeutral, colorChrome: 0.12, lightLeak: 0, halation: 0, bloom: 0.01,
            borderStyle: "slideMount", dateStampStyle: "whiteSimple", defaultFrames: 36, defaultUnlock: .endOfMonth),
        // R10
        FilmRecipe(
            id: "balanced-chrome", displayName: "Balanced Chrome",
            inspiration: "Neutral balanced chrome film",
            category: .slide, bestUse: "All-round, nature, documentary",
            ev: -0.05, contrast: 1.00, saturation: 1.02, temperatureShiftK: -10, tintShift: 0,
            highlightRecovery: 0.24, shadowLift: 0.16, grainAmount: 0.08, grainSize: 0.65,
            vignetteAmount: 0.14, vignetteRadius: 1.14, fade: 0.00, sharpen: 0.20, blur: 0,
            toneCurve: curve([0.00, 0.25, 0.51, 0.79, 0.99]), rgbBalance: rgb(1.00, 1.00, 1.00),
            colorBase: .slideNeutral, colorChrome: 0.10, lightLeak: 0, halation: 0, bloom: 0.01,
            borderStyle: "none", dateStampStyle: "off", defaultFrames: 36, defaultUnlock: .endOfMonth),
        // R11
        FilmRecipe(
            id: "pushed-chrome", displayName: "Pushed Chrome",
            inspiration: "Pushed slide film",
            category: .slide, bestUse: "City, night, contrast scenes",
            ev: 0.20, contrast: 1.15, saturation: 1.05, temperatureShiftK: -30, tintShift: 0,
            highlightRecovery: 0.18, shadowLift: 0.12, grainAmount: 0.22, grainSize: 0.95,
            vignetteAmount: 0.20, vignetteRadius: 0.98, fade: 0.00, sharpen: 0.18, blur: 0,
            toneCurve: curve([0.00, 0.22, 0.48, 0.82, 1.00]), rgbBalance: rgb(1.00, 1.00, 1.00),
            colorBase: .slideNeutral, colorChrome: 0.12, lightLeak: 0, halation: 0.01, bloom: 0.02,
            borderStyle: "none", dateStampStyle: "off", defaultFrames: 27, defaultUnlock: .endOfWeek),
        // R12
        FilmRecipe(
            id: "vivid-landscape", displayName: "Vivid Landscape",
            inspiration: "High-saturation landscape slide film",
            category: .slide, bestUse: "Landscape, ocean, autumn, dramatic sky",
            ev: -0.12, contrast: 1.24, saturation: 1.34, temperatureShiftK: -80, tintShift: -4,
            highlightRecovery: 0.20, shadowLift: 0.10, grainAmount: 0.10, grainSize: 0.70,
            vignetteAmount: 0.24, vignetteRadius: 1.04, fade: 0.00, sharpen: 0.26, blur: 0,
            toneCurve: curve([0.00, 0.20, 0.49, 0.84, 1.00]), rgbBalance: rgb(1.00, 1.01, 0.98),
            colorBase: .slideVivid, colorChrome: 0.22, lightLeak: 0, halation: 0, bloom: 0.02,
            borderStyle: "none", dateStampStyle: "off", defaultFrames: 27, defaultUnlock: .endOfQuarter),
        // R13
        FilmRecipe(
            id: "soft-slide", displayName: "Soft Slide",
            inspiration: "Soft contrast portrait slide film",
            category: .slide, bestUse: "Portraits outdoors, soft sunlight",
            ev: -0.10, contrast: 0.95, saturation: 0.98, temperatureShiftK: 60, tintShift: 2,
            highlightRecovery: 0.30, shadowLift: 0.20, grainAmount: 0.08, grainSize: 0.65,
            vignetteAmount: 0.14, vignetteRadius: 1.10, fade: 0.04, sharpen: 0.14, blur: 0,
            toneCurve: curve([0.03, 0.28, 0.54, 0.77, 0.98]), rgbBalance: rgb(1.01, 1.00, 0.99),
            colorBase: .slideNeutral, colorChrome: 0.08, lightLeak: 0, halation: 0, bloom: 0.04,
            borderStyle: "none", dateStampStyle: "off", defaultFrames: 36, defaultUnlock: .endOfMonth),
        // R14
        FilmRecipe(
            id: "pastel-pro-400", displayName: "Pastel Pro 400",
            inspiration: "Pastel professional color negative film",
            category: .colorNegative, bestUse: "Weddings, portraits, overcast light",
            ev: -0.08, contrast: 0.92, saturation: 0.90, temperatureShiftK: -60, tintShift: 1,
            highlightRecovery: 0.36, shadowLift: 0.22, grainAmount: 0.10, grainSize: 0.70,
            vignetteAmount: 0.12, vignetteRadius: 1.12, fade: 0.12, sharpen: 0.10, blur: 0,
            toneCurve: curve([0.05, 0.30, 0.55, 0.76, 0.97]), rgbBalance: rgb(0.99, 1.00, 1.02),
            colorBase: .fujiPastel, colorChrome: 0.08, lightLeak: 0, halation: 0, bloom: 0.05,
            borderStyle: "none", dateStampStyle: "off", defaultFrames: 36, defaultUnlock: .endOfMonth),
        // R15
        FilmRecipe(
            id: "reportage-chrome", displayName: "Reportage Chrome",
            inspiration: "Subdued documentary film simulation",
            category: .slide, bestUse: "Street, documentary, interiors",
            ev: -0.12, contrast: 1.08, saturation: 0.88, temperatureShiftK: -90, tintShift: 4,
            highlightRecovery: 0.24, shadowLift: 0.10, grainAmount: 0.14, grainSize: 0.85,
            vignetteAmount: 0.18, vignetteRadius: 1.02, fade: 0.05, sharpen: 0.20, blur: 0,
            toneCurve: curve([0.01, 0.24, 0.50, 0.77, 0.98]), rgbBalance: rgb(0.98, 1.00, 1.03),
            colorBase: .docChrome, colorChrome: 0.18, lightLeak: 0, halation: 0, bloom: 0.02,
            borderStyle: "none", dateStampStyle: "whiteSmall", defaultFrames: 27, defaultUnlock: .endOfWeek),
        // R16
        FilmRecipe(
            id: "memory-negative", displayName: "Memory Negative",
            inspiration: "Punchy consumer negative film simulation",
            category: .colorNegative, bestUse: "Snapshots, street, nostalgia",
            ev: -0.02, contrast: 1.18, saturation: 0.96, temperatureShiftK: -120, tintShift: 6,
            highlightRecovery: 0.16, shadowLift: 0.08, grainAmount: 0.24, grainSize: 1.05,
            vignetteAmount: 0.24, vignetteRadius: 0.96, fade: 0.14, sharpen: 0.14, blur: 0,
            toneCurve: curve([0.04, 0.23, 0.50, 0.81, 0.99]), rgbBalance: rgb(0.98, 1.00, 1.04),
            colorBase: .consumerLoFi, colorChrome: 0.20, lightLeak: 0, halation: 0.02, bloom: 0.03,
            borderStyle: "whiteFull", dateStampStyle: "orange88", defaultFrames: 27, defaultUnlock: .endOfWeek),
        // R17
        FilmRecipe(
            id: "amber-nostalgia", displayName: "Amber Nostalgia",
            inspiration: "Warm nostalgic negative film simulation",
            category: .colorNegative, bestUse: "Golden hour, family, portraits",
            ev: -0.02, contrast: 1.04, saturation: 0.98, temperatureShiftK: 240, tintShift: 8,
            highlightRecovery: 0.20, shadowLift: 0.14, grainAmount: 0.14, grainSize: 0.80,
            vignetteAmount: 0.18, vignetteRadius: 1.05, fade: 0.10, sharpen: 0.10, blur: 0,
            toneCurve: curve([0.03, 0.26, 0.52, 0.79, 0.98]), rgbBalance: rgb(1.04, 1.00, 0.96),
            colorBase: .nostalgicAmber, colorChrome: 0.14, lightLeak: 0, halation: 0.01, bloom: 0.05,
            borderStyle: "none", dateStampStyle: "amber90s", defaultFrames: 36, defaultUnlock: .endOfMonth),
        // R18
        FilmRecipe(
            id: "cinema-still", displayName: "Cinema Still",
            inspiration: "Low-saturation cinema negative profile",
            category: .cine, bestUse: "Cinematic stills, moody scenes, video-like frames",
            ev: -0.18, contrast: 0.88, saturation: 0.82, temperatureShiftK: -70, tintShift: 0,
            highlightRecovery: 0.40, shadowLift: 0.24, grainAmount: 0.06, grainSize: 0.60,
            vignetteAmount: 0.10, vignetteRadius: 1.18, fade: 0.02, sharpen: 0.06, blur: 0,
            toneCurve: curve([0.00, 0.30, 0.54, 0.74, 0.96]), rgbBalance: rgb(0.99, 1.00, 1.01),
            colorBase: .cinemaFlat, colorChrome: 0.08, lightLeak: 0, halation: 0.02, bloom: 0.03,
            borderStyle: "16x9Matte", dateStampStyle: "off", defaultFrames: 24, defaultUnlock: .endOfMonth),
        // R19
        FilmRecipe(
            id: "tungsten-halo", displayName: "Tungsten Halo",
            inspiration: "Tungsten-balanced cinema color negative with halation",
            category: .cine, bestUse: "Night, neon, tungsten, city",
            ev: 0.10, contrast: 1.02, saturation: 0.94, temperatureShiftK: -260, tintShift: -8,
            highlightRecovery: 0.22, shadowLift: 0.16, grainAmount: 0.22, grainSize: 1.15,
            vignetteAmount: 0.16, vignetteRadius: 1.02, fade: 0.02, sharpen: 0.10, blur: 0,
            toneCurve: curve([0.01, 0.25, 0.50, 0.79, 0.98]), rgbBalance: rgb(0.96, 1.00, 1.06),
            colorBase: .tungstenCine, colorChrome: 0.10, lightLeak: 0.18, halation: 0.18, bloom: 0.08,
            borderStyle: "none", dateStampStyle: "redLED", defaultFrames: 27, defaultUnlock: .endOfWeek),
        // R20
        FilmRecipe(
            id: "cross-process-slide", displayName: "Cross Process Slide",
            inspiration: "Slide film cross-processed in color negative chemistry",
            category: .experimental, bestUse: "Fashion, art, surreal color",
            ev: 0.06, contrast: 1.22, saturation: 1.28, temperatureShiftK: -140, tintShift: 16,
            highlightRecovery: 0.12, shadowLift: 0.08, grainAmount: 0.24, grainSize: 1.00,
            vignetteAmount: 0.22, vignetteRadius: 0.98, fade: 0.04, sharpen: 0.16, blur: 0,
            toneCurve: curve([0.00, 0.20, 0.48, 0.84, 1.00]), rgbBalance: rgb(1.02, 0.99, 1.04),
            colorBase: .xproSlide, colorChrome: 0.20, lightLeak: 0.06, halation: 0.03, bloom: 0.04,
            borderStyle: "whiteThin", dateStampStyle: "whiteSimple", defaultFrames: 27, defaultUnlock: .endOfQuarter),

        // MARK: Black & white (R21–R30)
        // R21
        FilmRecipe(
            id: "street-mono-400", displayName: "Street Mono 400",
            inspiration: "Classic ISO 400 black-and-white street film",
            category: .blackAndWhite, bestUse: "Street, reportage, documentary",
            ev: 0.05, contrast: 1.18, saturation: 0.00, highlightRecovery: 0.12, shadowLift: 0.08,
            grainAmount: 0.42, grainSize: 1.60, vignetteAmount: 0.26, vignetteRadius: 0.98,
            fade: 0.04, sharpen: 0.22, blur: 0,
            toneCurve: curve([0.00, 0.21, 0.48, 0.82, 1.00]),
            lumaWeights: SIMD3<Float>(0.24, 0.67, 0.09),
            defaultFrames: 27, defaultUnlock: .endOfWeek),
        // R22
        FilmRecipe(
            id: "pushed-street-mono", displayName: "Pushed Street Mono",
            inspiration: "Pushed classic ISO 400 black-and-white film",
            category: .blackAndWhite, bestUse: "Night street, concerts, gritty documentary",
            ev: 0.35, contrast: 1.28, saturation: 0.00, highlightRecovery: 0.08, shadowLift: 0.06,
            grainAmount: 0.62, grainSize: 2.10, vignetteAmount: 0.30, vignetteRadius: 0.94,
            fade: 0.02, sharpen: 0.14, blur: 0.18,
            toneCurve: curve([0.00, 0.18, 0.45, 0.84, 1.00]),
            lumaWeights: SIMD3<Float>(0.23, 0.68, 0.09),
            defaultFrames: 27, defaultUnlock: .endOfWeek),
        // R23
        FilmRecipe(
            id: "classic-reporter", displayName: "Classic Reporter",
            inspiration: "Classic medium-contrast ISO 400 black-and-white film",
            category: .blackAndWhite, bestUse: "Journalism, documentary, everyday mono",
            ev: 0.02, contrast: 1.10, saturation: 0.00, highlightRecovery: 0.18, shadowLift: 0.12,
            grainAmount: 0.34, grainSize: 1.35, vignetteAmount: 0.22, vignetteRadius: 1.02,
            fade: 0.06, sharpen: 0.18, blur: 0,
            toneCurve: curve([0.01, 0.24, 0.50, 0.80, 0.99]),
            lumaWeights: SIMD3<Float>(0.25, 0.65, 0.10),
            defaultFrames: 36, defaultUnlock: .endOfMonth),
        // R24
        FilmRecipe(
            id: "pushed-reporter", displayName: "Pushed Reporter",
            inspiration: "Pushed classic reporter film",
            category: .blackAndWhite, bestUse: "Indoor, concert, available light",
            ev: 0.28, contrast: 1.20, saturation: 0.00, highlightRecovery: 0.10, shadowLift: 0.08,
            grainAmount: 0.56, grainSize: 1.90, vignetteAmount: 0.28, vignetteRadius: 0.96,
            fade: 0.04, sharpen: 0.12, blur: 0.15,
            toneCurve: curve([0.00, 0.20, 0.46, 0.84, 1.00]),
            lumaWeights: SIMD3<Float>(0.25, 0.64, 0.11),
            defaultFrames: 27, defaultUnlock: .endOfWeek),
        // R25
        FilmRecipe(
            id: "fine-detail-mono", displayName: "Fine Detail Mono",
            inspiration: "Fine-grain medium-speed traditional black-and-white film",
            category: .blackAndWhite, bestUse: "Architecture, studio, still life",
            ev: -0.04, contrast: 1.04, saturation: 0.00, highlightRecovery: 0.24, shadowLift: 0.14,
            grainAmount: 0.18, grainSize: 0.95, vignetteAmount: 0.18, vignetteRadius: 1.08,
            fade: 0.02, sharpen: 0.24, blur: 0,
            toneCurve: curve([0.00, 0.25, 0.51, 0.79, 0.99]),
            lumaWeights: SIMD3<Float>(0.24, 0.68, 0.08),
            defaultFrames: 36, defaultUnlock: .endOfMonth),
        // R26
        FilmRecipe(
            id: "clean-delta-mono", displayName: "Clean Delta Mono",
            inspiration: "Modern fine-grain tabular black-and-white film",
            category: .blackAndWhite, bestUse: "Fine art, landscape, clean monochrome",
            ev: -0.06, contrast: 1.06, saturation: 0.00, highlightRecovery: 0.26, shadowLift: 0.16,
            grainAmount: 0.16, grainSize: 0.85, vignetteAmount: 0.18, vignetteRadius: 1.08,
            fade: 0.00, sharpen: 0.26, blur: 0,
            toneCurve: curve([0.00, 0.24, 0.51, 0.80, 0.99]),
            lumaWeights: SIMD3<Float>(0.22, 0.70, 0.08),
            defaultFrames: 36, defaultUnlock: .endOfMonth),
        // R27
        FilmRecipe(
            id: "available-light-mono", displayName: "Available Light Mono",
            inspiration: "Ultra-high-speed black-and-white film",
            category: .blackAndWhite, bestUse: "Low light, action, night, indoor",
            ev: 0.26, contrast: 1.14, saturation: 0.00, highlightRecovery: 0.12, shadowLift: 0.14,
            grainAmount: 0.60, grainSize: 2.00, vignetteAmount: 0.24, vignetteRadius: 0.96,
            fade: 0.02, sharpen: 0.12, blur: 0.12,
            toneCurve: curve([0.00, 0.22, 0.47, 0.81, 0.99]),
            lumaWeights: SIMD3<Float>(0.24, 0.67, 0.09),
            defaultFrames: 27, defaultUnlock: .endOfWeek),
        // R28
        FilmRecipe(
            id: "precision-mono-100", displayName: "Precision Mono 100",
            inspiration: "Extremely sharp fine-grain ISO 100 black-and-white film",
            category: .blackAndWhite, bestUse: "Product, detail, architecture",
            ev: -0.08, contrast: 1.08, saturation: 0.00, highlightRecovery: 0.26, shadowLift: 0.12,
            grainAmount: 0.10, grainSize: 0.70, vignetteAmount: 0.16, vignetteRadius: 1.10,
            fade: 0.00, sharpen: 0.30, blur: 0,
            toneCurve: curve([0.00, 0.24, 0.51, 0.80, 1.00]),
            lumaWeights: SIMD3<Float>(0.23, 0.69, 0.08),
            defaultFrames: 36, defaultUnlock: .endOfMonth),
        // R29
        FilmRecipe(
            id: "smooth-c41-mono", displayName: "Smooth C41 Mono",
            inspiration: "C41-process black-and-white film",
            category: .blackAndWhite, bestUse: "Portraits, everyday, smooth monochrome",
            ev: -0.10, contrast: 0.94, saturation: 0.00, highlightRecovery: 0.32, shadowLift: 0.20,
            grainAmount: 0.10, grainSize: 0.75, vignetteAmount: 0.10, vignetteRadius: 1.14,
            fade: 0.12, sharpen: 0.14, blur: 0,
            toneCurve: curve([0.04, 0.29, 0.54, 0.76, 0.97]),
            lumaWeights: SIMD3<Float>(0.28, 0.62, 0.10),
            defaultFrames: 36, defaultUnlock: .endOfMonth),
        // R30
        FilmRecipe(
            id: "deep-tone-acros", displayName: "Deep Tone Acros",
            inspiration: "Rich deep-tone monochrome film simulation",
            category: .blackAndWhite, bestUse: "Fine art, street, portraits",
            ev: -0.02, contrast: 1.20, saturation: 0.00, highlightRecovery: 0.18, shadowLift: 0.10,
            grainAmount: 0.38, grainSize: 1.30, vignetteAmount: 0.22, vignetteRadius: 1.00,
            fade: 0.03, sharpen: 0.20, blur: 0,
            toneCurve: curve([0.00, 0.22, 0.49, 0.82, 1.00]),
            lumaWeights: SIMD3<Float>(0.24, 0.68, 0.08),
            defaultFrames: 36, defaultUnlock: .endOfMonth)
    ]

    /// The default recipe used when a roll is created without an explicit choice.
    static var `default`: FilmRecipe { all[0] }

    /// Looks up a recipe by its stable slug.
    static func recipe(for id: String) -> FilmRecipe? {
        all.first { $0.id == id }
    }
}
