import SwiftUI
import SwiftData
#if canImport(UIKit)
import UIKit
#endif

/// The camera surface, styled as a premium retro disposable camera.
///
/// **No-preview invariant:** after the shutter, the frame goes straight to the
/// locked roll. This screen shows a flash, a winding thumbwheel, and a "Frame
/// captured" toast — never the image, a thumbnail, or a gallery jump.
struct CameraScreen: View {
    @Environment(\.modelContext) private var modelContext
    @State private var viewModel = CameraViewModel()
    @State private var showNewRoll = false

    var body: some View {
        ZStack {
            RetroCameraBodyView()

            VStack(spacing: 14) {
                topPlate
                viewfinder
                controlStrip
                if viewModel.activeRoll != nil {
                    ExposureControlView { ev in viewModel.setExposure(ev) }
                        .frame(maxWidth: 300)
                }
                Spacer(minLength: 0)
                bottomPlate
            }
            .padding(.horizontal, 22)
            .padding(.top, 8)

            if viewModel.showCapturedToast {
                capturedToast.transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .task { await viewModel.configure(modelContext: modelContext) }
        .onDisappear { viewModel.stop() }
        .sheet(isPresented: $showNewRoll) {
            NewRollView { title, schedule, recipe, capacity in
                viewModel.createRoll(title: title, schedule: schedule,
                                     recipe: recipe, capacity: capacity)
            }
        }
        .alert("Camera", isPresented: Binding(
            get: { viewModel.errorMessage != nil },
            set: { if !$0 { viewModel.errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
    }

    // MARK: Top plate (sticker, flash lamp, lens window)

    private var topPlate: some View {
        HStack(alignment: .top) {
            Button { showNewRoll = true } label: {
                FilmStickerView(
                    recipeName: viewModel.activeRoll?.recipeName ?? "",
                    category: viewModel.activeRoll == nil ? "TAP TO LOAD" : "FILM"
                )
            }
            .buttonStyle(.plain)

            Spacer()

            VStack(alignment: .trailing, spacing: 10) {
                FlashLampView(mode: viewModel.flashMode,
                              isAvailable: viewModel.isFlashAvailable)
                LensWindowView()
            }
        }
    }

    // MARK: Viewfinder window

    private var viewfinder: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(.black)
            CameraPreviewView(session: viewModel.captureSession) { point in
                viewModel.focus(at: point)
            }
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .padding(6)

            if viewModel.gridEnabled {
                GridOverlayView().padding(6)
            }
            if viewModel.flashFlare {
                Color.white
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(6)
                    .transition(.opacity)
            }
            // Viewfinder corner brackets.
            ViewfinderBrackets().padding(16)

            if viewModel.authorization == .denied || viewModel.authorization == .restricted {
                permissionDenied
            }
        }
        .aspectRatio(4.0 / 5.0, contentMode: .fit)
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(.black.opacity(0.6), lineWidth: 3)
        )
        .shadow(color: .black.opacity(0.5), radius: 6, y: 3)
    }

    // MARK: Control strip (counter + flash/grid)

    private var controlStrip: some View {
        HStack {
            FrameCounterView(
                shot: viewModel.activeRoll?.frameCount ?? 0,
                capacity: viewModel.activeRoll?.capacity ?? 27
            )
            Spacer()
            Button { viewModel.cycleFlash() } label: {
                Image(systemName: viewModel.flashMode.systemImageName)
                    .font(.title3)
                    .foregroundStyle(viewModel.isFlashAvailable ? FilmTheme.accent : .gray)
                    .frame(width: 40, height: 36)
            }
            .disabled(!viewModel.isFlashAvailable)
            .accessibilityLabel("Flash: \(viewModel.flashMode.rawValue)")

            Button { viewModel.toggleGrid() } label: {
                Image(systemName: "grid")
                    .font(.title3)
                    .foregroundStyle(viewModel.gridEnabled ? FilmTheme.accent : .white.opacity(0.85))
                    .frame(width: 40, height: 36)
            }
            .accessibilityLabel("Grid \(viewModel.gridEnabled ? "on" : "off")")

            if !viewModel.availableLenses.isEmpty, viewModel.activeRoll != nil {
                LensSelectorView(
                    lenses: viewModel.availableLenses,
                    selected: viewModel.selectedLens
                ) { viewModel.selectLens($0) }
            }
        }
    }

    // MARK: Bottom plate (shutter + winder)

    private var bottomPlate: some View {
        HStack(alignment: .center) {
            Spacer()
            ShutterButton(
                isEnabled: viewModel.activeRoll != nil
                    && !(viewModel.activeRoll?.isFull ?? true)
                    && !viewModel.isCapturing
            ) {
                Task { await viewModel.capture() }
            }
            Spacer()
        }
        .overlay(alignment: .trailing) {
            WindingLeverView(isWinding: viewModel.isWinding)
                .padding(.trailing, 6)
        }
        .overlay(alignment: .leading) {
            if viewModel.activeRoll == nil {
                Button { showNewRoll = true } label: {
                    Label("Load", systemImage: "plus.circle.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(FilmTheme.accent)
                }
            }
        }
        .padding(.bottom, 18)
    }

    private var capturedToast: some View {
        Text("Frame captured")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 18).padding(.vertical, 10)
            .background(.ultraThinMaterial, in: Capsule())
            .padding(.top, 70)
            .frame(maxHeight: .infinity, alignment: .top)
    }

    private var permissionDenied: some View {
        VStack(spacing: 10) {
            Image(systemName: "camera.fill").font(.largeTitle)
            Text("Camera access is off").font(.headline)
            Text("Enable camera access in Settings to shoot film.")
                .font(.footnote)
                .multilineTextAlignment(.center)
                .foregroundStyle(.white.opacity(0.7))
            #if canImport(UIKit)
            Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(FilmTheme.accent)
            #endif
        }
        .foregroundStyle(.white)
        .padding()
    }
}

/// Corner brackets drawn inside the viewfinder for a framing feel.
private struct ViewfinderBrackets: View {
    var body: some View {
        GeometryReader { geo in
            let len: CGFloat = 18
            let w = geo.size.width, h = geo.size.height
            Path { p in
                // TL
                p.move(to: CGPoint(x: 0, y: len)); p.addLine(to: .zero); p.addLine(to: CGPoint(x: len, y: 0))
                // TR
                p.move(to: CGPoint(x: w - len, y: 0)); p.addLine(to: CGPoint(x: w, y: 0)); p.addLine(to: CGPoint(x: w, y: len))
                // BL
                p.move(to: CGPoint(x: 0, y: h - len)); p.addLine(to: CGPoint(x: 0, y: h)); p.addLine(to: CGPoint(x: len, y: h))
                // BR
                p.move(to: CGPoint(x: w - len, y: h)); p.addLine(to: CGPoint(x: w, y: h)); p.addLine(to: CGPoint(x: w, y: h - len))
            }
            .stroke(.white.opacity(0.5), lineWidth: 2)
        }
        .allowsHitTesting(false)
    }
}

#Preview {
    CameraScreen()
        .modelContainer(for: [FilmRoll.self, CapturedFrame.self, CustomRecipeRecord.self], inMemory: true)
}
