import Foundation

/// Defines *when* a ``FilmRoll`` becomes developable (unlockable).
///
/// The schedule is the emotional core of Delayed Film: once a roll is created
/// the user commits to a development moment and cannot peek before it arrives.
///
/// The enum itself carries no resolved date for the calendar-relative cases
/// (`endOfWeek`, etc.). The concrete unlock `Date` is resolved once, at roll
/// creation time, by ``DevelopmentScheduler`` and then persisted on the roll so
/// that the lock is deterministic and immune to the user changing the device
/// clock backwards.
enum DevelopmentSchedule: Codable, Hashable, Sendable {
    case endOfWeek
    case endOfMonth
    case endOfQuarter
    case endOfYear
    /// A user-chosen absolute unlock moment.
    case custom(Date)

    /// Stable string code used for persistence and analytics-free logging.
    var code: String {
        switch self {
        case .endOfWeek:    return "endOfWeek"
        case .endOfMonth:   return "endOfMonth"
        case .endOfQuarter: return "endOfQuarter"
        case .endOfYear:    return "endOfYear"
        case .custom:       return "custom"
        }
    }

    /// Human-facing label for pickers and roll metadata.
    var displayName: String {
        switch self {
        case .endOfWeek:    return "End of Week"
        case .endOfMonth:   return "End of Month"
        case .endOfQuarter: return "End of Quarter"
        case .endOfYear:    return "End of Year"
        case .custom:       return "Custom Date"
        }
    }

    /// Calendar-relative presets offered in the UI (excludes `.custom`, which
    /// requires a user-supplied date).
    static var presets: [DevelopmentSchedule] {
        [.endOfWeek, .endOfMonth, .endOfQuarter, .endOfYear]
    }
}
