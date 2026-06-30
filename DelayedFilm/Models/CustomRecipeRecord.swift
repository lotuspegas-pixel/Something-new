import Foundation
import SwiftData

/// Persistence record for a user-authored ``FilmRecipe``.
///
/// The recipe is stored as a JSON `payload` so the rich parameter model can
/// evolve without SwiftData migrations. `version` is the source of truth and is
/// bumped on every edit; the decoded recipe always reflects the record's
/// `version`, `id`, and `name`.
///
/// ### Why edits don't affect old frames
/// Captured frames are rendered to disk at capture time and store the recipe id
/// **and** `version` they were shot with. Reveal reads the already-developed
/// JPEG — it never re-renders — so editing a recipe later cannot change a photo
/// that was already taken. The stored version is provenance.
@Model
final class CustomRecipeRecord {
    @Attribute(.unique) var id: String
    var name: String
    var version: Int
    var updatedAt: Date
    var payload: Data

    init(recipe: FilmRecipe) {
        self.id = recipe.id
        self.name = recipe.displayName
        self.version = recipe.version
        self.updatedAt = Date()
        self.payload = (try? JSONEncoder().encode(recipe)) ?? Data()
    }

    /// Decodes the stored recipe, forcing it to match the record's authoritative
    /// `id`, `name`, and `version`.
    func recipe() -> FilmRecipe? {
        guard var decoded = try? JSONDecoder().decode(FilmRecipe.self, from: payload) else {
            return nil
        }
        decoded.id = id
        decoded.displayName = name
        decoded.publicName = name
        decoded.version = version
        return decoded
    }

    /// Applies an edited recipe, bumping the version for new captures.
    func update(with recipe: FilmRecipe) {
        var updated = recipe
        version += 1
        updated.id = id
        updated.version = version
        name = recipe.displayName
        updated.displayName = name
        updated.publicName = name
        updatedAt = Date()
        payload = (try? JSONEncoder().encode(updated)) ?? payload
    }
}
