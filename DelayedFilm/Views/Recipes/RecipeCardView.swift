import SwiftUI

/// A single recipe card showing name + description. Phase 6 adds the film-box
/// art treatment. Critically, any imagery here is decorative — never a captured
/// frame and never a final-look swatch presented as the user's photo.
struct RecipeCardView: View {
    let recipe: FilmRecipe

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(recipe.name)
                .font(.headline)
            Text(recipe.summary)
                .font(.caption)
                .foregroundStyle(.secondary)
            if recipe.isMonochrome {
                Label("B&W", systemImage: "circle.lefthalf.filled")
                    .font(.caption2)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
}

#Preview {
    RecipeCardView(recipe: FilmRecipeCatalog.default)
        .padding()
}
