import SwiftUI

/// Detail for a *locked* roll: shows the countdown, recipe, frame count, and
/// analog placeholder art — **no images**. Phase 6 adds the tactile treatment.
struct RollDetailLockedView: View {
    let roll: FilmRoll

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "lock.fill")
                .font(.system(size: 44, weight: .thin))
                .foregroundStyle(.secondary)
            Text(roll.title.isEmpty ? "Untitled Roll" : roll.title)
                .font(.title3.weight(.semibold))
            Text(roll.recipeName)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text("\(roll.frameCount) frames sealed")
                .font(.footnote)
            Text("Develops \(roll.unlockDate.formatted(date: .long, time: .shortened))")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding()
        .multilineTextAlignment(.center)
    }
}
