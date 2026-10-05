import SwiftUI
import AVFoundation

/// Hosts the live `AVCaptureVideoPreviewLayer`.
///
/// Shows the *scene*, never a captured frame. When no session is available
/// (simulator / mock), it renders a tasteful placeholder so the rest of the
/// camera UI is still usable.
struct CameraPreviewView: View {
    let session: AVCaptureSession?
    /// Normalized (0…1) tap location reported for tap-to-focus.
    var onFocus: (CGPoint) -> Void = { _ in }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                if let session {
                    PreviewLayerView(session: session)
                        .contentShape(Rectangle())
                        .onTapGesture { location in
                            let point = CGPoint(
                                x: location.x / geo.size.width,
                                y: location.y / geo.size.height
                            )
                            onFocus(point)
                        }
                } else {
                    MockPreview()
                }
            }
        }
    }
}

/// Placeholder shown on the simulator / when there's no capture session.
private struct MockPreview: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(white: 0.10), Color(white: 0.02)],
                startPoint: .top, endPoint: .bottom
            )
            VStack(spacing: 8) {
                Image(systemName: "viewfinder")
                    .font(.system(size: 44, weight: .ultraLight))
                Text("Simulator preview")
                    .font(.caption)
            }
            .foregroundStyle(.white.opacity(0.4))
        }
    }
}

#if canImport(UIKit)
import UIKit

/// `UIView` whose backing layer is the preview layer.
private struct PreviewLayerView: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> PreviewUIView {
        let view = PreviewUIView()
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ uiView: PreviewUIView, context: Context) {
        if uiView.previewLayer.session !== session {
            uiView.previewLayer.session = session
        }
    }
}

final class PreviewUIView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var previewLayer: AVCaptureVideoPreviewLayer {
        layer as! AVCaptureVideoPreviewLayer
    }
}
#else
/// Non-UIKit fallback (e.g. previews on other platforms).
private struct PreviewLayerView: View {
    let session: AVCaptureSession
    var body: some View { Color.black }
}
#endif
