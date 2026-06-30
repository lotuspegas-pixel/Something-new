import Foundation
import CoreImage
import CoreGraphics

/// Flash behavior, decoupled from `AVCaptureDevice.FlashMode`.
enum CameraFlashMode: String, CaseIterable, Sendable {
    case off, on, auto
}

/// The product of a single capture: a full-resolution image plus its
/// dimensions. Deliberately *not* a `UIImage` — nothing in the camera layer
/// should hold a displayable preview of the shot.
struct CapturedPhoto {
    let image: CIImage
    let pixelWidth: Int
    let pixelHeight: Int
}

/// Errors a capture can surface.
enum CameraError: Error, Sendable {
    case notAuthorized
    case sessionUnavailable
    case captureFailed
    case notImplemented
}

/// Abstraction over the live capture session.
///
/// Phase 2 implements the real `AVFoundation` session behind this protocol
/// (`AVCaptureSession` + `AVCapturePhotoOutput`, lens switching, flash, exposure
/// bias, tap-to-focus). Phase 1 ships the contract and a simulator-safe mock so
/// the rest of the app can be built and the no-preview path exercised.
///
/// Conformers are reference types because they own a live session.
protocol CameraService: AnyObject {
    /// Lenses the current hardware actually supports.
    var availableLenses: [CameraLensOption] { get }
    /// Whether the session is currently running.
    var isRunning: Bool { get }

    func start() async throws
    func stop()

    func select(lens: CameraLensOption)
    func setFlash(_ mode: CameraFlashMode)
    /// Exposure compensation in stops (EV).
    func setExposureBias(_ ev: Float)
    /// Tap-to-focus at a normalized point (0…1, 0…1) in preview space.
    func focus(at point: CGPoint)

    /// Captures a full-resolution photo. The returned image is handed straight
    /// to processing/storage and never shown.
    func capture() async throws -> CapturedPhoto
}

/// Simulator- and test-safe camera that synthesizes frames.
///
/// Returns a deterministic generated image so the capture → render → store →
/// reveal pipeline can run with no hardware, **without** weakening the real
/// device implementation that lands in Phase 2.
final class MockCameraService: CameraService {

    let availableLenses: [CameraLensOption] = [.ultraWide, .wide, .telephoto, .front]
    private(set) var isRunning = false

    private var selectedLens: CameraLensOption = .wide
    private var flash: CameraFlashMode = .off
    private var exposureBias: Float = 0

    func start() async throws { isRunning = true }
    func stop() { isRunning = false }

    func select(lens: CameraLensOption) { selectedLens = lens }
    func setFlash(_ mode: CameraFlashMode) { flash = mode }
    func setExposureBias(_ ev: Float) { exposureBias = ev }
    func focus(at point: CGPoint) { /* no-op in mock */ }

    func capture() async throws -> CapturedPhoto {
        // A flat color frame stands in for a real exposure. The recipe engine
        // and storage path don't care that it's synthetic.
        let width = 4032, height = 3024
        let extent = CGRect(x: 0, y: 0, width: width, height: height)
        let base = CIImage(color: CIColor(red: 0.55, green: 0.5, blue: 0.45))
            .cropped(to: extent)
        return CapturedPhoto(image: base, pixelWidth: width, pixelHeight: height)
    }
}
