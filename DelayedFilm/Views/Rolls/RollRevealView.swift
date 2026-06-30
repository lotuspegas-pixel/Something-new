import SwiftUI
import SwiftData

/// The ceremonial "develop the roll" moment — the only transition that turns a
/// locked roll into viewable photos. Reachable only when the roll is
/// `readyToReveal`. Shows a darkroom tray animation, emotional copy, and a
/// gradually appearing contact sheet.
struct RollRevealView: View {
    let roll: FilmRoll
    @Environment(\.modelContext) private var modelContext
    @State private var vm: RevealViewModel

    init(roll: FilmRoll) {
        self.roll = roll
        _vm = State(initialValue: RevealViewModel(roll: roll, haptics: RollRevealView.makeHaptics()))
    }

    var body: some View {
        ZStack {
            Color(white: 0.06).ignoresSafeArea()
            content
        }
        .navigationTitle(roll.title.isEmpty ? "Roll" : roll.title)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            vm.configure(modelContext: modelContext)
            if roll.developedAt != nil { await vm.loadThumbnails() }
        }
    }

    @ViewBuilder
    private var content: some View {
        if vm.isDeveloping {
            developing
        } else if roll.developedAt == nil {
            readyToDevelop
        } else {
            developed
        }
    }

    // MARK: States

    private var developing: some View {
        VStack(spacing: 20) {
            Image(systemName: "hourglass")
                .font(.system(size: 52, weight: .thin))
                .foregroundStyle(.white.opacity(0.85))
                .symbolEffect(.pulse, options: .repeating)
            Text(vm.developingLines[min(vm.developingStage, vm.developingLines.count - 1)])
                .font(.headline)
                .foregroundStyle(.white)
                .contentTransition(.opacity)
        }
    }

    private var readyToDevelop: some View {
        VStack(spacing: 18) {
            Image(systemName: "tray.and.arrow.down.fill")
                .font(.system(size: 56, weight: .thin))
                .foregroundStyle(.yellow.opacity(0.9))
            Text("Your roll is ready.")
                .font(.title2.weight(.semibold))
                .foregroundStyle(.white)
            Text(memoryCopy)
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.7))
                .multilineTextAlignment(.center)
            Button {
                Task { await vm.develop() }
            } label: {
                Text("Develop \(roll.frameCount) frames")
                    .font(.headline)
                    .padding(.horizontal, 24).padding(.vertical, 12)
            }
            .buttonStyle(.borderedProminent)
            .tint(.yellow)
            .foregroundStyle(.black)
            .padding(.top, 8)
        }
        .padding()
    }

    private var developed: some View {
        VStack(spacing: 12) {
            Text("Your roll is developed.")
                .font(.title3.weight(.semibold))
                .foregroundStyle(.white)
            Text("Open contact sheet")
                .font(.caption)
                .foregroundStyle(.white.opacity(0.6))

            ContactSheetView(roll: roll, viewModel: vm)

            NavigationLink {
                RevealedGalleryView(roll: roll, viewModel: vm)
            } label: {
                Label("Open gallery", systemImage: "rectangle.stack.fill")
                    .font(.subheadline.weight(.semibold))
            }
            .padding(.top, 4)
        }
        .padding(.top, 8)
    }

    private var memoryCopy: String {
        switch roll.schedule {
        case .endOfWeek:    return "Memories from this week are ready."
        case .endOfMonth:   return "Memories from this month are ready."
        case .endOfQuarter: return "Memories from this season are ready."
        case .endOfYear:    return "Memories from this year are ready."
        case .custom:       return "The moment you waited for has arrived."
        }
    }

    private static func makeHaptics() -> HapticsService {
        #if targetEnvironment(simulator)
        return SilentHapticsService()
        #else
        return UIKitHapticsService()
        #endif
    }
}
