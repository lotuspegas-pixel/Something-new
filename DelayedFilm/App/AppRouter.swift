import Foundation
import SwiftUI
import Observation

/// Top-level navigation state for Delayed Film.
///
/// Holds the active tab and the navigation path so deep links (e.g. a reveal
/// reminder notification) can route to the right screen. Kept deliberately small
/// in Phase 1; screens are filled in over later phases.
@MainActor
@Observable
final class AppRouter {

    /// The primary surfaces of the app.
    enum Tab: Hashable {
        case camera
        case rolls
        case settings
    }

    /// Routes reachable by pushing onto a navigation stack.
    enum Route: Hashable {
        case lockedRoll(UUID)
        case revealRoll(UUID)
        case revealedGallery(UUID)
        case recipeBuilder
    }

    var selectedTab: Tab = .camera
    var path: [Route] = []

    func push(_ route: Route) { path.append(route) }
    func popToRoot() { path.removeAll() }
    func select(_ tab: Tab) { selectedTab = tab }
}
