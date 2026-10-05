import SwiftUI

/// The plastic camera-body shell: warm gradient, subtle scratches, and corner
/// screws. Used as the backdrop the camera controls sit on.
struct RetroCameraBodyView: View {
    var body: some View {
        ZStack {
            FilmTheme.shell.ignoresSafeArea()
            ScratchOverlay().ignoresSafeArea()
            VStack {
                screwRow
                Spacer()
                screwRow
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .ignoresSafeArea(edges: .bottom)
        }
    }

    private var screwRow: some View {
        HStack {
            ScrewView()
            Spacer()
            ScrewView()
        }
    }
}

/// A small phillips screw detail.
struct ScrewView: View {
    var body: some View {
        ZStack {
            Circle().fill(
                RadialGradient(colors: [Color(white: 0.28), Color(white: 0.12)],
                               center: .center, startRadius: 0, endRadius: 7))
            Rectangle().fill(.black.opacity(0.5)).frame(width: 9, height: 1.4)
            Rectangle().fill(.black.opacity(0.5)).frame(width: 1.4, height: 9)
        }
        .frame(width: 14, height: 14)
        .accessibilityHidden(true)
    }
}
