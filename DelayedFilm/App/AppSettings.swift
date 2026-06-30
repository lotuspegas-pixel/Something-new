import Foundation

/// Central registry of user-preference keys and defaults, persisted in
/// `UserDefaults`. Views bind to these via `@AppStorage(AppSettings.X)`; services
/// that can't use the property wrapper read them through the helpers here.
enum AppSettings {
    static let defaultScheduleKey = "settings.defaultSchedule"     // SchedulePresetChoice.rawValue
    static let defaultFrameCountKey = "settings.defaultFrameCount" // Int
    static let hapticsEnabledKey = "settings.hapticsEnabled"       // Bool
    static let soundEnabledKey = "settings.soundEnabled"           // Bool
    static let gridEnabledKey = "settings.gridEnabled"             // Bool
    static let dateStampDefaultKey = "settings.dateStampDefault"   // String
    static let saveOriginalKey = "settings.saveOriginalCopy"       // Bool (default false)

    /// Registers sensible defaults once at launch.
    static func registerDefaults() {
        UserDefaults.standard.register(defaults: [
            defaultScheduleKey: SchedulePresetChoice.endOfMonth.rawValue,
            defaultFrameCountKey: 27,
            hapticsEnabledKey: true,
            soundEnabledKey: true,
            gridEnabledKey: false,
            dateStampDefaultKey: "none",
            saveOriginalKey: false
        ])
    }

    // MARK: Convenience reads (for non-View consumers)

    static var hapticsEnabled: Bool { UserDefaults.standard.bool(forKey: hapticsEnabledKey) }
    static var soundEnabled: Bool { UserDefaults.standard.bool(forKey: soundEnabledKey) }
    static var gridEnabled: Bool { UserDefaults.standard.bool(forKey: gridEnabledKey) }
    static var saveOriginalCopy: Bool { UserDefaults.standard.bool(forKey: saveOriginalKey) }

    static var defaultFrameCount: Int {
        let value = UserDefaults.standard.integer(forKey: defaultFrameCountKey)
        return value == 0 ? 27 : value
    }

    static var defaultSchedule: SchedulePresetChoice {
        guard let raw = UserDefaults.standard.string(forKey: defaultScheduleKey),
              let choice = SchedulePresetChoice(rawValue: raw) else { return .endOfMonth }
        return choice
    }
}
