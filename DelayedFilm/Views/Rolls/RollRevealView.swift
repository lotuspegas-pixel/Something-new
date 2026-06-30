import SwiftUI

/// The ceremonial "develop the roll" moment — the only transition that turns a
/// locked roll into viewable photos. Phase 5/6 build the reveal animation.
/// Placeholder establishes the route; it must only be reachable once the roll
/// is unlocked.
struct RollRevealView: View {
    let roll: FilmRoll

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "sparkles")
                .font(.system(size: 44, weight: .thin))
            Text("Develop \(roll.title.isEmpty ? "this roll" : roll.title)?")
                .font(.title3.weight(.semibold))
            Text("Reveal animation — Phase 5")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding()
    }
}
