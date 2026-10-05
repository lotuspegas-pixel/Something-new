import Foundation
#if canImport(UIKit)
import UIKit
#endif

/// Tactile feedback events that make the camera feel mechanical.
enum HapticEvent: Sendable {
    case shutter       // the click
    case wind          // advancing the film
    case lensClick     // dial detent
    case lock          // roll sealed
    case reveal        // roll developed
    case warning       // roll full / blocked
}

/// Plays haptics for camera interactions.
///
/// Phase 6 tunes the feel. The protocol keeps views free of `UIKit` haptic
/// types and lets previews/tests use a silent stub.
protocol HapticsService {
    func play(_ event: HapticEvent)
    /// Pre-warms generators so the first tap isn't delayed.
    func prepare()
}

/// No-op haptics for previews, tests, and the simulator.
struct SilentHapticsService: HapticsService {
    func play(_ event: HapticEvent) {}
    func prepare() {}
}

#if canImport(UIKit)
/// `UIKit`-backed haptics.
final class UIKitHapticsService: HapticsService {

    private let impactLight = UIImpactFeedbackGenerator(style: .light)
    private let impactMedium = UIImpactFeedbackGenerator(style: .medium)
    private let impactRigid = UIImpactFeedbackGenerator(style: .rigid)
    private let notification = UINotificationFeedbackGenerator()

    func prepare() {
        impactLight.prepare()
        impactMedium.prepare()
        impactRigid.prepare()
        notification.prepare()
    }

    func play(_ event: HapticEvent) {
        switch event {
        case .shutter:   impactRigid.impactOccurred()
        case .wind:      impactMedium.impactOccurred(intensity: 0.7)
        case .lensClick: impactLight.impactOccurred()
        case .lock:      notification.notificationOccurred(.success)
        case .reveal:    notification.notificationOccurred(.success)
        case .warning:   notification.notificationOccurred(.warning)
        }
    }
}
#endif
