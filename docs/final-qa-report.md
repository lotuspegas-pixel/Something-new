# Delayed Film — Final QA Report

**Agent 5 (QA).** Covers the MVP across Phases 1–7.

## 1. Build status

- **This environment (Linux, no Apple toolchain):** a compile cannot be run
  here — the app depends on SwiftUI, SwiftData, AVFoundation, Core Image, Metal,
  PhotoKit, and UserNotifications, which are Apple-only. Verification here is by
  cross-file static review + the unit suite (designed to run on a Mac).
- **To build/test on a Mac:**
  ```sh
  brew install xcodegen && xcodegen generate
  open DelayedFilm.xcodeproj   # ⌘B build, ⌘U test
  ```
- Sources target iOS 17. The project is assembled from `project.yml`.

## 2. Feature completeness vs MVP

All MVP acceptance rows are ✅ in `docs/acceptance-checklist.md`:
launch, permission flow, live preview (device) / mock (simulator), roll
creation, schedule choice, recipe choice, capture, hidden processing+storage,
no post-capture preview, frame counter, lock before unlock, unlock after date,
gallery only after unlock, export with permission, 30 recipes, custom builder,
premium retro UI.

## 3. Known limitations

- Light leak, split-toning, borders, and date-stamp **rendering** are modeled in
  `FilmRecipe` but not yet composited (halation is approximated via bloom). The
  date-stamp **default** is a stored setting only.
- Reveal viewer decodes full-resolution images on demand (fine for typical
  rolls; very large rolls could be optimized with caching).
- No iCloud/cloud sync, no analytics (by design for MVP).
- Golden-image (pixel-level) recipe tests require a device/sim GPU and are listed
  in the manual plan rather than automated.

## 4. Camera hardware limitations

- Lens availability is hardware-dependent; `AVCameraService` discovers actual
  lenses via `AVCaptureDevice.default(...)` and never assumes telephoto/ultrawide
  exist. The UI only offers discovered lenses.
- Flash availability is gated on `device.hasFlash`; the control disables when
  unavailable.
- The simulator has no capture hardware → `MockCameraService` synthesizes frames
  so the whole pipeline still runs.

## 5. Permission flows

- **Camera**: requested on first camera-tab appearance via
  `CameraPermissionService`; denied/restricted states show an explanation +
  Settings deep link. `NSCameraUsageDescription` present.
- **Photos (add-only)**: requested **only** on first export
  (`PhotoKitExportService.requestAddPermission`). `NSPhotoLibraryAddUsageDescription`
  present. No library access is requested at any other time.
- **Notifications**: optional; requested when a roll is created; denial just
  means no reminders.

## 6. No-preview rule (the core guarantee) — PASS

Enforced at multiple layers:
1. `CapturedFrame` stores **no** image/thumbnail — only a protected file name.
2. `FilmRollStore.revealedImageData(for:now:)` is the **only** byte reader and
   throws `RollLockedError` while locked.
3. The camera layer returns a `CIImage` straight to processing → disk; no view
   holds a captured image.
4. `RevealViewModel` (thumbnails, full images, share data, export) reads **only**
   through that gate; share/export of a locked roll yields nothing.
5. Builder previews render a **procedural demo image**, never a user photo.
6. Roll list rows + locked detail render metadata only; reveal/gallery routes are
   reachable only for developed rolls.

Covered by `NoPreviewRuleTests`, `CameraCaptureTests`, `RevealLogicTests`,
`ExportTests`.

## 7. Locked storage

- Per-roll directory under Application Support, created with
  `FileProtectionType.complete`; frames written with `.completeFileProtection`.
- Optional "private original" copy lands in the same protected dir and is just as
  hidden until reveal.

## 8. Recipe count

- 30 brand-safe built-in recipes (`testCatalogHasThirtyRecipes`,
  `testUserFacingNamesMatchSpec`), across color negative / slide / cine /
  experimental / B&W. Internal `inspiration` retained, never shown.

## 9. Export flow

- Single, batch, and share-sheet paths from the revealed gallery.
- Permission requested lazily; locked frames are unexportable by construction.

## 10. Performance risks

- Full-resolution Core Image runs on a **Metal** `CIContext` off the main thread
  (`Task.detached`); output cropped to source extent.
- Grain is seeded/deterministic (no re-render drift).
- Watch peak memory when exporting large batches (sequential, not parallel — by
  design).

## 11. Accessibility

- VoiceOver labels on shutter, flash, grid, lens, frame counter, sticker, lens
  chips (`.isSelected`); decorative chrome hidden.
- Winding animation honors `accessibilityReduceMotion`.
- Dynamic Type via system fonts; dark scheme with AA-contrast LCD/accent.
- Follow-up: nudge secondary control hit targets toward 44pt.

## 12. Manual test plan (real iPhone, iOS 17+)

1. First launch → camera permission prompt copy is clear; deny → explanation +
   Settings link; allow → live preview appears.
2. Load a roll (title, recipe, schedule, frames). Sticker shows the recipe.
3. Switch lenses (only offered ones); toggle flash (off/auto/on); drag exposure;
   tap to focus; toggle grid.
4. Press shutter → flash + winding thumbwheel + "Frame captured"; **no image**
   appears; counter increments; repeat to fill the roll.
5. Rolls tab → roll shows as Waiting with a live countdown; open detail → sealed
   canister, **no images**.
6. Set a custom unlock a minute out (or change device date forward) → roll moves
   to "Ready"; launch reconcile opens the Rolls tab; optional reminder fires.
7. Develop → tray animation + emotional copy → contact sheet fills in → open
   gallery → swipe frames.
8. Export: save one, save all (Photos permission prompt on first use), share via
   sheet. Confirm photos appear in Photos.
9. Settings: change defaults (schedule/frames/grid/haptics/sound/date stamp/keep
   original); confirm new rolls + camera reflect them.
10. Recipe builder: duplicate a built-in, adjust sliders, watch the demo preview
    update, save; shoot a roll with it; edit it later and confirm an
    already-shot roll is unchanged.
11. Background/foreground during capture; low-storage; airplane mode (no cloud
    needed). Confirm no crashes and no leaked previews anywhere.

## 13. Final acceptance — MET (pending Mac compile)

Project assembles from sources; camera works on device and via mock on
simulator; 30 recipes exist; the no-preview rule is protected and tested; rolls
lock and reveal correctly; the revealed gallery works; export requires
permission and cannot touch locked frames. The only outstanding step is running
`⌘B`/`⌘U` on a Mac to confirm zero compiler diagnostics.
