import Foundation
import AVFoundation

/// Authorization state for camera access, decoupled from AVFoundation so views
/// and tests don't depend on `AVAuthorizationStatus` directly.
enum CameraAuthorization: Equatable, Sendable {
    case notDetermined
    case authorized
    case denied
    case restricted
}

/// Wraps the camera permission prompt and current authorization state.
///
/// Phase 2 wires this into the camera screen's first-run flow. The protocol lets
/// the UI and tests run against a mock without touching the system prompt.
protocol CameraPermissionService {
    /// The current authorization, read synchronously.
    var current: CameraAuthorization { get }
    /// Requests access if undetermined; returns the resulting authorization.
    func requestAccess() async -> CameraAuthorization
}

/// Real AVFoundation-backed implementation.
struct AVCameraPermissionService: CameraPermissionService {

    var current: CameraAuthorization {
        Self.map(AVCaptureDevice.authorizationStatus(for: .video))
    }

    func requestAccess() async -> CameraAuthorization {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            return .authorized
        case .notDetermined:
            let granted = await AVCaptureDevice.requestAccess(for: .video)
            return granted ? .authorized : .denied
        case .denied:
            return .denied
        case .restricted:
            return .restricted
        @unknown default:
            return .denied
        }
    }

    private static func map(_ status: AVAuthorizationStatus) -> CameraAuthorization {
        switch status {
        case .authorized:    return .authorized
        case .notDetermined: return .notDetermined
        case .denied:        return .denied
        case .restricted:    return .restricted
        @unknown default:    return .denied
        }
    }
}
