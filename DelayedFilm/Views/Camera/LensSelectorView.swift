import SwiftUI

/// Lens dial (0.5× / 1× / 2× / front). Phase 2 binds it to the camera service's
/// available lenses; Phase 6 styles it as a detented dial. Placeholder.
struct LensSelectorView: View {
    var lenses: [CameraLensOption] = [.ultraWide, .wide, .telephoto]
    var selected: CameraLensOption = .wide
    var onSelect: (CameraLensOption) -> Void = { _ in }

    var body: some View {
        HStack(spacing: 8) {
            ForEach(lenses) { lens in
                Button(lens.shortLabel) { onSelect(lens) }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(lens == selected ? .yellow : .secondary)
            }
        }
    }
}
