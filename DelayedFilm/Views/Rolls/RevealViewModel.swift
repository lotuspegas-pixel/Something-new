import Foundation
import SwiftUI
import SwiftData
import Observation
#if canImport(UIKit)
import UIKit
#endif

/// Drives the development ceremony and loads revealed frames for one roll.
///
/// Images are read **only** through ``FilmRollStore/revealedImageData(for:now:)``,
/// which throws while the roll is locked — so this view-model physically cannot
/// surface a frame before reveal.
@MainActor
@Observable
final class RevealViewModel {

    let roll: FilmRoll

    private let haptics: HapticsService
    private let exporter: PhotoExportService
    private var store: FilmRollStore?

    var isExporting = false
    var exportMessage: String?

    /// Transient developing animation flag.
    var isDeveloping = false
    /// Index of the staged emotional copy shown during developing.
    var developingStage = 0
    /// Decoded thumbnails by frame id (for the contact sheet).
    var thumbnails: [UUID: UIImage] = [:]
    var loadError: String?

    /// Staged copy shown while the tray "develops".
    let developingLines = [
        "Developing your roll…",
        "Fixing the image…",
        "Almost dry…"
    ]

    init(roll: FilmRoll,
         haptics: HapticsService = SilentHapticsService(),
         exporter: PhotoExportService = PhotoKitExportService(),
         store: FilmRollStore? = nil) {
        self.roll = roll
        self.haptics = haptics
        self.exporter = exporter
        self.store = store
    }

    func configure(modelContext: ModelContext) {
        if store == nil {
            store = SwiftDataFilmRollStore(context: modelContext)
        }
    }

    // MARK: Develop ceremony

    /// Develops a ready roll with a staged animation, then loads thumbnails.
    /// No-op unless the roll is `readyToReveal`.
    func develop() async {
        guard let store, roll.isReadyToReveal() else { return }
        isDeveloping = true
        haptics.play(.reveal)

        for stage in developingLines.indices {
            developingStage = stage
            try? await Task.sleep(nanoseconds: 850_000_000)
        }

        do {
            try store.develop(roll, now: Date())
        } catch {
            loadError = "Couldn't develop this roll."
        }
        isDeveloping = false
        await loadThumbnails()
    }

    // MARK: Image loading (revealed only)

    func loadThumbnails() async {
        guard let store, roll.developedAt != nil else { return }
        let frames = roll.frames.sorted { $0.index < $1.index }
        for frame in frames where thumbnails[frame.id] == nil {
            if let image = decodeThumbnail(for: frame, store: store) {
                thumbnails[frame.id] = image
            }
        }
    }

    /// Full-resolution image for the single-frame viewer, decoded on demand.
    func fullImage(for frame: CapturedFrame) -> UIImage? {
        guard let store, let data = try? store.revealedImageData(for: frame, now: Date()) else {
            return nil
        }
        return UIImage(data: data)
    }

    // MARK: Export & share (revealed only)

    /// Returns JPEG data for sharing — only for unlocked rolls (gated by the
    /// store). Returns empty if the roll is still locked.
    func shareData(for frames: [CapturedFrame]) -> [Data] {
        guard let store, roll.developedAt != nil else { return [] }
        return frames.compactMap { try? store.revealedImageData(for: $0, now: Date()) }
    }

    /// Exports the given frames to the photo library, requesting add-only
    /// permission lazily. Refuses if the roll is locked.
    func exportToPhotos(_ frames: [CapturedFrame]) async {
        guard let store, roll.developedAt != nil else {
            exportMessage = "This roll isn't developed yet."
            return
        }
        isExporting = true
        defer { isExporting = false }

        let auth = await exporter.requestAddPermission()
        guard auth == .authorized || auth == .limited else {
            exportMessage = "Photos access is needed to export."
            return
        }

        var exported = 0
        for frame in frames {
            // Reading goes through the lock gate; a locked frame simply throws.
            guard let data = try? store.revealedImageData(for: frame, now: Date()) else { continue }
            do {
                try await exporter.export(jpegData: data)
                exported += 1
            } catch {
                // Continue with the rest; report at the end.
            }
        }
        haptics.play(.reveal)
        exportMessage = exported == frames.count
            ? "Saved \(exported) photo\(exported == 1 ? "" : "s") to Photos."
            : "Saved \(exported) of \(frames.count). Some couldn't be exported."
    }

    private func decodeThumbnail(for frame: CapturedFrame, store: FilmRollStore) -> UIImage? {
        guard let data = try? store.revealedImageData(for: frame, now: Date()),
              let full = UIImage(data: data) else { return nil }
        // Downsample for the grid to keep memory bounded.
        let target = CGSize(width: 400, height: 400)
        return full.preparingThumbnail(of: target) ?? full
    }
}
