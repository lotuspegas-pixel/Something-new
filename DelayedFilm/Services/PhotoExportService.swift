import Foundation
import Photos

/// Export authorization, decoupled from `PHAuthorizationStatus`.
enum PhotoExportAuthorization: Sendable {
    case notDetermined, authorized, limited, denied, restricted
}

/// Exports *revealed* frames to the system photo library.
///
/// This is the only component permitted to hand image bytes to Photos, and it
/// is reachable only from the revealed gallery (Phase 8). It requests
/// add-only permission lazily, on first export.
protocol PhotoExportService {
    var current: PhotoExportAuthorization { get }
    func requestAddPermission() async -> PhotoExportAuthorization
    /// Saves already-revealed JPEG data to the user's library.
    func export(jpegData: Data) async throws
}

/// PhotoKit-backed implementation (add-only access).
struct PhotoKitExportService: PhotoExportService {

    var current: PhotoExportAuthorization {
        Self.map(PHPhotoLibrary.authorizationStatus(for: .addOnly))
    }

    func requestAddPermission() async -> PhotoExportAuthorization {
        let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        return Self.map(status)
    }

    func export(jpegData: Data) async throws {
        try await PHPhotoLibrary.shared().performChanges {
            let request = PHAssetCreationRequest.forAsset()
            request.addResource(with: .photo, data: jpegData, options: nil)
        }
    }

    private static func map(_ status: PHAuthorizationStatus) -> PhotoExportAuthorization {
        switch status {
        case .authorized:    return .authorized
        case .limited:       return .limited
        case .denied:        return .denied
        case .restricted:    return .restricted
        case .notDetermined: return .notDetermined
        @unknown default:    return .denied
        }
    }
}
