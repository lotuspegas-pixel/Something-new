import Foundation

/// A user-selectable lens on the device.
///
/// Not every device exposes every lens. ``CameraService`` is responsible for
/// reporting which options are actually available on the current hardware; this
/// type only describes the *intent*.
enum CameraLensOption: String, Codable, Hashable, CaseIterable, Identifiable, Sendable {
    case ultraWide   // 0.5x
    case wide        // 1x  (default)
    case telephoto   // 2x / 3x / 5x depending on device
    case front       // selfie

    var id: String { rawValue }

    /// Short label shown on the lens selector dial.
    var shortLabel: String {
        switch self {
        case .ultraWide: return "0.5×"
        case .wide:      return "1×"
        case .telephoto: return "2×"
        case .front:     return "Front"
        }
    }

    /// Accessibility-friendly description.
    var displayName: String {
        switch self {
        case .ultraWide: return "Ultra Wide"
        case .wide:      return "Wide"
        case .telephoto: return "Telephoto"
        case .front:     return "Front Camera"
        }
    }

    /// The sensible default lens when a roll begins.
    static let `default`: CameraLensOption = .wide
}
