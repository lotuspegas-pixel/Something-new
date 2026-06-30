import Foundation
import CoreImage

/// Applies a ``FilmRecipe`` to a full-resolution captured image.
///
/// The renderer is the *only* component that turns sensor pixels into a
/// developed look. It runs **post-capture**, on a background queue, and writes
/// its result straight into the locked roll directory — the output is never
/// returned to the camera UI for display.
///
/// Phase 1 ships the contract plus a passthrough implementation so the capture
/// pipeline can be wired end-to-end. **Phase 3 / Phase 4** implement the real
/// Core Image chain (luma conversion → tone curve → color matrix → temperature/
/// tint → highlight/shadow → fade → vignette → grain) on a Metal-backed
/// `CIContext`.
protocol FilmRenderer {
    /// Renders `input` through `recipe` and returns a developed `CIImage`.
    ///
    /// - Parameters:
    ///   - input: The full-resolution captured image.
    ///   - recipe: The look to apply.
    /// - Returns: The developed image, ready to be encoded and written to disk.
    func render(_ input: CIImage, with recipe: FilmRecipe) -> CIImage
}

/// A no-op renderer used during Phase 1 wiring and in tests.
///
/// Returns the input unchanged. It exists so the capture → store → reveal path
/// can be exercised before the real film math lands, without ever exposing a
/// preview.
struct PassthroughFilmRenderer: FilmRenderer {
    func render(_ input: CIImage, with recipe: FilmRecipe) -> CIImage {
        // TODO: [Phase 3/4] Replace with the deterministic Core Image chain.
        input
    }
}
