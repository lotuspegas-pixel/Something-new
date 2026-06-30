import XCTest
@testable import DelayedFilm

/// Verifies unlock-date resolution for each schedule using a pinned UTC
/// calendar so results are stable regardless of the machine's locale.
final class DevelopmentSchedulerTests: XCTestCase {

    private var calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        c.firstWeekday = 2 // Monday
        return c
    }()

    private func date(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 12) -> Date {
        var comps = DateComponents()
        comps.year = y; comps.month = m; comps.day = d; comps.hour = h
        return calendar.date(from: comps)!
    }

    func testCustomReturnsExactDate() {
        let scheduler = CalendarDevelopmentScheduler(calendar: calendar)
        let target = date(2026, 12, 25)
        let result = scheduler.unlockDate(for: .custom(target), from: date(2026, 6, 30))
        XCTAssertEqual(result, target)
    }

    func testEndOfWeekIsAfterCreation() {
        let scheduler = CalendarDevelopmentScheduler(calendar: calendar)
        let creation = date(2026, 6, 30) // a Tuesday
        let unlock = scheduler.unlockDate(for: .endOfWeek, from: creation)
        XCTAssertGreaterThan(unlock, creation)
        // Boundary is the start of the next week (a Monday at 00:00 UTC).
        XCTAssertEqual(calendar.component(.weekday, from: unlock), 2)
    }

    func testEndOfMonthBoundary() {
        let scheduler = CalendarDevelopmentScheduler(calendar: calendar)
        let unlock = scheduler.unlockDate(for: .endOfMonth, from: date(2026, 6, 15))
        // Start of July.
        XCTAssertEqual(calendar.component(.month, from: unlock), 7)
        XCTAssertEqual(calendar.component(.day, from: unlock), 1)
    }

    func testEndOfQuarterFromEachQuarter() {
        let scheduler = CalendarDevelopmentScheduler(calendar: calendar)
        // Q1 -> Apr, Q2 -> Jul, Q3 -> Oct, Q4 -> next Jan
        XCTAssertEqual(calendar.component(.month, from:
            scheduler.unlockDate(for: .endOfQuarter, from: date(2026, 2, 10))), 4)
        XCTAssertEqual(calendar.component(.month, from:
            scheduler.unlockDate(for: .endOfQuarter, from: date(2026, 5, 10))), 7)
        XCTAssertEqual(calendar.component(.month, from:
            scheduler.unlockDate(for: .endOfQuarter, from: date(2026, 8, 10))), 10)
        let q4 = scheduler.unlockDate(for: .endOfQuarter, from: date(2026, 11, 10))
        XCTAssertEqual(calendar.component(.year, from: q4), 2027)
        XCTAssertEqual(calendar.component(.month, from: q4), 1)
    }

    func testEndOfYearBoundary() {
        let scheduler = CalendarDevelopmentScheduler(calendar: calendar)
        let unlock = scheduler.unlockDate(for: .endOfYear, from: date(2026, 6, 15))
        XCTAssertEqual(calendar.component(.year, from: unlock), 2027)
        XCTAssertEqual(calendar.component(.month, from: unlock), 1)
        XCTAssertEqual(calendar.component(.day, from: unlock), 1)
    }
}
