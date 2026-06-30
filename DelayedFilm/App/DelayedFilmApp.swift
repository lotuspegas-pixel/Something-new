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
        do {
            modelContainer = try ModelContainer(
                for: FilmRoll.self, CapturedFrame.self
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

/// Phase 1 root scaffold. Replaced by the retro camera shell in Phase 6.
struct RootView: View {
    @Environment(AppRouter.self) private var router

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
    }
}
