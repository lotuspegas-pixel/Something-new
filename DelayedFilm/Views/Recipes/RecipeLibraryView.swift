import SwiftUI
import SwiftData

/// Browse and manage recipes: the 30 built-ins and any custom recipes. New
/// recipes and "duplicate to customize" both open the builder.
struct RecipeLibraryView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \CustomRecipeRecord.updatedAt, order: .reverse)
    private var customRecords: [CustomRecipeRecord]

    @State private var editing: FilmRecipe?

    private var customRecipes: [FilmRecipe] { customRecords.compactMap { $0.recipe() } }

    var body: some View {
        List {
            if !customRecipes.isEmpty {
                Section("My Recipes") {
                    ForEach(customRecipes) { recipe in
                        Button { editing = recipe } label: { row(recipe, custom: true) }
                            .buttonStyle(.plain)
                            .swipeActions {
                                Button("Delete", role: .destructive) { delete(recipe) }
                                Button("Duplicate") { duplicate(recipe) }.tint(.indigo)
                            }
                    }
                }
            }
            Section("Built-in") {
                ForEach(FilmRecipeCatalog.all) { recipe in
                    Button { duplicate(recipe) } label: { row(recipe, custom: false) }
                        .buttonStyle(.plain)
                }
            }
        }
        .navigationTitle("Recipes")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    editing = .newCustom()
                } label: { Image(systemName: "plus") }
                .accessibilityLabel("New recipe")
            }
        }
        .sheet(item: $editing) { recipe in
            RecipeBuilderView(recipe: recipe)
        }
    }

    private func row(_ recipe: FilmRecipe, custom: Bool) -> some View {
        HStack(spacing: 12) {
            Image(systemName: recipe.isMonochrome ? "circle.lefthalf.filled" : "camera.filters")
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text(recipe.displayName).font(.headline)
                Text(recipe.category.displayName + " · " + recipe.bestUse)
                    .font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer()
            Image(systemName: custom ? "pencil" : "plus.square.on.square")
                .font(.caption).foregroundStyle(.tertiary)
        }
    }

    private func duplicate(_ recipe: FilmRecipe) {
        editing = recipe.duplicatedAsCustom(named: recipe.displayName + " Copy")
    }

    private func delete(_ recipe: FilmRecipe) {
        SwiftDataCustomRecipeStore(context: modelContext).delete(id: recipe.id)
    }
}

// FilmRecipe is Identifiable by `id`, satisfying `.sheet(item:)`.
