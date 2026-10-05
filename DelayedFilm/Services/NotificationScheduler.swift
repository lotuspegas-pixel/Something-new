import Foundation
import UserNotifications

/// Schedules optional local reminders for when a roll becomes developable.
///
/// Notifications are opt-in and best-effort: permission is requested lazily and a
/// denied prompt simply means no reminders. Each roll's reminder uses the roll's
/// UUID as its identifier so it can be cancelled or rescheduled idempotently.
protocol NotificationScheduler {
    func requestAuthorization() async -> Bool
    /// Schedules (or reschedules) a reminder at the roll's unlock date.
    func scheduleReveal(for roll: FilmRoll) async
    /// Cancels a roll's pending reminder.
    func cancelReveal(rollID: UUID)
    /// Ensures pending reminders match the current set of locked rolls.
    func reconcile(rolls: [FilmRoll]) async
}

/// `UNUserNotificationCenter`-backed implementation.
struct UserNotificationScheduler: NotificationScheduler {

    private var center: UNUserNotificationCenter { .current() }

    func requestAuthorization() async -> Bool {
        (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
    }

    func scheduleReveal(for roll: FilmRoll) async {
        // Only schedule for rolls that are still locked and in the future.
        guard roll.developedAt == nil, roll.archivedAt == nil,
              roll.unlockDate > Date() else {
            cancelReveal(rollID: roll.id)
            return
        }

        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .authorized
                || settings.authorizationStatus == .provisional else { return }

        let content = UNMutableNotificationContent()
        content.title = "Your roll is developed"
        let name = roll.title.isEmpty ? "A roll" : roll.title
        content.body = "\(name) is ready to reveal — \(roll.frameCount) frames waiting."
        content.sound = .default

        let comps = Calendar.current.dateComponents(
            [.year, .month, .day, .hour, .minute], from: roll.unlockDate)
        let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
        let request = UNNotificationRequest(
            identifier: roll.id.uuidString, content: content, trigger: trigger)
        try? await center.add(request)
    }

    func cancelReveal(rollID: UUID) {
        center.removePendingNotificationRequests(withIdentifiers: [rollID.uuidString])
    }

    func reconcile(rolls: [FilmRoll]) async {
        for roll in rolls where roll.developedAt == nil && roll.archivedAt == nil {
            await scheduleReveal(for: roll)
        }
    }
}

/// No-op scheduler for previews, tests, and the simulator.
struct SilentNotificationScheduler: NotificationScheduler {
    func requestAuthorization() async -> Bool { false }
    func scheduleReveal(for roll: FilmRoll) async {}
    func cancelReveal(rollID: UUID) {}
    func reconcile(rolls: [FilmRoll]) async {}
}
