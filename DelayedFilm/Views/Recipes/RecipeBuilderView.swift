import SwiftUI

/// Custom recipe builder. Full parameter editing (tone, color, grain, vignette)
/// lands in Phase 7. Placeholder establishes the route.
struct RecipeBuilderView: View {
    var body: some View {
        ContentUnavailableView(
            "Recipe Builder",
            systemImage: "slider.horizontal.3",
            description: Text("Design your own film look — coming in Phase 7.")
        )
    }
}

#Preview {
    RecipeBuilderView()
}
