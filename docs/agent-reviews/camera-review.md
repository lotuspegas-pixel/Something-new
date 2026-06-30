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
