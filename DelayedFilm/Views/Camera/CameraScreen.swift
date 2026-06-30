import SwiftUI
import SwiftData
#if canImport(UIKit)
import UIKit
#endif

/// The camera surface. Phase 2 wires the working capture flow; Phase 5 gives it
/// the premium retro body.
///
/// **No-preview invariant:** after the shutter, the frame goes straight to the
/// locked roll. This screen shows a flash, a wind animation, and a "Frame
/// captured" toast — never the image, a thumbnail, or a gallery jump.
struct CameraScreen: View {
    @Environment(\.modelContext) private var modelContext
    @State private var viewModel = CameraViewModel()
    @State private var showNewRoll = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            CameraPreviewView(session: viewModel.captureSession) { point in
                viewModel.focus(at: point)
            }
            .ignoresSafeArea()

            if viewModel.gridEnabled {
                GridOverlayView().ignoresSafeArea()
            }

            // White flash flare on capture.
            if viewModel.flashFlare {
                Color.white.ignoresSafeArea().transition(.opacity)
            }

            VStack {
                topBar
                Spacer()
                if viewModel.authorization == .denied || viewModel.authorization == .restricted {
                    permissionDenied
                    Spacer()
                }
                bottomControls
            }
            .padding()

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

    // MARK: Top bar

    private var topBar: some View {
        HStack {
            Button { viewModel.cycleFlash() } label: {
                Image(systemName: viewModel.flashMode.systemImageName)
                    .font(.title3)
                    .foregroundStyle(viewModel.isFlashAvailable ? .yellow : .gray)
            }
            .disabled(!viewModel.isFlashAvailable)

            Spacer()

            rollChip

            Spacer()

            Button { viewModel.toggleGrid() } label: {
                Image(systemName: viewModel.gridEnabled ? "grid" : "grid")
                    .font(.title3)
                    .foregroundStyle(viewModel.gridEnabled ? .yellow : .white)
            }
        }
        .foregroundStyle(.white)
    }

    private var rollChip: some View {
        Button { showNewRoll = true } label: {
            VStack(spacing: 2) {
                if let roll = viewModel.activeRoll {
                    Text(roll.title.isEmpty ? "Untitled" : roll.title)
                        .font(.subheadline.weight(.semibold))
                    Text(roll.recipeName)
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.7))
                } else {
                    Label("Load a roll", systemImage: "plus.circle")
                        .font(.subheadline.weight(.semibold))
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 6)
            .background(.ultraThinMaterial, in: Capsule())
        }
        .foregroundStyle(.white)
    }

    // MARK: Bottom controls

    private var bottomControls: some View {
        VStack(spacing: 18) {
            if viewModel.activeRoll != nil {
                ExposureControlView { ev in viewModel.setExposure(ev) }
                    .frame(maxWidth: 280)

                LensSelectorView(
                    lenses: viewModel.availableLenses,
                    selected: viewModel.selectedLens
                ) { viewModel.selectLens($0) }
            }

            HStack(alignment: .center) {
                Spacer()
                ShutterButton(
                    isEnabled: viewModel.activeRoll != nil
                        && !(viewModel.activeRoll?.isFull ?? true)
                        && !viewModel.isCapturing
                ) {
                    Task { await viewModel.capture() }
                }
                .rotationEffect(.degrees(viewModel.isWinding ? 30 : 0))
                Spacer()
            }
            .overlay(alignment: .trailing) {
                FrameCounterView(
                    shot: viewModel.activeRoll?.frameCount ?? 0,
                    capacity: viewModel.activeRoll?.capacity ?? 27
                )
                .padding(.trailing, 12)
            }
        }
    }

    private var capturedToast: some View {
        Text("Frame captured")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 18).padding(.vertical, 10)
            .background(.ultraThinMaterial, in: Capsule())
            .padding(.top, 80)
            .frame(maxHeight: .infinity, alignment: .top)
    }

    private var permissionDenied: some View {
        VStack(spacing: 10) {
            Image(systemName: "camera.fill").font(.largeTitle)
            Text("Camera access is off")
                .font(.headline)
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
            #endif
        }
        .foregroundStyle(.white)
        .padding()
    }
}

#Preview {
    CameraScreen()
        .modelContainer(for: [FilmRoll.self, CapturedFrame.self], inMemory: true)
}
