import SwiftUI
import SwiftData

/// App entry point.
///
/// Wires the SwiftData container (rolls + frames) and the navigation router.
/// The root presents a simple `TabView` skeleton in Phase 1; the retro camera
/// body, roll drawer, and reveal flow are built in later phases.
@main
struct DelayedFilmApp: App {

    /// Shared persistence stack for rolls and their frames.
    let modelContainer: ModelContainer

    @State private var router = AppRouter()

    init() {
        AppSettings.registerDefaults()
        do {
            modelContainer = try ModelContainer(
                for: FilmRoll.self, CapturedFrame.self, CustomRecipeRecord.self
            )
        } catch {
            // A failed store is unrecoverable; fail loudly in development.
            fatalError("Failed to create ModelContainer: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(router)
                .preferredColorScheme(.dark)
        }
        .modelContainer(modelContainer)
    }
}

/// Root scaffold. Replaced by the retro camera shell in Phase 5.
struct RootView: View {
    @Environment(AppRouter.self) private var router
    @Environment(\.modelContext) private var modelContext

    var body: some View {
        @Bindable var router = router
        TabView(selection: $router.selectedTab) {
            CameraScreen()
                .tabItem { Label("Camera", systemImage: "camera") }
                .tag(AppRouter.Tab.camera)

            RollListView()
                .tabItem { Label("Rolls", systemImage: "film") }
                .tag(AppRouter.Tab.rolls)

            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
                .tag(AppRouter.Tab.settings)
        }
        .task { await reconcileOnLaunch() }
    }

    /// Launch check: reschedule reminders for locked rolls and surface any roll
    /// that's ready to develop by opening the Rolls tab.
    private func reconcileOnLaunch() async {
        let store = SwiftDataFilmRollStore(context: modelContext)
        guard let rolls = try? store.rolls() else { return }

        #if !targetEnvironment(simulator)
        let scheduler = UserNotificationScheduler()
        await scheduler.reconcile(rolls: rolls)
        #endif

        if rolls.contains(where: { $0.isReadyToReveal() }) {
            router.selectedTab = .rolls
        }
    }
}
