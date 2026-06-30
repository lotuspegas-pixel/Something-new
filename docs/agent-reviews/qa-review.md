# QA / Test Agent — Phase 1 Review

**Agent 5.** Goal: try to break it, and verify Phase 1 in lieu of a compiler.

## Build status

No Swift/Xcode toolchain in this environment, and the app depends on Apple-only
frameworks (SwiftUI, SwiftData, AVFoundation, CoreImage, PhotoKit, Metal). A
real compile is therefore impossible here and is deferred to a Mac via
`xcodegen generate` + Xcode. The review below is a manual static pass.

## Static review findings

- **Models compile-cleanly by inspection.** `FilmRoll`/`CapturedFrame` are
  `@Model` classes with primitive-only stored properties and one cascade
  relationship; no associated-value enums are persisted (resolved at AD-3).
- **`DevelopmentSchedule.custom(Date)` not persisted directly** — good, avoids
  SwiftData enum pitfalls. Reconstructed via `scheduleCode` + `customUnlockDate`.
- **Async hygiene:** `ImageProcessingService.process` hops to a detached
  `Task` so Core Image work never blocks the main actor.
- **Injectable seams present:** calendar (scheduler), root directory + processor
  (store) — enabled clean unit tests.

## Tests authored

| Test file | Covers |
|-----------|--------|
| `DevelopmentSchedulerTests` | end-of week/month/quarter/year/custom resolution with a pinned UTC calendar. |
| `FilmRollTests` | lock before/after date, `developedAt` override, capacity, schedule round-trip. |
| `RecipeSerializationTests` | recipe Codable round-trip, unique catalog ids, catalog lookup, tone-curve monotonicity + clamping. |
| `NoPreviewRuleTests` | locked roll throws `RollLockedError`; unlocked roll returns bytes; frame has no image storage. |

## Attempts to break the no-preview rule

- Searched for any view binding to frame bytes → none. Roll list/detail render
  metadata only.
- `revealedImageData` is the sole byte reader and is gated. ✅
- No `PHAsset` creation path reachable before reveal. ✅

## Risks carried into later phases

- `DefaultImageProcessingService.process` uses real Core Image; must be smoke-
  tested on device (Phase 3). Tests use a stub processor to stay headless.
- Quarter math assumes Gregorian calendar; revisit if localized calendars matter.

**Verdict:** Phase 1 foundation accepted, pending a Mac build to confirm zero
compiler diagnostics.
