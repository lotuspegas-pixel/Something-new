# QA / Test Agent — Review

**Agent 5.** Goal: try to break it, and verify each phase in lieu of a compiler.

## Build status

No Swift/Xcode toolchain in this environment, and the app depends on Apple-only
frameworks (SwiftUI, SwiftData, AVFoundation, CoreImage, PhotoKit, Metal,
UserNotifications). A real compile is deferred to a Mac via `xcodegen generate`
+ Xcode. The reviews below are manual static passes plus the unit suite.

## Test suite

| Test file | Covers |
|-----------|--------|
| `DevelopmentSchedulerTests` | unlock-date resolution per schedule (pinned UTC). |
| `FilmRollTests` | lock logic, capacity, **state machine**, schedule round-trip. |
| `RecipeSerializationTests` | 30-recipe count, unique ids, names match spec, round-trip, mono flag, tone-curve math, seed determinism. |
| `NoPreviewRuleTests` | locked roll refuses bytes; unlocked returns; frame has no image storage. |
| `CameraCaptureTests` | mock capture → store increments counter, file on disk, stays locked. |
| `RevealLogicTests` | develop blocked before unlock; reveals bytes after; archive only after develop. |

## No-preview rule audit (re-run every phase) — ✅

- `CapturedFrame` has no image/thumbnail property.
- `revealedImageData` is the sole byte reader and throws `RollLockedError`
  while locked; `RevealViewModel` (thumbnails + full images) only reads through
  it, so no view can decode a locked frame.
- `RollListView` rows render metadata only; reveal/gallery reachable only for
  developed rolls via state routing.
- No Photos export path before reveal (export lands Phase 7, gated).

## Phase 4 findings

- Roll lifecycle `active → full → readyToReveal → revealed → archived` computed
  purely from persisted fields; `.developing` is transient (reveal VM only).
- `develop` and `archive` are idempotent and gated (date passed / already
  developed). Verified by `RevealLogicTests`.
- Launch reconcile reschedules reminders and opens the Rolls tab when a roll is
  ready; notifications are simulator-guarded.

## Risks carried forward

- Reveal viewer decodes full images on demand (acceptable for MVP; revisit for
  very large rolls).
- Real-device camera + GPU golden-image tests remain a manual-plan item
  (final QA report, Phase 7).
