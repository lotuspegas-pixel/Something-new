import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// Contact-sheet thumbnail grid for a **revealed** roll. Thumbnails come from
/// ``RevealViewModel`` which decodes them via the locked-storage gate — there is
/// no thumbnail path for locked frames anywhere in the app.
struct ContactSheetView: View {
    let roll: FilmRoll
    @Bindable var viewModel: RevealViewModel

    private var frames: [CapturedFrame] {
        roll.frames.sorted { $0.index < $1.index }
    }

    private let columns = [GridItem(.adaptive(minimum: 96), spacing: 6)]

    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 6) {
                ForEach(frames) { frame in
                    cell(for: frame)
                }
            }
            .padding(6)
        }
        .task { await viewModel.loadThumbnails() }
    }

    @ViewBuilder
    private func cell(for frame: CapturedFrame) -> some View {
        ZStack {
            Color(white: 0.12)
            if let image = viewModel.thumbnails[frame.id] {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .transition(.opacity)
            } else {
                ProgressView().tint(.white.opacity(0.5))
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .clipped()
        .overlay(alignment: .bottomLeading) {
            Text("\(frame.index)")
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundStyle(.white.opacity(0.85))
                .padding(3)
        }
        .clipShape(RoundedRectangle(cornerRadius: 4))
    }
}
