import SwiftUI

/// Detail for a *locked* roll: a sealed-canister presentation showing the
/// countdown, recipe, and frame count — **no images, no thumbnails**. The
/// promise made visible.
struct RollDetailLockedView: View {
    let roll: FilmRoll

    var body: some View {
        ZStack {
            FilmTheme.shell.ignoresSafeArea()
            VStack(spacing: 22) {
                canister
                Text(roll.title.isEmpty ? "Untitled Roll" : roll.title)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(.white)

                FilmStickerView(recipeName: roll.recipeName)

                TimelineView(.periodic(from: .now, by: 60)) { context in
                    countdown(now: context.date)
                }

                metadata
                Spacer()
            }
            .padding()
            .multilineTextAlignment(.center)
        }
        .navigationTitle("Sealed")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var canister: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 18)
                .fill(FilmTheme.panel)
                .frame(width: 120, height: 150)
                .shadow(color: .black.opacity(0.5), radius: 10, y: 6)
            Image(systemName: "lock.fill")
                .font(.system(size: 40, weight: .thin))
                .foregroundStyle(FilmTheme.accent.opacity(0.9))
            Capsule().fill(.black.opacity(0.3))
                .frame(width: 120, height: 22)
                .offset(y: -64)
        }
        .padding(.top, 12)
        .accessibilityLabel("Sealed film canister")
    }

    private func countdown(now: Date) -> some View {
        let remaining = roll.unlockDate.timeIntervalSince(now)
        return VStack(spacing: 4) {
            if remaining <= 0 {
                Text("Ready to develop")
                    .font(.headline)
                    .foregroundStyle(FilmTheme.accent)
            } else {
                Text("Develops in \(Self.relative(remaining))")
                    .font(.headline)
                    .foregroundStyle(.white)
                Text(roll.unlockDate.formatted(date: .long, time: .shortened))
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.6))
            }
        }
    }

    private var metadata: some View {
        HStack(spacing: 28) {
            stat("\(roll.frameCount)", "Frames")
            stat("\(roll.capacity)", "Capacity")
            stat(roll.currentState.displayName, "Status")
        }
        .padding(.top, 8)
    }

    private func stat(_ value: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.headline).foregroundStyle(.white)
            Text(label).font(.caption2).foregroundStyle(.white.opacity(0.5))
        }
    }

    private static func relative(_ seconds: TimeInterval) -> String {
        let days = Int(seconds / 86_400)
        if days >= 1 { return "\(days) day\(days == 1 ? "" : "s")" }
        let hours = Int(seconds / 3_600)
        if hours >= 1 { return "\(hours) hour\(hours == 1 ? "" : "s")" }
        let minutes = max(1, Int(seconds / 60))
        return "\(minutes) min"
    }
}
