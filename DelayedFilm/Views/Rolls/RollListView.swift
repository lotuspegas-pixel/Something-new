import SwiftUI
import SwiftData

/// The roll drawer: lists rolls showing **metadata only** — never an image.
///
/// This screen is a live demonstration of the no-preview rule: even for unlocked
/// rolls it shows a placeholder and a countdown, and only routes to the reveal
/// flow when the roll is actually unlocked. Full visual treatment (analog
/// sticker graphics, drawer animation) arrives in Phase 6.
struct RollListView: View {
    @Query(sort: \FilmRoll.createdAt, order: .reverse)
    private var rolls: [FilmRoll]

    var body: some View {
        NavigationStack {
            Group {
                if rolls.isEmpty {
                    ContentUnavailableView(
                        "No Rolls Yet",
                        systemImage: "film",
                        description: Text("Load a roll to start shooting.")
                    )
                } else {
                    List(rolls) { roll in
                        RollRow(roll: roll)
                    }
                }
            }
            .navigationTitle("Rolls")
        }
    }
}

/// Metadata-only row. Deliberately renders no frame imagery.
private struct RollRow: View {
    let roll: FilmRoll

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: roll.isUnlocked() ? "lock.open" : "lock.fill")
                .foregroundStyle(roll.isUnlocked() ? .green : .secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text(roll.title.isEmpty ? "Untitled Roll" : roll.title)
                    .font(.headline)
                Text("\(roll.recipeName) · \(roll.frameCount)/\(roll.capacity) frames")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(roll.isUnlocked()
                     ? "Ready to develop"
                     : "Develops \(roll.unlockDate.formatted(date: .abbreviated, time: .omitted))")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(.vertical, 4)
    }
}
