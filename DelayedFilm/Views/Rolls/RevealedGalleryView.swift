import SwiftUI

/// The gallery for a *revealed* roll — the first and only place frames become
/// visible. Reachable strictly after unlock + develop. Phase 5/6 build the
/// full viewer and export entry points. Placeholder for now.
struct RevealedGalleryView: View {
    let roll: FilmRoll

    var body: some View {
        ContentUnavailableView(
            "Revealed Gallery",
            systemImage: "photo.on.rectangle.angled",
            description: Text("\(roll.frameCount) frames — viewer arrives in Phase 5.")
        )
    }
}
