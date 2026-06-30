import XCTest
@testable import DelayedFilm

/// Exercises the pure lock/capacity logic on `FilmRoll` without persistence.
final class FilmRollTests: XCTestCase {

    private func makeRoll(unlock: Date, capacity: Int = 27) -> FilmRoll {
        FilmRoll(
            title: "Test",
            unlockDate: unlock,
            schedule: .custom(unlock),
            recipeID: "classic-chrome-64",
            recipeName: "Classic Chrome 64",
            capacity: capacity
        )
    }

    func testLockedBeforeUnlockDate() {
        let future = Date().addingTimeInterval(3600)
        let roll = makeRoll(unlock: future)
        XCTAssertFalse(roll.isUnlocked(now: Date()))
    }

    func testUnlockedAfterUnlockDate() {
        let past = Date().addingTimeInterval(-3600)
        let roll = makeRoll(unlock: past)
        XCTAssertTrue(roll.isUnlocked(now: Date()))
    }

    func testDevelopedOverridesDate() {
        let future = Date().addingTimeInterval(3600)
        let roll = makeRoll(unlock: future)
        roll.developedAt = Date()
        XCTAssertTrue(roll.isUnlocked(now: Date()))
    }

    func testIsFullAtCapacity() {
        let roll = makeRoll(unlock: Date(), capacity: 3)
        XCTAssertFalse(roll.isFull)
        roll.frameCount = 3
        XCTAssertTrue(roll.isFull)
    }

    func testStateMachine() {
        let future = Date().addingTimeInterval(3600)
        let past = Date().addingTimeInterval(-3600)

        let active = makeRoll(unlock: future, capacity: 5)
        active.frameCount = 2
        XCTAssertEqual(active.currentState, .active)
        XCTAssertTrue(active.canShoot())

        let full = makeRoll(unlock: future, capacity: 3)
        full.frameCount = 3
        XCTAssertEqual(full.currentState, .full)
        XCTAssertFalse(full.canShoot())

        let ready = makeRoll(unlock: past)
        XCTAssertEqual(ready.currentState, .readyToReveal)
        XCTAssertTrue(ready.isReadyToReveal())

        let revealed = makeRoll(unlock: past)
        revealed.developedAt = Date()
        XCTAssertEqual(revealed.currentState, .revealed)
        XCTAssertFalse(revealed.isReadyToReveal())

        let archived = makeRoll(unlock: past)
        archived.developedAt = past
        archived.archivedAt = Date()
        XCTAssertEqual(archived.currentState, .archived)
    }

    func testScheduleRoundTripsFromPersistedFields() {
        let roll = FilmRoll(
            title: "EOY",
            unlockDate: Date(),
            schedule: .endOfYear,
            recipeID: "x",
            recipeName: "X"
        )
        XCTAssertEqual(roll.schedule, .endOfYear)
        XCTAssertEqual(roll.scheduleCode, "endOfYear")
    }
}
