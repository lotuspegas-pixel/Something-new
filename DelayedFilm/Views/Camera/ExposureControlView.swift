import SwiftUI

/// Exposure-bias slider (EV). Phase 2 binds it to the camera service. Placeholder.
struct ExposureControlView: View {
    @State private var ev: Double = 0
    var onChange: (Float) -> Void = { _ in }

    var body: some View {
        VStack(spacing: 4) {
            Text("EV \(ev, specifier: "%+.1f")")
                .font(.caption.monospacedDigit())
            Slider(value: $ev, in: -2...2, step: 0.1) { _ in
                onChange(Float(ev))
            }
        }
        .padding(.horizontal)
    }
}
