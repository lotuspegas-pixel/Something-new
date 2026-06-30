import SwiftUI

/// The camera surface. Phase 1 is a placeholder; the live `AVFoundation`
/// preview, retro body, shutter, and capture wiring land in Phases 2 and 6.
///
/// Invariant reminder for every future change here: **nothing in this screen
/// ever displays a captured frame.** After the shutter, the image goes straight
/// to the locked roll. No thumbnail, no "last shot" view.
struct CameraScreen: View {
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "camera.aperture")
                    .font(.system(size: 56, weight: .thin))
                    .foregroundStyle(.white.opacity(0.8))
                Text("Delayed Film")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(.white)
                Text("Camera coming in Phase 2")
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.5))
            }
        }
    }
}

#Preview {
    CameraScreen()
}
