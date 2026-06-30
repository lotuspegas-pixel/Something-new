import SwiftUI

/// Central visual language for Delayed Film: a premium reinterpretation of a
/// 1990s disposable camera — warm plastic, embossed type, a glowing LCD, and a
/// cream film sticker.
enum FilmTheme {

    // MARK: Palette

    /// Dark warm plastic shell (top → bottom of the gradient).
    static let shellTop = Color(red: 0.20, green: 0.19, blue: 0.20)
    static let shellBottom = Color(red: 0.09, green: 0.08, blue: 0.09)
    /// Raised plastic panels.
    static let panelTop = Color(red: 0.26, green: 0.25, blue: 0.26)
    static let panelBottom = Color(red: 0.14, green: 0.13, blue: 0.14)
    /// Signature warm accent (shutter ring, highlights).
    static let accent = Color(red: 0.98, green: 0.78, blue: 0.30)
    static let accentDeep = Color(red: 0.86, green: 0.52, blue: 0.18)
    /// Flash lamp glow.
    static let flashGlow = Color(red: 1.0, green: 0.95, blue: 0.78)
    /// LCD window.
    static let lcdBackground = Color(red: 0.10, green: 0.13, blue: 0.10)
    static let lcdText = Color(red: 0.56, green: 0.86, blue: 0.46)
    /// Cream paper film sticker.
    static let sticker = Color(red: 0.93, green: 0.90, blue: 0.83)
    static let stickerInk = Color(red: 0.18, green: 0.16, blue: 0.14)
    static let filmRed = Color(red: 0.80, green: 0.24, blue: 0.22)

    // MARK: Gradients

    static var shell: LinearGradient {
        LinearGradient(colors: [shellTop, shellBottom],
                       startPoint: .top, endPoint: .bottom)
    }
    static var panel: LinearGradient {
        LinearGradient(colors: [panelTop, panelBottom],
                       startPoint: .top, endPoint: .bottom)
    }
    static var accentRing: AngularGradient {
        AngularGradient(colors: [accent, accentDeep, accent],
                        center: .center)
    }

    // MARK: Metrics

    static let bodyCornerRadius: CGFloat = 34
    static let panelCornerRadius: CGFloat = 18
}

// MARK: - Reusable modifiers

/// Raised plastic panel: gradient fill, soft top highlight, drop shadow.
struct PlasticPanel: ViewModifier {
    var cornerRadius: CGFloat = FilmTheme.panelCornerRadius
    func body(content: Content) -> some View {
        content
            .background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(FilmTheme.panel)
            )
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(.white.opacity(0.08), lineWidth: 1)
                    .blendMode(.screen)
            )
            .shadow(color: .black.opacity(0.45), radius: 8, x: 0, y: 4)
    }
}

extension View {
    func plasticPanel(cornerRadius: CGFloat = FilmTheme.panelCornerRadius) -> some View {
        modifier(PlasticPanel(cornerRadius: cornerRadius))
    }
}

/// Subtle, deterministic scratches/texture overlay for the plastic shell.
struct ScratchOverlay: View {
    var body: some View {
        Canvas { context, size in
            var rng = SeededRNG(seed: 0xDF11)
            for _ in 0..<14 {
                let x = CGFloat(rng.nextUnit()) * size.width
                let y0 = CGFloat(rng.nextUnit()) * size.height
                let len = CGFloat(20 + rng.nextUnit() * 120)
                let path = Path { p in
                    p.move(to: CGPoint(x: x, y: y0))
                    p.addLine(to: CGPoint(x: x + CGFloat(rng.nextUnit() * 8 - 4), y: y0 + len))
                }
                context.stroke(path, with: .color(.white.opacity(0.04)), lineWidth: 0.6)
            }
        }
        .allowsHitTesting(false)
        .blendMode(.screen)
    }
}

/// Tiny deterministic RNG so the texture is stable across renders.
struct SeededRNG {
    private var state: UInt64
    init(seed: UInt64) { state = seed == 0 ? 0x9E3779B97F4A7C15 : seed }
    mutating func next() -> UInt64 {
        state ^= state << 13; state ^= state >> 7; state ^= state << 17
        return state
    }
    /// Returns a value in 0…1.
    mutating func nextUnit() -> Double {
        Double(next() % 10_000) / 10_000.0
    }
}
