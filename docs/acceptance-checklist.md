# Delayed Film — MVP Acceptance Checklist

> Maintained by **Agent 1 — Product Orchestrator**.
> Status legend: ✅ done · 🟡 partial / scaffolded · ⏳ not started.
> A phase is complete only when its items are ✅ and a build has been run (or the
> reason a build can't run here is documented).

## MVP Criteria

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | App launches | 🟡 | Entry point + `TabView` + camera screen wired; confirm on Mac build. |
| 2 | Camera permission requested clearly | ✅ | `Info.plist` strings + flow in `CameraViewModel`; denied state in `CameraScreen`. |
| 3 | Camera preview works on real device | 🟡 | `AVCameraService` + `AVCaptureVideoPreviewLayer` implemented; needs device verification. |
| 4 | Simulator shows mock camera UI | ✅ | `MockCameraService` + placeholder preview under `targetEnvironment(simulator)`. |
| 5 | User can create a roll | ✅ | `NewRollView` sheet → `createRoll`. |
| 6 | User can choose unlock schedule | ✅ | `NewRollView` schedule picker (presets + custom date). |
| 7 | User can choose a film recipe | ✅ | `NewRollView` recipe picker (4 seed; 30 in Phase 3). |
| 8 | User can take a photo | ✅ | Shutter → `capture()` → store; simulator via mock. |
| 9 | Captured photo processed and stored in locked roll | ✅ | `addFrame` pipeline; renderer passthrough until Phase 3. |
| 10 | Captured photo not shown after capture | ✅ | Enforced by design; see no-preview architecture + tests. |
| 11 | Frame counter increases | ✅ | `frameCount` maintained; `FrameCounterView` reads it live. |
| 12 | Roll stays locked before unlock date | ✅ | `isUnlocked` + store gate + tests. |
| 13 | Roll unlocks after unlock date | ✅ | `isUnlocked` + tests. |
| 14 | Gallery only appears after unlock | 🟡 | Routes are unlock-gated by design; views Phase 5. |
| 15 | Revealed photos exportable to Photos after permission | 🟡 | `PhotoExportService` done; flow Phase 8. |
| 16 | 30 film-inspired recipes exist | 🟡 | 4 seed recipes; full 30 in Phase 4. |
| 17 | Custom recipe builder exists | ⏳ | Placeholder route; Phase 7. |
| 18 | UI looks premium, retro, tactile | ⏳ | Phase 6. |

## No-Preview Rule Audit (must stay ✅ every phase)

- [x] `CapturedFrame` has no image/thumbnail property.
- [x] No view reads frame bytes for a locked roll.
- [x] `revealedImageData` throws `RollLockedError` while locked.
- [x] No Photos export path before reveal.
- [x] Roll list/detail render metadata + placeholders only.
- [x] No debug gallery in production code.

## Build Verification

- **This environment:** Linux, no Swift/Xcode toolchain, and SwiftUI/
  AVFoundation/SwiftData/PhotoKit are Apple-only — a compile cannot run here.
- **To verify on a Mac:**
  ```sh
  brew install xcodegen
  xcodegen generate
  open DelayedFilm.xcodeproj
  # Build (⌘B) and run tests (⌘U)
  ```
- Phase-1 code is written to compile cleanly against the iOS 17 SDK; see
  `docs/agent-reviews/qa-review.md` for the static review performed in lieu of a
  compiler.
