import Foundation

/// Resolves a ``DevelopmentSchedule`` into the absolute `Date` at which a roll
/// may be developed.
///
/// Resolution happens **once**, at roll creation, and the result is persisted on
/// the roll. This keeps the lock deterministic and prevents drift if the user
/// changes the device clock. The calendar is injectable so tests can pin a time
/// zone and reference dates.
protocol DevelopmentScheduler {
    /// The absolute unlock moment for `schedule`, evaluated relative to
    /// `creationDate`.
    func unlockDate(for schedule: DevelopmentSchedule, from creationDate: Date) -> Date
}

/// Calendar-based implementation. Boundary moments are the *start of the next
/// period* (exclusive end of the current one), e.g. end-of-week resolves to
/// 00:00 on the following Monday.
struct CalendarDevelopmentScheduler: DevelopmentScheduler {

    var calendar: Calendar

    init(calendar: Calendar = .current) {
        self.calendar = calendar
    }

    func unlockDate(for schedule: DevelopmentSchedule, from creationDate: Date) -> Date {
        switch schedule {
        case .endOfWeek:
            return endOfPeriod(.weekOfYear, from: creationDate)
        case .endOfMonth:
            return endOfPeriod(.month, from: creationDate)
        case .endOfQuarter:
            return endOfQuarter(from: creationDate)
        case .endOfYear:
            return endOfPeriod(.year, from: creationDate)
        case .custom(let date):
            return date
        }
    }

    // MARK: Helpers

    private func endOfPeriod(_ component: Calendar.Component, from date: Date) -> Date {
        if let interval = calendar.dateInterval(of: component, for: date) {
            return interval.end
        }
        // Fallback: one period forward from the start of day.
        return calendar.date(byAdding: component, value: 1, to: date) ?? date
    }

    private func endOfQuarter(from date: Date) -> Date {
        let month = calendar.component(.month, from: date)
        let year = calendar.component(.year, from: date)
        // First month of the quarter following the current one.
        let nextQuarterFirstMonth = ((month - 1) / 3 + 1) * 3 + 1   // 4,7,10,13
        var comps = DateComponents()
        comps.day = 1
        comps.hour = 0
        comps.minute = 0
        comps.second = 0
        if nextQuarterFirstMonth > 12 {
            comps.year = year + 1
            comps.month = 1
        } else {
            comps.year = year
            comps.month = nextQuarterFirstMonth
        }
        return calendar.date(from: comps) ?? endOfPeriod(.year, from: date)
    }
}
