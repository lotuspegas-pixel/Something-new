# iOS Camera Engineer — Phase 1 Review

**Agent 2.** Phase 1 establishes the camera *contracts*; no live session yet.

## Delivered

- `CameraService` protocol: lens enumeration, start/stop, lens select, flash,
  exposure bias, tap-to-focus, and `capture() async throws -> CapturedPhoto`.
- `MockCameraService`: simulator/test-safe; synthesizes a full-res frame so the
  capture → render → store path runs with no hardware.
- `CameraPermissionService` with a real `AVFoundation` implementation and a
  decoupled `CameraAuthorization` enum.
- `Info.plist` `NSCameraUsageDescription` written.

## Key design choices

- **`CapturedPhoto` carries a `CIImage`, never a `UIImage`.** There is
  deliberately no displayable type leaving the camera layer — this is the first
  line of defense for the no-preview rule.
- The mock is **additive**: it does not stub out or weaken the real device path
  that Phase 2 will implement behind the same protocol.

## Phase 2 plan

- `AVCaptureSession` + `AVCapturePhotoOutput`; `AVCaptureDeviceDiscoverySession`
  to populate `availableLenses` from actual hardware.
- `AVCaptureVideoPreviewLayer` via `UIViewRepresentable` in `CameraPreviewView`.
- Map `CameraFlashMode`/exposure/focus onto device APIs.
- Deliver `AVCapturePhotoOutput` results as `CapturedPhoto` (CIImage from photo
  pixel buffer) straight into `FilmRollStore.addFrame`.

## Watch-outs flagged

- Front camera mirroring on capture.
- Lens availability varies by device; never assume telephoto exists.
- Ensure capture completion never routes the image to any view.

---

## Phase 2 — Delivered (camera capture vertical slice)

- **`AVCameraService`**: `AVCaptureSession` (`.photo` preset) + `AVCapturePhotoOutput`;
  all mutation on a serial `sessionQueue`; `capture()` bridges the
  `AVCapturePhotoCaptureDelegate` callback to an `async` continuation; output
  converted to an EXIF-oriented `CIImage`. Lens discovery via
  `AVCaptureDevice.default(...)` populates `availableLenses`; lens switch swaps
  the input. Flash mapped per capture; exposure bias via `setExposureTargetBias`
  (clamped to device range); tap-to-focus via focus/exposure points.
- **`CameraPreviewView`**: `UIViewRepresentable` whose layer class is
  `AVCaptureVideoPreviewLayer`; falls back to a placeholder when `session == nil`
  (simulator/mock). Tap reports normalized focus point.
- **`CameraViewModel`** (`@MainActor @Observable`): permission → start → controls
  → capture → `FilmRollStore.addFrame` → feedback. Picks `MockCameraService` +
  silent haptics under `targetEnvironment(simulator)`, real services otherwise.
- **`CameraScreen`**: flash/grid/roll chip, lens selector, exposure slider,
  shutter + frame counter, permission-denied state with Settings deep link,
  new-roll sheet.
- **Capture feedback = flash flare → wind (shutter rotation) → "Frame captured"
  toast → haptic.** No image, no thumbnail, no gallery navigation.

### No-preview verification (Phase 2)

- `capture()` returns `CapturedPhoto` (a `CIImage`) only to the view-model, which
  hands it straight to the store; the VM holds no image property.
- `CameraScreen` has no code path that renders captured pixels.
- `CameraCaptureTests` asserts a captured frame increments the counter, exists on
  disk, and still throws `RollLockedError` on read.

### Carried to later phases

- Simulator can't run a real session → mock path is the simulator's reality.
- Real-device manual test plan (lenses, flash, focus, orientation) is in the
  final QA report (Phase 7).
