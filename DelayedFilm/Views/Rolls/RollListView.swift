import SwiftUI
import SwiftData

/// The roll drawer: lists rolls showing **metadata only** — never an image —
/// and routes each to the right destination by lifecycle state.
///
/// Locked rolls (active/full) open a metadata-only detail. Ready rolls open the
/// develop ceremony. Revealed rolls open the developed view (contact sheet +
/// gallery). No row renders frame imagery.
struct RollListView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \FilmRoll.createdAt, order: .reverse)
    private var rolls: [FilmRoll]

    private var ready: [FilmRoll] { rolls.filter { $0.currentState == .readyToReveal } }
    private var locked: [FilmRoll] {
        rolls.filter { $0.currentState == .active || $0.currentState == .full }
    }
    private var developed: [FilmRoll] {
        rolls.filter { $0.currentState == .revealed || $0.currentState == .archived }
    }

    var body: some View {
        NavigationStack {
            Group {
                if rolls.isEmpty {
                    ContentUnavailableView(
                        "No Rolls Yet",
                        systemImage: "film",
                        description: Text("Load a roll on the camera tab to start shooting.")
                    )
                } else {
                    List {
                        section("Ready to develop", ready)
                        section("Waiting", locked)
                        section("Developed", developed)
                    }
                }
            }
            .navigationTitle("Rolls")
        }
    }

    @ViewBuilder
    private func section(_ title: String, _ items: [FilmRoll]) -> some View {
        if !items.isEmpty {
            Section(title) {
                ForEach(items) { roll in
                    NavigationLink {
                        destination(for: roll)
                    } label: {
                        RollRow(roll: roll)
                    }
                    .swipeActions(edge: .trailing) {
                        if roll.currentState == .revealed {
                            Button("Archive") { archive(roll) }.tint(.indigo)
                        }
                        Button("Delete", role: .destructive) { delete(roll) }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func destination(for roll: FilmRoll) -> some View {
        switch roll.currentState {
        case .readyToReveal, .revealed, .archived, .developing:
            RollRevealView(roll: roll)
        case .active, .full:
            RollDetailLockedView(roll: roll)
        }
    }

    private func archive(_ roll: FilmRoll) {
        guard roll.developedAt != nil, roll.archivedAt == nil else { return }
        roll.archivedAt = Date()
        try? modelContext.save()
    }

    private func delete(_ roll: FilmRoll) {
        let dir = SwiftDataFilmRollStore(context: modelContext).directory(for: roll)
        try? FileManager.default.removeItem(at: dir)
        modelContext.delete(roll)
        try? modelContext.save()
    }
}

/// Metadata-only row. Deliberately renders no frame imagery.
private struct RollRow: View {
    let roll: FilmRoll

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: roll.currentState.systemImage)
                .foregroundStyle(color(for: roll.currentState))
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(roll.title.isEmpty ? "Untitled Roll" : roll.title)
                    .font(.headline)
                Text("\(roll.recipeName) · \(roll.frameCount)/\(roll.capacity) frames")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(subtitle)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(.vertical, 4)
    }

    private var subtitle: String {
        switch roll.currentState {
        case .readyToReveal: return "Tap to develop"
        case .revealed:      return "Developed"
        case .archived:      return "Archived"
        default:
            return "Develops \(roll.unlockDate.formatted(date: .abbreviated, time: .omitted))"
        }
    }

    private func color(for state: RollState) -> Color {
        switch state {
        case .readyToReveal: return .yellow
        case .revealed:      return .green
        case .archived:      return .secondary
        default:             return .secondary
        }
    }
}
