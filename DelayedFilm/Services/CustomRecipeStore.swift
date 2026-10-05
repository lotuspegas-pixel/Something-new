import Foundation
import SwiftData

/// CRUD for user-authored recipes, plus a unified resolver that merges built-in
/// and custom recipes.
protocol CustomRecipeStore {
    func allCustomRecipes() -> [FilmRecipe]
    /// Saves a new recipe or updates an existing one (bumping its version).
    @discardableResult
    func save(_ recipe: FilmRecipe) -> FilmRecipe
    func delete(id: String)
    /// Resolves any recipe id from custom storage (built-ins handled elsewhere).
    func customRecipe(for id: String) -> FilmRecipe?
}

/// SwiftData-backed implementation.
final class SwiftDataCustomRecipeStore: CustomRecipeStore {
    private let context: ModelContext

    init(context: ModelContext) {
        self.context = context
    }

    func allCustomRecipes() -> [FilmRecipe] {
        let descriptor = FetchDescriptor<CustomRecipeRecord>(
            sortBy: [SortDescriptor(\.updatedAt, order: .reverse)])
        let records = (try? context.fetch(descriptor)) ?? []
        return records.compactMap { $0.recipe() }
    }

    @discardableResult
    func save(_ recipe: FilmRecipe) -> FilmRecipe {
        let id = recipe.id
        let descriptor = FetchDescriptor<CustomRecipeRecord>(
            predicate: #Predicate { $0.id == id })
        if let existing = try? context.fetch(descriptor).first {
            existing.update(with: recipe)
            try? context.save()
            return existing.recipe() ?? recipe
        } else {
            let record = CustomRecipeRecord(recipe: recipe)
            context.insert(record)
            try? context.save()
            return record.recipe() ?? recipe
        }
    }

    func delete(id: String) {
        let descriptor = FetchDescriptor<CustomRecipeRecord>(
            predicate: #Predicate { $0.id == id })
        if let record = try? context.fetch(descriptor).first {
            context.delete(record)
            try? context.save()
        }
    }

    func customRecipe(for id: String) -> FilmRecipe? {
        let descriptor = FetchDescriptor<CustomRecipeRecord>(
            predicate: #Predicate { $0.id == id })
        return (try? context.fetch(descriptor).first)?.recipe()
    }
}

/// Resolves any recipe id to a concrete recipe, checking built-ins first then
/// custom storage. Used by the capture pipeline.
enum RecipeResolver {
    static func resolve(id: String, customStore: CustomRecipeStore?) -> FilmRecipe? {
        if let builtIn = FilmRecipeCatalog.recipe(for: id) { return builtIn }
        return customStore?.customRecipe(for: id)
    }
}

extension FilmRecipe {
    /// Whether this id belongs to the shipped catalog.
    var isBuiltIn: Bool { FilmRecipeCatalog.recipe(for: id) != nil }

    /// Creates an editable copy under a fresh custom id (for "duplicate").
    func duplicatedAsCustom(named newName: String) -> FilmRecipe {
        var copy = self
        copy.id = "custom-\(UUID().uuidString)"
        copy.displayName = newName
        copy.publicName = newName
        copy.basePreset = id
        copy.version = 1
        return copy
    }

    /// A blank custom recipe to start authoring from scratch.
    static func newCustom(named name: String = "My Recipe") -> FilmRecipe {
        FilmRecipe(
            id: "custom-\(UUID().uuidString)",
            displayName: name,
            category: .colorNegative,
            bestUse: "Custom recipe",
            version: 1)
    }
}
