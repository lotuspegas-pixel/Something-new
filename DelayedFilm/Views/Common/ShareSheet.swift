import SwiftUI
#if canImport(UIKit)
import UIKit

/// Thin wrapper over `UIActivityViewController` for sharing revealed images.
///
/// Only ever handed bytes from unlocked rolls (callers source items via the
/// reveal view-model's gated readers).
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
#endif
