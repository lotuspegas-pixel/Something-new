import SwiftUI
import CoreImage
#if canImport(UIKit)
import UIKit
#endif

/// Renders a recipe over a **procedurally generated demo scene** — never a user
/// photo — so the builder can show a live preview while honoring the no-preview
/// rule. The demo image is synthesized in-app (sky gradient, color bars, a
/// skin-tone patch) and shared across swatches.
struct RecipePreviewSwatch: View {
    let recipe: FilmRecipe
    @State private var image: UIImage?

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10).fill(Color(white: 0.1))
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .transition(.opacity)
            } else {
                ProgressView().tint(.white.opacity(0.5))
            }
        }
        .frame(height: 150)
        .task(id: previewKey) {
            let rendered = await RecipePreviewRenderer.shared.render(recipe)
            withAnimation(.easeOut(duration: 0.2)) { image = rendered }
        }
        .accessibilityLabel("Sample preview of \(recipe.displayName) on a demo image")
    }

    /// Re-render whenever a visually relevant parameter changes.
    private var previewKey: Int {
        var hasher = Hasher()
        hasher.combine(recipe.id)
        hasher.combine(recipe.version)
        hasher.combine(recipe.contrast); hasher.combine(recipe.saturation)
        hasher.combine(recipe.ev); hasher.combine(recipe.temperatureShiftK)
        hasher.combine(recipe.tintShift); hasher.combine(recipe.fade)
        hasher.combine(recipe.grainAmount); hasher.combine(recipe.vignetteAmount)
        hasher.combine(recipe.colorChrome); hasher.combine(recipe.category)
        hasher.combine(recipe.toneCurve.map(\.y))
        return hasher.finalize()
    }
}

/// Shared renderer + cached demo image for builder previews.
final class RecipePreviewRenderer {
    static let shared = RecipePreviewRenderer()

    private let renderer = DefaultFilmRenderer()
    private let context = CIContext(options: [.useSoftwareRenderer: false])

    /// Procedural demo scene — generated once, reused for every swatch.
    private lazy var demo: CIImage = Self.makeDemoImage()

    func render(_ recipe: FilmRecipe) async -> UIImage? {
        await Task.detached(priority: .userInitiated) { [renderer, context, demo] in
            let extent = demo.extent
            let output = renderer.render(demo, with: recipe).cropped(to: extent)
            guard let cg = context.createCGImage(output, from: extent) else { return nil }
            return UIImage(cgImage: cg)
        }.value
    }

    private static func makeDemoImage() -> CIImage {
        #if canImport(UIKit)
        let size = CGSize(width: 360, height: 240)
        let img = UIGraphicsImageRenderer(size: size).image { ctx in
            let c = ctx.cgContext
            // Sky → ground gradient.
            let colors = [UIColor(red: 0.45, green: 0.6, blue: 0.8, alpha: 1).cgColor,
                          UIColor(red: 0.85, green: 0.8, blue: 0.7, alpha: 1).cgColor]
            if let g = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                                  colors: colors as CFArray, locations: [0, 1]) {
                c.drawLinearGradient(g, start: .zero,
                                     end: CGPoint(x: 0, y: size.height), options: [])
            }
            // Color bars.
            let bars: [UIColor] = [.systemRed, .systemGreen, .systemBlue,
                                   .systemYellow, .systemPurple, .white, .black]
            let bw = size.width / CGFloat(bars.count)
            for (i, color) in bars.enumerated() {
                color.setFill()
                c.fill(CGRect(x: CGFloat(i) * bw, y: 150, width: bw, height: 50))
            }
            // Skin-tone patch.
            UIColor(red: 0.86, green: 0.66, blue: 0.54, alpha: 1).setFill()
            c.fillEllipse(in: CGRect(x: 24, y: 24, width: 80, height: 80))
        }
        return CIImage(image: img) ?? CIImage(color: .gray).cropped(to: CGRect(x: 0, y: 0, width: 360, height: 240))
        #else
        return CIImage(color: .gray).cropped(to: CGRect(x: 0, y: 0, width: 360, height: 240))
        #endif
    }
}
