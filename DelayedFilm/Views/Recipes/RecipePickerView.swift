import SwiftUI

/// Grid/carousel of recipe cards used when loading a roll. Phase 4/6 build the
/// full experience; Phase 1 lists the seed catalog.
struct RecipePickerView: View {
    var recipes: [FilmRecipe] = FilmRecipeCatalog.all
    var onSelect: (FilmRecipe) -> Void = { _ in }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(recipes) { recipe in
                    Button { onSelect(recipe) } label: {
                        RecipeCardView(recipe: recipe)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding()
        }
    }
}

#Preview {
    RecipePickerView()
}
