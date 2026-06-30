import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// Full-screen viewer for a **revealed** roll — the first and only place frames
/// become fully visible. Reachable strictly after develop. Loads full-resolution
/// images on demand through the locked-storage gate.
struct RevealedGalleryView: View {
    let roll: FilmRoll
    @Bindable var viewModel: RevealViewModel

    @State private var selection = 0

    private var frames: [CapturedFrame] {
        roll.frames.sorted { $0.index < $1.index }
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if frames.isEmpty {
                ContentUnavailableView("No Frames", systemImage: "photo")
                    .foregroundStyle(.white)
            } else {
                TabView(selection: $selection) {
                    ForEach(Array(frames.enumerated()), id: \.element.id) { index, frame in
                        FrameView(image: viewModel.fullImage(for: frame), frame: frame)
                            .tag(index)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .automatic))
            }
        }
        .navigationTitle("\(selection + 1) of \(frames.count)")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// One full frame plus its capture metadata.
private struct FrameView: View {
    let image: UIImage?
    let frame: CapturedFrame

    var body: some View {
        VStack {
            Spacer()
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
            } else {
                ProgressView().tint(.white)
            }
            Spacer()
            HStack(spacing: 12) {
                Label(frame.lens.displayName, systemImage: "camera.aperture")
                Text(frame.capturedAt.formatted(date: .abbreviated, time: .shortened))
            }
            .font(.caption2)
            .foregroundStyle(.white.opacity(0.6))
            .padding(.bottom, 8)
        }
    }
}
