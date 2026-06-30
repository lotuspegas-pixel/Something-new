import SwiftUI

/// The tactile shutter: a warm accent ring around a recessed plastic button that
/// presses inward when tapped. Phase 5 styling; same action contract as before.
struct ShutterButton: View {
    var isEnabled: Bool = true
    var action: () -> Void = {}

    var body: some View {
        Button(action: action) {
            ZStack {
                // Outer accent ring.
                Circle()
                    .strokeBorder(
                        isEnabled ? AnyShapeStyle(FilmTheme.accentRing)
                                  : AnyShapeStyle(Color.gray.opacity(0.4)),
                        lineWidth: 7
                    )
                    .frame(width: 84, height: 84)
                // Button face.
                Circle()
                    .fill(
                        LinearGradient(
                            colors: isEnabled
                                ? [Color(white: 0.97), Color(white: 0.82)]
                                : [Color(white: 0.55), Color(white: 0.4)],
                            startPoint: .top, endPoint: .bottom)
                    )
                    .frame(width: 64, height: 64)
                    .overlay(
                        Circle().stroke(.black.opacity(0.15), lineWidth: 1)
                    )
                    .shadow(color: .black.opacity(0.4), radius: 3, y: 2)
            }
        }
        .buttonStyle(ShutterPressStyle())
        .disabled(!isEnabled)
        .accessibilityLabel("Shutter")
        .accessibilityHint("Captures a frame onto your roll")
    }
}

/// Press depth + scale for the shutter.
private struct ShutterPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.92 : 1)
            .brightness(configuration.isPressed ? -0.05 : 0)
            .animation(.spring(response: 0.2, dampingFraction: 0.6),
                       value: configuration.isPressed)
    }
}

#Preview {
    ShutterButton()
        .padding()
        .background(FilmTheme.shell)
}
