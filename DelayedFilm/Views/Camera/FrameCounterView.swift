import SwiftUI

/// The little window that shows how many frames remain — like the wheel on a
/// disposable camera. Phase 6 styles it; here it's a simple readout.
struct FrameCounterView: View {
    var shot: Int = 0
    var capacity: Int = 27

    var body: some View {
        Text("\(shot)/\(capacity)")
            .font(.system(.headline, design: .monospaced))
            .foregroundStyle(.primary)
            .accessibilityLabel("\(shot) of \(capacity) frames shot")
    }
}

#Preview {
    FrameCounterView(shot: 12)
}
