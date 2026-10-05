import XCTest
import SwiftData
import CoreImage
@testable import DelayedFilm

/// Phase 6: custom recipe persistence, versioning, resolution, and the guarantee
/// that editing a recipe never changes already-captured frames.
final class CustomRecipeTests: XCTestCase {

    private struct StubProcessor: ImageProcessingService {
        func process(_ photo: CapturedPhoto, recipe: FilmRecipe,
                     destinationDirectory: URL, fileName: String) async throws -> ProcessedFrameInfo {
            try Data("F".utf8).write(to: destinationDirectory.appendingPathComponent(fileName))
            return ProcessedFrameInfo(fileName: fileName, pixelWidth: 10, pixelHeight: 10)
        }
    }

    private func makeContainer() throws -> ModelContainer {
        try ModelContainer(
            for: FilmRoll.self, CapturedFrame.self, CustomRecipeRecord.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true))
    }

    func testSaveAndFetchCustomRecipe() throws {
        let context = ModelContext(try makeContainer())
        let store = SwiftDataCustomRecipeStore(context: context)

        var recipe = FilmRecipe.newCustom(named: "My Look")
        recipe.saturation = 1.3
        store.save(recipe)

        let all = store.allCustomRecipes()
        XCTAssertEqual(all.count, 1)
        XCTAssertEqual(all.first?.displayName, "My Look")
        XCTAssertEqual(all.first?.version, 1)
        XCTAssertEqual(all.first?.saturation ?? 0, 1.3, accuracy: 0.0001)
    }

    func testEditBumpsVersion() throws {
        let context = ModelContext(try makeContainer())
        let store = SwiftDataCustomRecipeStore(context: context)
        var recipe = FilmRecipe.newCustom(named: "V")
        let saved = store.save(recipe)
        XCTAssertEqual(saved.version, 1)

        recipe = saved
        recipe.contrast = 1.2
        let updated = store.save(recipe)
        XCTAssertEqual(updated.version, 2)
        XCTAssertEqual(store.allCustomRecipes().count, 1, "Editing must not create a new record")
    }

    func testResolverPrefersBuiltInThenCustom() throws {
        let context = ModelContext(try makeContainer())
        let store = SwiftDataCustomRecipeStore(context: context)
        let custom = store.save(.newCustom(named: "C"))

        XCTAssertEqual(RecipeResolver.resolve(id: "gold-daylight", customStore: store)?.id,
                       "gold-daylight")
        XCTAssertEqual(RecipeResolver.resolve(id: custom.id, customStore: store)?.id, custom.id)
        XCTAssertNil(RecipeResolver.resolve(id: "nope", customStore: store))
    }

    func testDuplicateCreatesFreshCustomID() {
        let builtIn = FilmRecipeCatalog.default
        let copy = builtIn.duplicatedAsCustom(named: "Copy")
        XCTAssertNotEqual(copy.id, builtIn.id)
        XCTAssertTrue(copy.id.hasPrefix("custom-"))
        XCTAssertEqual(copy.basePreset, builtIn.id)
        XCTAssertFalse(copy.isBuiltIn)
        XCTAssertTrue(builtIn.isBuiltIn)
    }

    func testCapturedFrameKeepsOriginalVersionAfterEdit() async throws {
        let container = try makeContainer()
        let context = ModelContext(container)
        let recipeStore = SwiftDataCustomRecipeStore(context: context)
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("Custom-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let rollStore = SwiftDataFilmRollStore(
            context: context, processor: StubProcessor(), rootDirectory: root)

        // Save a custom recipe (v1) and shoot a frame with it.
        let v1 = recipeStore.save(.newCustom(named: "Evolving"))
        XCTAssertEqual(v1.version, 1)
        let roll = try rollStore.createRoll(title: "R", schedule: .endOfMonth,
                                            recipe: v1, capacity: 27, now: Date())
        let img = CIImage(color: .gray).cropped(to: CGRect(x: 0, y: 0, width: 10, height: 10))
        try await rollStore.addFrame(to: roll, photo: CapturedPhoto(image: img, pixelWidth: 10, pixelHeight: 10))
        let frame = try XCTUnwrap(roll.frames.first)
        XCTAssertEqual(frame.recipeFormulaVersion, 1)

        // Edit the recipe (v2). The already-captured frame must be unaffected.
        var edited = v1
        edited.grainAmount = 0.9
        let v2 = recipeStore.save(edited)
        XCTAssertEqual(v2.version, 2)
        XCTAssertEqual(frame.recipeFormulaVersion, 1, "Old frame keeps its capture-time version")
    }
}
