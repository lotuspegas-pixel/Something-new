import Foundation
import CoreImage

/// Produces deterministic film grain to composite over a developed image.
///
/// Grain is generated from ``GrainParams/seed`` so a given frame always renders
/// identical grain — a hard requirement for reproducible reveals. Phase 1 ships
/// the contract and a no-op stub; **Phase 4** implements seeded noise generation
/// (e.g. `CIRandomGenerator` driven from the seed, scaled by `size`, blended by
/// `intensity`) on the shared Metal-backed context.
protocol GrainRenderer {
    /// Composites grain described by `params` over `image`.
    ///
    /// - Parameters:
    ///   - image: The developed image to grain.
    ///   - params: Grain intensity, size and seed.
    /// - Returns: The grained image. When `params.intensity == 0`, returns
    ///   `image` unchanged.
    func applyGrain(to image: CIImage, params: GrainParams) -> CIImage
}

/// No-op grain renderer for Phase 1 wiring and tests.
struct NoGrainRenderer: GrainRenderer {
    func applyGrain(to image: CIImage, params: GrainParams) -> CIImage {
        // TODO: [Phase 4] Implement seeded, size-scaled grain compositing.
        image
    }
}
