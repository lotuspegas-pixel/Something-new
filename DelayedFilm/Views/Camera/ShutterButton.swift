import SwiftUI

/// The shutter. Phase 6 gives it the mechanical press + winding animation and
/// haptics. Placeholder exposes the action contract so the camera screen can
/// wire capture in Phase 2.
struct ShutterButton: View {
    var isEnabled: Bool = true
    var action: () -> Void = {}

    var body: some View {
        Button(action: action) {
            Circle()
                .fill(isEnabled ? Color.white : Color.gray)
                .frame(width: 76, height: 76)
                .overlay(Circle().stroke(.white.opacity(0.4), lineWidth: 6))
        }
        .disabled(!isEnabled)
        .accessibilityLabel("Shutter")
    }
}

#Preview {
    ShutterButton()
        .padding()
        .background(.black)
}
