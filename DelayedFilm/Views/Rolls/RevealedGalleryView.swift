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
    @State private var shareItems: [Any] = []
    @State private var showShare = false

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
            if viewModel.isExporting {
                ProgressView("Exporting…")
                    .padding()
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
            }
        }
        .navigationTitle("\(selection + 1) of \(frames.count)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { exportMenu }
        }
        #if canImport(UIKit)
        .sheet(isPresented: $showShare) { ShareSheet(items: shareItems) }
        #endif
        .alert("Export", isPresented: Binding(
            get: { viewModel.exportMessage != nil },
            set: { if !$0 { viewModel.exportMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: { Text(viewModel.exportMessage ?? "") }
    }

    private var exportMenu: some View {
        Menu {
            Button {
                Task { await viewModel.exportToPhotos([frames[selection]]) }
            } label: { Label("Save this photo", systemImage: "square.and.arrow.down") }

            Button {
                Task { await viewModel.exportToPhotos(frames) }
            } label: { Label("Save all to Photos", systemImage: "square.and.arrow.down.on.square") }

            #if canImport(UIKit)
            Button {
                share([frames[selection]])
            } label: { Label("Share this photo", systemImage: "square.and.arrow.up") }
            Button {
                share(frames)
            } label: { Label("Share all", systemImage: "square.and.arrow.up.on.square") }
            #endif
        } label: {
            Image(systemName: "square.and.arrow.up")
        }
        .disabled(frames.isEmpty)
    }

    #if canImport(UIKit)
    private func share(_ frames: [CapturedFrame]) {
        let images = viewModel.shareData(for: frames).compactMap { UIImage(data: $0) }
        guard !images.isEmpty else { return }
        shareItems = images
        showShare = true
    }
    #endif
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
