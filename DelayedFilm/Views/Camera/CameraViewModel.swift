import Foundation
import SwiftUI
import SwiftData
import Observation
import AVFoundation

/// Coordinates the camera capture vertical slice:
/// active roll → recipe (from roll) → capture → process → hidden store → counter.
///
/// Holds **no captured image**. After a capture it triggers feedback
/// (flash + wind + toast + haptic) and bumps the frame counter, but never
/// surfaces pixels.
@MainActor
@Observable
final class CameraViewModel {

    // MARK: Dependencies (injected; simulator-safe defaults)

    private let camera: CameraService
    private let permission: CameraPermissionService
    private let haptics: HapticsService
    private var store: FilmRollStore?

    // MARK: Observable state

    var authorization: CameraAuthorization = .notDetermined
    var availableLenses: [CameraLensOption] = [.wide]
    var selectedLens: CameraLensOption = .wide
    var flashMode: CameraFlashMode = .off
    var isFlashAvailable: Bool { camera.isFlashAvailable }
    var exposureBias: Float = 0
    var gridEnabled = false

    var activeRoll: FilmRoll?
    var isCapturing = false
    var errorMessage: String?

    // Capture feedback (drives the no-preview animations).
    var flashFlare = false
    var isWinding = false
    var showCapturedToast = false

    /// The live session for the preview view (nil on mock/simulator).
    var captureSession: AVCaptureSession? { camera.captureSession }

    var frameCounterText: String {
        guard let roll = activeRoll else { return "--" }
        return "\(roll.frameCount)/\(roll.capacity)"
    }

    init(
        camera: CameraService = CameraViewModel.makeDefaultCamera(),
        permission: CameraPermissionService = AVCameraPermissionService(),
        haptics: HapticsService = CameraViewModel.makeDefaultHaptics()
    ) {
        self.camera = camera
        self.permission = permission
        self.haptics = haptics
    }

    // MARK: Setup

    /// Wires persistence and brings the camera online. Call from `.task`.
    func configure(modelContext: ModelContext) async {
        if store == nil {
            store = SwiftDataFilmRollStore(context: modelContext)
        }
        haptics.prepare()
        selectActiveRollIfNeeded()
        await requestPermissionAndStart()
    }

    func requestPermissionAndStart() async {
        authorization = permission.current
        if authorization == .notDetermined {
            authorization = await permission.requestAccess()
        }
        guard authorization == .authorized else { return }
        do {
            try await camera.start()
            availableLenses = camera.availableLenses
            if !availableLenses.contains(selectedLens) {
                selectedLens = availableLenses.first ?? .wide
            }
        } catch {
            errorMessage = "Camera unavailable."
        }
    }

    func stop() { camera.stop() }

    private func selectActiveRollIfNeeded() {
        guard activeRoll == nil, let store else { return }
        // Most-recent roll that can still take frames.
        activeRoll = (try? store.rolls())?.first { !$0.isFull && $0.developedAt == nil }
    }

    // MARK: Roll management

    @discardableResult
    func createRoll(
        title: String,
        schedule: DevelopmentSchedule,
        recipe: FilmRecipe,
        capacity: Int
    ) -> FilmRoll? {
        guard let store else { return nil }
        do {
            let roll = try store.createRoll(
                title: title, schedule: schedule, recipe: recipe,
                capacity: capacity, now: Date()
            )
            activeRoll = roll
            haptics.play(.lock)
            return roll
        } catch {
            errorMessage = "Couldn't create roll."
            return nil
        }
    }

    func setActiveRoll(_ roll: FilmRoll) { activeRoll = roll }

    // MARK: Controls

    func cycleFlash() {
        flashMode = flashMode.next
        camera.setFlash(flashMode)
        haptics.play(.lensClick)
    }

    func selectLens(_ lens: CameraLensOption) {
        guard availableLenses.contains(lens) else { return }
        selectedLens = lens
        camera.select(lens: lens)
        haptics.play(.lensClick)
    }

    func setExposure(_ ev: Float) {
        exposureBias = ev
        camera.setExposureBias(ev)
    }

    func toggleGrid() { gridEnabled.toggle() }

    func focus(at point: CGPoint) { camera.focus(at: point) }

    // MARK: Capture

    func capture() async {
        guard !isCapturing else { return }
        guard let store, let roll = activeRoll else {
            errorMessage = "Load a roll first."
            return
        }
        guard !roll.isFull else {
            haptics.play(.warning)
            errorMessage = "This roll is full."
            return
        }

        isCapturing = true
        defer { isCapturing = false }

        // Shutter feedback fires immediately, before the image even exists.
        haptics.play(.shutter)
        await flashAnimation()

        do {
            let photo = try await camera.capture()
            try await store.addFrame(to: roll, photo: photo)   // processed + hidden
            await windAndConfirm()
        } catch {
            haptics.play(.warning)
            errorMessage = "Capture failed."
        }
    }

    // MARK: No-preview capture feedback

    private func flashAnimation() async {
        withAnimation(.easeOut(duration: 0.06)) { flashFlare = true }
        try? await Task.sleep(nanoseconds: 90_000_000)
        withAnimation(.easeIn(duration: 0.18)) { flashFlare = false }
    }

    private func windAndConfirm() async {
        haptics.play(.wind)
        withAnimation(.easeInOut(duration: 0.45)) { isWinding = true }
        try? await Task.sleep(nanoseconds: 450_000_000)
        withAnimation { isWinding = false }

        withAnimation(.spring) { showCapturedToast = true }
        try? await Task.sleep(nanoseconds: 1_200_000_000)
        withAnimation { showCapturedToast = false }
    }

    // MARK: Factories

    static func makeDefaultCamera() -> CameraService {
        #if targetEnvironment(simulator)
        return MockCameraService()
        #else
        return AVCameraService()
        #endif
    }

    static func makeDefaultHaptics() -> HapticsService {
        #if targetEnvironment(simulator)
        return SilentHapticsService()
        #else
        return UIKitHapticsService()
        #endif
    }
}
