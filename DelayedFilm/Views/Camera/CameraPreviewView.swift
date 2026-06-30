import SwiftUI

/// Hosts the live `AVCaptureVideoPreviewLayer`. Phase 2 implements this with a
/// `UIViewRepresentable`. The preview shows the *scene*, never a captured frame,
/// and any recipe indication here is subtle and non-final.
struct CameraPreviewView: View {
    var body: some View {
        Rectangle()
            .fill(.black)
            .overlay(
                Text("Live preview — Phase 2")
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.4))
            )
    }
}
