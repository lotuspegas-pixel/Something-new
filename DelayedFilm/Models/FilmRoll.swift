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

    /// Set when the user archives a revealed roll.
    var archivedAt: Date?

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
        self.archivedAt = nil
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

    /// The roll's lifecycle state at a given moment.
    ///
    /// `.developing` is a transient UI state (the reveal animation) and is never
    /// returned here — it's driven by the reveal view-model. The persisted truth
    /// is the combination of `developedAt`, `archivedAt`, `unlockDate`, and
    /// `frameCount`.
    func state(now: Date = Date()) -> RollState {
        if archivedAt != nil { return .archived }
        if developedAt != nil { return .revealed }
        if now >= unlockDate { return .readyToReveal }
        if isFull { return .full }
        return .active
    }

    /// Convenience using the current time.
    var currentState: RollState { state() }

    /// Ready to be developed: unlocked, not yet developed, not archived.
    func isReadyToReveal(now: Date = Date()) -> Bool {
        state(now: now) == .readyToReveal
    }

    /// Whether more frames can still be shot into this roll.
    func canShoot(now: Date = Date()) -> Bool {
        state(now: now) == .active
    }
}

/// The lifecycle of a film roll.
enum RollState: String, Codable, Hashable, Sendable {
    /// Loaded and accepting frames.
    case active
    /// At capacity but not yet unlockable.
    case full
    /// Reveal animation in progress (transient, UI-only).
    case developing
    /// Unlock date passed; awaiting the user's develop tap.
    case readyToReveal
    /// Developed — frames are viewable.
    case revealed
    /// Put away by the user.
    case archived

    var displayName: String {
        switch self {
        case .active:        return "Shooting"
        case .full:          return "Full"
        case .developing:    return "Developing"
        case .readyToReveal: return "Ready to develop"
        case .revealed:      return "Revealed"
        case .archived:      return "Archived"
        }
    }

    var systemImage: String {
        switch self {
        case .active:        return "camera.fill"
        case .full:          return "tray.full.fill"
        case .developing:    return "hourglass"
        case .readyToReveal: return "sparkles"
        case .revealed:      return "photo.stack.fill"
        case .archived:      return "archivebox.fill"
        }
    }
}
