import SwiftUI

/// Contact-sheet (thumbnail grid) view of a revealed roll. Only ever renders
/// thumbnails for **unlocked** rolls — there is no thumbnail generation path for
/// locked frames anywhere in the app. Phase 5/6 implement the grid. Placeholder.
struct ContactSheetView: View {
    let roll: FilmRoll

    var body: some View {
        ContentUnavailableView(
            "Contact Sheet",
            systemImage: "square.grid.3x3",
            description: Text("Thumbnail grid — Phase 5.")
        )
    }
}
