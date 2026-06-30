import SwiftUI

/// Lens dial (0.5× / 1× / 2× / front), styled as detented plastic chips with a
/// warm accent on the selected lens. Phase 2 logic, Phase 5 styling.
struct LensSelectorView: View {
    var lenses: [CameraLensOption] = [.ultraWide, .wide, .telephoto]
    var selected: CameraLensOption = .wide
    var onSelect: (CameraLensOption) -> Void = { _ in }

    var body: some View {
        HStack(spacing: 6) {
            ForEach(lenses) { lens in
                Button { onSelect(lens) } label: {
                    Text(lens.shortLabel)
                        .font(.system(size: 12, weight: .bold, design: .rounded))
                        .foregroundStyle(lens == selected ? .black : .white.opacity(0.8))
                        .frame(minWidth: 38, minHeight: 30)
                        .background(
                            Capsule().fill(lens == selected
                                ? AnyShapeStyle(FilmTheme.accent)
                                : AnyShapeStyle(Color.white.opacity(0.08)))
                        )
                }
                .accessibilityLabel(lens.displayName)
                .accessibilityAddTraits(lens == selected ? [.isSelected] : [])
            }
        }
        .padding(5)
        .background(Capsule().fill(.black.opacity(0.25)))
    }
}
