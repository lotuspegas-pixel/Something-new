import Foundation
import AVFoundation
import CoreImage
import ImageIO

/// Real `AVFoundation` camera implementation.
///
/// Owns an `AVCaptureSession` with a single video input (swappable for lens
/// changes) and an `AVCapturePhotoOutput`. All session mutation happens on a
/// dedicated serial queue; capture bridges the delegate callback into an
/// `async` continuation.
///
/// The captured photo is converted to a `CIImage` and returned for processing —
/// it is **never** surfaced for display, preserving the no-preview rule.
final class AVCameraService: NSObject, CameraService {

    // MARK: Public state

    private(set) var availableLenses: [CameraLensOption] = [.wide]
    var isRunning: Bool { session.isRunning }
    private(set) var isFlashAvailable = false
    var captureSession: AVCaptureSession? { session }

    // MARK: Private

    private let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private let sessionQueue = DispatchQueue(label: "com.delayedfilm.camera.session")

    private var videoInput: AVCaptureDeviceInput?
    private var currentLens: CameraLensOption = .wide
    private var flashMode: CameraFlashMode = .off
    private var pendingExposureBias: Float = 0

    /// Holds the in-flight capture's continuation + delegate (one at a time).
    private var captureContinuation: CheckedContinuation<CapturedPhoto, Error>?

    // MARK: Lifecycle

    func start() async throws {
        guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
            throw CameraError.notAuthorized
        }
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            sessionQueue.async { [weak self] in
                guard let self else { cont.resume(); return }
                do {
                    try self.configureSessionIfNeeded()
                    if !self.session.isRunning { self.session.startRunning() }
                    cont.resume()
                } catch {
                    cont.resume(throwing: error)
                }
            }
        }
    }

    func stop() {
        sessionQueue.async { [weak self] in
            guard let self, self.session.isRunning else { return }
            self.session.stopRunning()
        }
    }

    // MARK: Configuration

    private func configureSessionIfNeeded() throws {
        guard videoInput == nil else { return }
        session.beginConfiguration()
        session.sessionPreset = .photo

        availableLenses = Self.discoverLenses()
        let lens = availableLenses.contains(.wide) ? .wide : (availableLenses.first ?? .wide)
        try setInput(for: lens)
        currentLens = lens

        if session.canAddOutput(photoOutput) {
            session.addOutput(photoOutput)
            photoOutput.maxPhotoQualityPrioritization = .quality
        } else {
            session.commitConfiguration()
            throw CameraError.sessionUnavailable
        }
        session.commitConfiguration()
    }

    private func setInput(for lens: CameraLensOption) throws {
        guard let device = Self.device(for: lens) else {
            throw CameraError.sessionUnavailable
        }
        let input = try AVCaptureDeviceInput(device: device)
        if let existing = videoInput {
            session.removeInput(existing)
        }
        guard session.canAddInput(input) else {
            if let existing = videoInput { session.addInput(existing) }
            throw CameraError.sessionUnavailable
        }
        session.addInput(input)
        videoInput = input
        isFlashAvailable = device.hasFlash && photoOutput.supportedFlashModes.count > 1
        applyExposureBias(pendingExposureBias, to: device)
    }

    // MARK: Controls

    func select(lens: CameraLensOption) {
        sessionQueue.async { [weak self] in
            guard let self, lens != self.currentLens,
                  self.availableLenses.contains(lens) else { return }
            self.session.beginConfiguration()
            do {
                try self.setInput(for: lens)
                self.currentLens = lens
            } catch {
                // Keep the previous input on failure.
            }
            self.session.commitConfiguration()
        }
    }

    func setFlash(_ mode: CameraFlashMode) {
        sessionQueue.async { [weak self] in self?.flashMode = mode }
    }

    func setExposureBias(_ ev: Float) {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            self.pendingExposureBias = ev
            if let device = self.videoInput?.device {
                self.applyExposureBias(ev, to: device)
            }
        }
    }

    private func applyExposureBias(_ ev: Float, to device: AVCaptureDevice) {
        do {
            try device.lockForConfiguration()
            let clamped = max(device.minExposureTargetBias,
                              min(device.maxExposureTargetBias, ev))
            device.setExposureTargetBias(clamped)
            device.unlockForConfiguration()
        } catch {
            // Non-fatal: exposure stays at the previous value.
        }
    }

    func focus(at point: CGPoint) {
        sessionQueue.async { [weak self] in
            guard let self, let device = self.videoInput?.device else { return }
            do {
                try device.lockForConfiguration()
                if device.isFocusPointOfInterestSupported {
                    device.focusPointOfInterest = point
                    device.focusMode = .autoFocus
                }
                if device.isExposurePointOfInterestSupported {
                    device.exposurePointOfInterest = point
                    device.exposureMode = .autoExpose
                }
                device.unlockForConfiguration()
            } catch {
                // Non-fatal.
            }
        }
    }

    // MARK: Capture

    func capture() async throws -> CapturedPhoto {
        try await withCheckedThrowingContinuation { cont in
            sessionQueue.async { [weak self] in
                guard let self else {
                    cont.resume(throwing: CameraError.sessionUnavailable); return
                }
                guard self.captureContinuation == nil else {
                    cont.resume(throwing: CameraError.captureFailed); return
                }
                guard self.session.isRunning else {
                    cont.resume(throwing: CameraError.sessionUnavailable); return
                }
                self.captureContinuation = cont

                let settings = AVCapturePhotoSettings()
                if self.isFlashAvailable {
                    settings.flashMode = self.mapFlash(self.flashMode)
                }
                settings.photoQualityPrioritization = .quality
                self.photoOutput.capturePhoto(with: settings, delegate: self)
            }
        }
    }

    private func mapFlash(_ mode: CameraFlashMode) -> AVCaptureDevice.FlashMode {
        switch mode {
        case .off:  return .off
        case .on:   return .on
        case .auto: return .auto
        }
    }

    // MARK: Device discovery

    private static func discoverLenses() -> [CameraLensOption] {
        var result: [CameraLensOption] = []
        if device(for: .ultraWide) != nil { result.append(.ultraWide) }
        if device(for: .wide) != nil { result.append(.wide) }
        if device(for: .telephoto) != nil { result.append(.telephoto) }
        if device(for: .front) != nil { result.append(.front) }
        return result.isEmpty ? [.wide] : result
    }

    private static func device(for lens: CameraLensOption) -> AVCaptureDevice? {
        switch lens {
        case .ultraWide:
            return AVCaptureDevice.default(.builtInUltraWideCamera, for: .video, position: .back)
        case .wide:
            return AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
        case .telephoto:
            return AVCaptureDevice.default(.builtInTelephotoCamera, for: .video, position: .back)
        case .front:
            return AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front)
        }
    }
}

// MARK: - AVCapturePhotoCaptureDelegate

extension AVCameraService: AVCapturePhotoCaptureDelegate {
    func photoOutput(_ output: AVCapturePhotoOutput,
                     didFinishProcessingPhoto photo: AVCapturePhoto,
                     error: Error?) {
        let cont = captureContinuation
        captureContinuation = nil

        if let error {
            cont?.resume(throwing: error)
            return
        }
        guard let data = photo.fileDataRepresentation(),
              let source = CIImage(data: data) else {
            cont?.resume(throwing: CameraError.captureFailed)
            return
        }
        // Honor EXIF orientation so the stored frame is upright.
        let oriented = source.oriented(forExifOrientation: exifOrientation(from: photo))
        let extent = oriented.extent
        cont?.resume(returning: CapturedPhoto(
            image: oriented,
            pixelWidth: Int(extent.width),
            pixelHeight: Int(extent.height)
        ))
    }

    private func exifOrientation(from photo: AVCapturePhoto) -> Int32 {
        if let raw = photo.metadata[kCGImagePropertyOrientation as String] as? UInt32 {
            return Int32(raw)
        }
        return 1
    }
}
