import Foundation
import SwiftData

/// A roll of "film": a locked collection of frames bound to a single recipe and
/// a single development schedule.
///
/// ### Persistence note
/// SwiftData persists primitives cleanly but is awkward with enums that carry
/// associated values (such as ``DevelopmentSchedule/custom(_:)``). We therefore
/// store the *resolved* unlock date plus a stable schedule `code`, and expose a
/// computed ``schedule`` for the domain layer. The resolved `unlockDate` is the
/// single source of truth for the lock — see ``isUnlocked(now:)``.
@Model
final class FilmRoll {

    /// Stable identifier (also used to name the on-disk frame directory).
    @Attribute(.unique) var id: UUID

    /// User-facing roll title, e.g. "Summer '26".
    var title: String

    /// When the roll was created (first armed).
    var createdAt: Date

    /// The resolved absolute moment this roll may be developed. Source of truth
    /// for the lock; never recomputed after creation.
    var unlockDate: Date

    /// Stable code of the originating ``DevelopmentSchedule`` (for display only).
    var scheduleCode: String

    /// For `.custom` schedules, the user-chosen date (mirrors `unlockDate`);
    /// `nil` for calendar-relative presets.
    var customUnlockDate: Date?

    /// The recipe slug every frame in this roll is developed with.
    var recipeID: String

    /// Cached recipe display name so locked rolls can show it without resolving
    /// the catalog.
    var recipeName: String

    /// Number of frames shot. Maintained alongside the `frames` relationship so
    /// the frame counter never requires loading image metadata.
    var frameCount: Int

    /// Maximum frames before the roll auto-finishes, mimicking a physical roll.
    var capacity: Int

    /// Set when the user (or schedule) develops the roll. While `nil` the roll
    /// is locked regardless of date.
    var developedAt: Date?

    /// The frames belonging to this roll. Cascade-deleted with the roll.
    @Relationship(deleteRule: .cascade, inverse: \CapturedFrame.roll)
    var frames: [CapturedFrame]

    init(
        id: UUID = UUID(),
        title: String,
        createdAt: Date = Date(),
        unlockDate: Date,
        schedule: DevelopmentSchedule,
        recipeID: String,
        recipeName: String,
        capacity: Int = 27
    ) {
        self.id = id
        self.title = title
        self.createdAt = createdAt
        self.unlockDate = unlockDate
        self.scheduleCode = schedule.code
        if case let .custom(date) = schedule {
            self.customUnlockDate = date
        } else {
            self.customUnlockDate = nil
        }
        self.recipeID = recipeID
        self.recipeName = recipeName
        self.frameCount = 0
        self.capacity = capacity
        self.developedAt = nil
        self.frames = []
    }

    // MARK: Derived state

    /// Reconstructs the domain ``DevelopmentSchedule`` from persisted fields.
    var schedule: DevelopmentSchedule {
        switch scheduleCode {
        case "endOfWeek":    return .endOfWeek
        case "endOfMonth":   return .endOfMonth
        case "endOfQuarter": return .endOfQuarter
        case "endOfYear":    return .endOfYear
        case "custom":       return .custom(customUnlockDate ?? unlockDate)
        default:             return .custom(unlockDate)
        }
    }

    /// `true` once the roll's frames may be revealed.
    ///
    /// A roll unlocks when its `unlockDate` has passed **or** it has been
    /// explicitly developed. This is the only gate the UI consults before
    /// showing any image. Defaults to "now" but is injectable for tests.
    func isUnlocked(now: Date = Date()) -> Bool {
        if developedAt != nil { return true }
        return now >= unlockDate
    }

    /// Whether the roll has reached its capacity and can take no more frames.
    var isFull: Bool { frameCount >= capacity }
}
