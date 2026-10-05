import XCTest
import CoreGraphics
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

    func testCatalogHasThirtyRecipes() {
        XCTAssertEqual(FilmRecipeCatalog.all.count, 30)
    }

    func testCatalogIDsAreUnique() {
        let ids = FilmRecipeCatalog.all.map(\.id)
        XCTAssertEqual(ids.count, Set(ids).count, "Duplicate recipe ids in catalog")
    }

    func testUserFacingNamesMatchSpec() {
        let expected = [
            "Gold Daylight", "Everyday Max 400", "Disposable Flash 800",
            "Soft Portrait 160", "Open Shade 400", "Portrait Push 800",
            "Night Portrait 800", "Ultra Vivid 100", "Clean Slide 100",
            "Balanced Chrome", "Pushed Chrome", "Vivid Landscape", "Soft Slide",
            "Pastel Pro 400", "Reportage Chrome", "Memory Negative",
            "Amber Nostalgia", "Cinema Still", "Tungsten Halo",
            "Cross Process Slide", "Street Mono 400", "Pushed Street Mono",
            "Classic Reporter", "Pushed Reporter", "Fine Detail Mono",
            "Clean Delta Mono", "Available Light Mono", "Precision Mono 100",
            "Smooth C41 Mono", "Deep Tone Acros"
        ]
        let actual = Set(FilmRecipeCatalog.all.map(\.displayName))
        for name in expected {
            XCTAssertTrue(actual.contains(name), "Missing user-facing recipe: \(name)")
        }
    }

    func testCatalogLookupResolves() {
        let id = FilmRecipeCatalog.default.id
        XCTAssertEqual(FilmRecipeCatalog.recipe(for: id)?.id, id)
        XCTAssertNil(FilmRecipeCatalog.recipe(for: "does-not-exist"))
    }

    func testMonochromeFlagDerivesFromCategory() {
        for recipe in FilmRecipeCatalog.all {
            XCTAssertEqual(recipe.isMonochrome, recipe.category == .blackAndWhite)
        }
    }

    func testToneCurveMathMonotonicAndClamped() {
        let curve = FilmRecipe.Curves.filmS
        XCTAssertEqual(ToneCurveMath.sample(curve, at: -1),
                       ToneCurveMath.sample(curve, at: 0), accuracy: 0.0001)
        XCTAssertEqual(ToneCurveMath.sample(curve, at: 2),
                       ToneCurveMath.sample(curve, at: 1), accuracy: 0.0001)
        var previous = ToneCurveMath.sample(curve, at: 0)
        for step in stride(from: 0.0, through: 1.0, by: 0.05) {
            let value = ToneCurveMath.sample(curve, at: CGFloat(step))
            XCTAssertGreaterThanOrEqual(value + 0.0001, previous, "Curve must be non-decreasing")
            previous = value
        }
        XCTAssertEqual(ToneCurveMath.fivePoints(from: curve).count, 5)
    }

    func testCalibrationValuesApplied() throws {
        let gold = try XCTUnwrap(FilmRecipeCatalog.recipe(for: "gold-daylight"))
        XCTAssertEqual(gold.ev, -0.10, accuracy: 0.0001)
        XCTAssertEqual(gold.contrast, 1.06, accuracy: 0.0001)
        XCTAssertEqual(gold.saturation, 1.12, accuracy: 0.0001)
        XCTAssertEqual(gold.temperatureShiftK, 180, accuracy: 0.01)
        XCTAssertEqual(gold.colorBase, .consumerWarmCN)
        XCTAssertEqual(gold.defaultFrames, 27)
        XCTAssertEqual(gold.defaultUnlock, .endOfWeek)
        XCTAssertEqual(gold.toneCurve.map { $0.y }, [0.02, 0.26, 0.53, 0.80, 0.98])

        let xpro = try XCTUnwrap(FilmRecipeCatalog.recipe(for: "cross-process-slide"))
        XCTAssertEqual(xpro.colorBase, .xproSlide)
        XCTAssertEqual(xpro.tintShift, 16, accuracy: 0.01)
        XCTAssertEqual(xpro.category, .experimental)
    }

    func testBlackAndWhiteRecipesUseLumaAndNeutralBase() {
        for recipe in FilmRecipeCatalog.all where recipe.category == .blackAndWhite {
            XCTAssertEqual(recipe.saturation, 0, accuracy: 0.0001, "\(recipe.id) must be desaturated")
            XCTAssertNotNil(recipe.lumaWeights, "\(recipe.id) needs luma weights")
            XCTAssertEqual(recipe.colorBase, .identity, "\(recipe.id) uses the luma path, not a color base")
        }
    }

    func testColorRecipesHaveAColorBase() {
        for recipe in FilmRecipeCatalog.all where recipe.category != .blackAndWhite {
            XCTAssertNotEqual(recipe.colorBase, .identity, "\(recipe.id) should use a named color base")
        }
    }

    func testStableSeedIsDeterministic() {
        XCTAssertEqual(DefaultFilmRenderer.stableSeed("gold-daylight"),
                       DefaultFilmRenderer.stableSeed("gold-daylight"))
        XCTAssertNotEqual(DefaultFilmRenderer.stableSeed("a"),
                          DefaultFilmRenderer.stableSeed("b"))
    }
}
