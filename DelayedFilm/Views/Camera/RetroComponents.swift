import SwiftUI

// MARK: - Film sticker

/// Cream paper sticker on the camera body showing the loaded recipe — the
/// tactile equivalent of the film box label.
struct FilmStickerView: View {
    let recipeName: String
    var category: String = "FILM"

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("DELAYED FILM")
                .font(.system(size: 8, weight: .heavy, design: .rounded))
                .foregroundStyle(FilmTheme.filmRed)
                .tracking(1.5)
            Text(recipeName.isEmpty ? "No Roll" : recipeName)
                .font(.system(size: 13, weight: .bold, design: .serif))
                .foregroundStyle(FilmTheme.stickerInk)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(category.uppercased())
                .font(.system(size: 7, weight: .semibold, design: .monospaced))
                .foregroundStyle(FilmTheme.stickerInk.opacity(0.6))
                .tracking(1)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .frame(width: 132, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 4)
                .fill(FilmTheme.sticker)
                .shadow(color: .black.opacity(0.4), radius: 3, x: 0, y: 2)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 4)
                .stroke(.black.opacity(0.08), lineWidth: 0.5)
        )
        .rotationEffect(.degrees(-2.5))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Loaded recipe: \(recipeName.isEmpty ? "none" : recipeName)")
    }
}

// MARK: - Flash lamp

/// The flash indicator lamp. Glows when flash is armed.
struct FlashLampView: View {
    let mode: CameraFlashMode
    var isAvailable: Bool = true

    private var glowing: Bool { isAvailable && mode != .off }

    var body: some View {
        ZStack {
            Circle()
                .fill(glowing ? FilmTheme.flashGlow : Color(white: 0.2))
                .frame(width: 14, height: 14)
                .shadow(color: glowing ? FilmTheme.flashGlow.opacity(0.9) : .clear,
                        radius: glowing ? 7 : 0)
            Circle()
                .stroke(.black.opacity(0.5), lineWidth: 1)
                .frame(width: 14, height: 14)
        }
        .animation(.easeInOut(duration: 0.2), value: glowing)
        .accessibilityLabel("Flash \(mode.rawValue)")
    }
}

// MARK: - Lens window (decorative)

/// A small decorative lens on the body plate (distinct from the viewfinder).
struct LensWindowView: View {
    var diameter: CGFloat = 30
    var body: some View {
        ZStack {
            Circle().fill(FilmTheme.panel)
            Circle().stroke(.black.opacity(0.6), lineWidth: 2)
            Circle().fill(
                RadialGradient(colors: [Color(white: 0.05), Color(white: 0.18)],
                               center: .center, startRadius: 1, endRadius: diameter / 2)
            )
            .padding(5)
            Circle().fill(.white.opacity(0.25))
                .frame(width: diameter * 0.18, height: diameter * 0.18)
                .offset(x: -diameter * 0.18, y: -diameter * 0.18)
        }
        .frame(width: diameter, height: diameter)
        .accessibilityHidden(true)
    }
}

// MARK: - Winding thumbwheel

/// The film-advance thumbwheel. Rotates when a frame is wound on.
struct WindingLeverView: View {
    var isWinding: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var angle: Double = 0

    var body: some View {
        ZStack {
            Circle().fill(FilmTheme.panel)
                .frame(width: 38, height: 38)
                .shadow(color: .black.opacity(0.4), radius: 2, y: 1)
            // Ridges
            ForEach(0..<12, id: \.self) { i in
                Capsule()
                    .fill(.black.opacity(0.35))
                    .frame(width: 1.5, height: 8)
                    .offset(y: -13)
                    .rotationEffect(.degrees(Double(i) / 12 * 360))
            }
            Circle().fill(FilmTheme.accentDeep.opacity(0.8))
                .frame(width: 8, height: 8)
        }
        .rotationEffect(.degrees(angle))
        .onChange(of: isWinding) { _, winding in
            guard winding, !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 0.45)) { angle += 90 }
        }
        .accessibilityHidden(true)
    }
}
