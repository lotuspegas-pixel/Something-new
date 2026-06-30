import XCTest
@testable import DelayedFilm

/// Ensures recipes serialize deterministically and the catalog is well-formed.
final class RecipeSerializationTests: XCTestCase {

    func testRecipeRoundTrips() throws {
        let original = FilmRecipeCatalog.default
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(FilmRecipe.self, from: data)
        XCTAssertEqual(original, decoded)
    }

    func testAllCatalogRecipesRoundTrip() throws {
        let encoder = JSONEncoder()
        let decoder = JSONDecoder()
        for recipe in FilmRecipeCatalog.all {
            let data = try encoder.encode(recipe)
            let decoded = try decoder.decode(FilmRecipe.self, from: data)
            XCTAssertEqual(recipe, decoded, "Recipe \(recipe.id) failed round-trip")
        }
    }

    func testCatalogIDsAreUnique() {
        let ids = FilmRecipeCatalog.all.map(\.id)
        XCTAssertEqual(ids.count, Set(ids).count, "Duplicate recipe ids in catalog")
    }

    func testCatalogLookupResolves() {
        let id = FilmRecipeCatalog.default.id
        XCTAssertEqual(FilmRecipeCatalog.recipe(for: id)?.id, id)
        XCTAssertNil(FilmRecipeCatalog.recipe(for: "does-not-exist"))
    }

    func testToneCurveSamplingIsMonotonicAndClamped() {
        let curve = ToneCurve.filmS
        XCTAssertEqual(curve.sample(-1), curve.sample(0), accuracy: 0.0001) // clamps low
        XCTAssertEqual(curve.sample(2), curve.sample(1), accuracy: 0.0001)  // clamps high
        var previous = curve.sample(0)
        for step in stride(from: 0.0, through: 1.0, by: 0.05) {
            let value = curve.sample(step)
            XCTAssertGreaterThanOrEqual(value + 0.0001, previous, "Curve must be non-decreasing")
            previous = value
        }
    }
}
