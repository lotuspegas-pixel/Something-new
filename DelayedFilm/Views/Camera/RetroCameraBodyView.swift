import SwiftUI

/// The tactile camera "body" chrome that frames the preview — film sticker,
/// textured shell, frame counter window, flash indicator. Phase 6 builds the
/// premium retro treatment. Placeholder for now.
struct RetroCameraBodyView: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 24)
            .fill(.ultraThinMaterial)
            .overlay(
                Text("Retro body — Phase 6")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            )
    }
}
