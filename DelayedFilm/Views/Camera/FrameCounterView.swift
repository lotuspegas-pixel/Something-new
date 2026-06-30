import SwiftUI

/// The little LCD window that shows how many frames remain — like the wheel on a
/// disposable camera, reimagined as a glowing segment display.
struct FrameCounterView: View {
    var shot: Int = 0
    var capacity: Int = 27

    var body: some View {
        HStack(spacing: 6) {
            Text("EXP")
                .font(.system(size: 8, weight: .heavy, design: .monospaced))
                .foregroundStyle(FilmTheme.lcdText.opacity(0.6))
            Text("\(shot)")
                .font(.system(size: 22, weight: .bold, design: .monospaced))
                .foregroundStyle(FilmTheme.lcdText)
            Text("/\(capacity)")
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundStyle(FilmTheme.lcdText.opacity(0.55))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(FilmTheme.lcdBackground)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(.black.opacity(0.6), lineWidth: 1.5)
                )
        )
        .shadow(color: FilmTheme.lcdText.opacity(0.15), radius: 4)
        .accessibilityLabel("\(shot) of \(capacity) frames shot")
    }
}

#Preview {
    FrameCounterView(shot: 12)
        .padding()
        .background(FilmTheme.shell)
}
