import SwiftUI

#if DEBUG
/// Developer-only catalog browser: lists every built-in recipe with its
/// engineering metadata and a **procedural demo preview**. It never uses a
/// captured user photo — previews come from ``RecipePreviewSwatch`` only.
struct RecipeCatalogDebugView: View {
    var body: some View {
        List {
            ForEach(FilmCategory.allCases, id: \.self) { category in
                let items = FilmRecipeCatalog.all.filter { $0.category == category }
                if !items.isEmpty {
                    Section(category.displayName) {
                        ForEach(items) { recipe in
                            NavigationLink {
                                RecipeMetadataView(recipe: recipe)
                            } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(recipe.displayName).font(.headline)
                                    Text("\(recipe.id) · v\(recipe.version)")
                                        .font(.caption2.monospaced())
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Recipe Catalog (debug)")
    }
}

/// Metadata + demo-image preview for one recipe.
private struct RecipeMetadataView: View {
    let recipe: FilmRecipe

    var body: some View {
        List {
            Section { RecipePreviewSwatch(recipe: recipe) }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)

            Section("Identity") {
                row("Name", recipe.displayName)
                row("Internal", recipe.inspiration)
                row("Category", recipe.category.displayName)
                row("Best use", recipe.bestUse)
                row("Color base", recipe.colorBase.displayName)
                row("Version", "\(recipe.version)")
            }
            Section("Tone") {
                row("EV", String(format: "%+.2f", recipe.ev))
                row("Contrast", String(format: "%.2f", recipe.contrast))
                row("Saturation", String(format: "%.2f", recipe.saturation))
                row("Highlight", String(format: "%.2f", recipe.highlightRecovery))
                row("Shadow", String(format: "%.2f", recipe.shadowLift))
                row("Curve Y", recipe.toneCurve.map { String(format: "%.2f", $0.y) }.joined(separator: ", "))
            }
            Section("Color") {
                row("Temp", String(format: "%.0f K", recipe.temperatureShiftK))
                row("Tint", String(format: "%.0f", recipe.tintShift))
                row("RGB", String(format: "%.2f, %.2f, %.2f", recipe.rgbBalance.x, recipe.rgbBalance.y, recipe.rgbBalance.z))
                row("Chrome", String(format: "%.2f", recipe.colorChrome))
                if let l = recipe.lumaWeights {
                    row("Luma", String(format: "%.2f, %.2f, %.2f", l.x, l.y, l.z))
                }
            }
            Section("Texture / FX") {
                row("Grain", String(format: "%.2f @ %.2f", recipe.grainAmount, recipe.grainSize))
                row("Vignette", String(format: "%.2f @ %.2f", recipe.vignetteAmount, recipe.vignetteRadius))
                row("Fade", String(format: "%.2f", recipe.fade))
                row("Sharpen / Blur", String(format: "%.2f / %.2f", recipe.sharpen, recipe.blur))
                row("Leak / Hal / Bloom", String(format: "%.2f / %.2f / %.2f", recipe.lightLeak, recipe.halation, recipe.bloom))
            }
            Section("Print / roll") {
                row("Border", recipe.borderStyle)
                row("Date stamp", recipe.dateStampStyle)
                row("Frames", "\(recipe.defaultFrames)")
                row("Unlock", recipe.defaultUnlock.displayName)
            }
        }
        .navigationTitle(recipe.displayName)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(.secondary)
            Spacer()
            Text(value).multilineTextAlignment(.trailing)
        }
        .font(.callout)
    }
}
#endif
