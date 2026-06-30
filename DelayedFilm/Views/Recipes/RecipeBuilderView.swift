import SwiftUI
import CoreGraphics
import simd

/// Full custom-recipe builder. Edits a draft ``FilmRecipe`` with live preview on
/// a procedural demo image, then saves a versioned custom recipe.
///
/// The preview never uses a captured user photo (see ``RecipePreviewSwatch``).
struct RecipeBuilderView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    private let original: FilmRecipe
    var onSaved: ((FilmRecipe) -> Void)?

    @State private var draft: FilmRecipe
    @State private var curve: CurvePreset
    @State private var schedulePreset: SchedulePresetChoice
    @State private var customDate: Date
    @State private var lumaChoice: LumaChoice

    init(recipe: FilmRecipe, onSaved: ((FilmRecipe) -> Void)? = nil) {
        self.original = recipe
        self.onSaved = onSaved
        _draft = State(initialValue: recipe)
        _curve = State(initialValue: CurvePreset.closest(to: recipe.toneCurve))
        _schedulePreset = State(initialValue: SchedulePresetChoice(recipe.defaultUnlock))
        _customDate = State(initialValue: recipe.defaultUnlock.customDate
                            ?? Calendar.current.date(byAdding: .month, value: 1, to: Date())!)
        _lumaChoice = State(initialValue: LumaChoice(recipe.lumaWeights))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section { RecipePreviewSwatch(recipe: draft) }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)

                identitySection
                toneSection
                colorSection
                if draft.category == .blackAndWhite { bwSection }
                textureSection
                effectsSection
                printSection
                defaultsSection

                Section {
                    Button("Reset Changes", role: .destructive) { reset() }
                }
            }
            .navigationTitle(draft.isBuiltIn ? "New From Recipe" : "Edit Recipe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(draft.displayName.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onChange(of: curve) { _, new in draft.toneCurve = new.points }
            .onChange(of: lumaChoice) { _, new in draft.lumaWeights = new.weights }
        }
    }

    // MARK: Sections

    private var identitySection: some View {
        Section("Identity") {
            TextField("Recipe name", text: $draft.displayName)
            Picker("Film base", selection: $draft.category) {
                ForEach(FilmCategory.allCases, id: \.self) { Text($0.displayName).tag($0) }
            }
            TextField("Best for…", text: $draft.bestUse)
        }
    }

    private var toneSection: some View {
        Section("Tone") {
            slider("Exposure", $draft.ev, -2...2, "%+.2f EV")
            slider("Contrast", $draft.contrast, 0.5...1.6)
            slider("Highlight tone", $draft.highlightRecovery, 0...1)
            slider("Shadow tone", $draft.shadowLift, 0...1)
            Picker("Tone curve", selection: $curve) {
                ForEach(CurvePreset.allCases, id: \.self) { Text($0.label).tag($0) }
            }
        }
    }

    private var colorSection: some View {
        Section("Color") {
            Picker("Color profile", selection: $draft.colorBase) {
                ForEach(MatrixBasePreset.allCases, id: \.self) { Text($0.displayName).tag($0) }
            }
            slider("Saturation", $draft.saturation, 0...2)
            slider("Vibrance", $draft.colorChrome, 0...1)
            slider("Temperature", $draft.temperatureShiftK, -800...800, "%.0f K")
            slider("Tint", $draft.tintShift, -40...40, "%.0f")
            slider("Red balance", $draft.rgbBalance.x, 0.7...1.3)
            slider("Green balance", $draft.rgbBalance.y, 0.7...1.3)
            slider("Blue balance", $draft.rgbBalance.z, 0.7...1.3)
        }
    }

    private var bwSection: some View {
        Section("B&W Response") {
            Picker("Filter", selection: $lumaChoice) {
                ForEach(LumaChoice.allCases, id: \.self) { Text($0.label).tag($0) }
            }
        }
    }

    private var textureSection: some View {
        Section("Texture") {
            slider("Grain strength", $draft.grainAmount, 0...1)
            slider("Grain size", $draft.grainSize, 0...2.5)
            slider("Clarity", $draft.sharpen, 0...1)
            slider("Softness", $draft.blur, 0...8, "%.1f px")
            slider("Vignette", $draft.vignetteAmount, 0...1)
            slider("Vignette radius", $draft.vignetteRadius, 0.5...2.5)
            slider("Fade", $draft.fade, 0...1)
        }
    }

    private var effectsSection: some View {
        Section("Effects") {
            slider("Bloom", $draft.bloom, 0...1)
            slider("Halation", $draft.halation, 0...1)
            slider("Light leak", $draft.lightLeak, 0...1)
        }
    }

    private var printSection: some View {
        Section("Print") {
            Picker("Border", selection: $draft.borderStyle) {
                ForEach(BuilderOptions.borders, id: \.self) { Text($0.capitalized).tag($0) }
            }
            Picker("Date stamp", selection: $draft.dateStampStyle) {
                ForEach(BuilderOptions.dateStamps, id: \.self) { Text($0.capitalized).tag($0) }
            }
        }
    }

    private var defaultsSection: some View {
        Section("Roll defaults") {
            Stepper("Default frames: \(draft.defaultFrames)",
                    value: $draft.defaultFrames, in: 1...72)
            Picker("Default development", selection: $schedulePreset) {
                ForEach(SchedulePresetChoice.allCases) { Text($0.label).tag($0) }
            }
            if schedulePreset == .custom {
                DatePicker("Unlock date", selection: $customDate,
                           in: Date()..., displayedComponents: .date)
            }
        }
    }

    // MARK: Slider helper

    @ViewBuilder
    private func slider(_ title: String, _ value: Binding<Float>,
                        _ range: ClosedRange<Float>, _ format: String = "%.2f") -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(title).font(.subheadline)
                Spacer()
                Text(String(format: format, value.wrappedValue))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            Slider(value: value, in: range)
        }
    }

    // MARK: Actions

    private func reset() {
        draft = original
        curve = CurvePreset.closest(to: original.toneCurve)
        schedulePreset = SchedulePresetChoice(original.defaultUnlock)
        lumaChoice = LumaChoice(original.lumaWeights)
    }

    private func save() {
        var toSave = draft
        toSave.defaultUnlock = schedulePreset.schedule(customDate: customDate)
        // Never persist over a built-in id — duplicate into a fresh custom id.
        if toSave.isBuiltIn {
            toSave = toSave.duplicatedAsCustom(named: toSave.displayName)
        }
        let store = SwiftDataCustomRecipeStore(context: modelContext)
        let saved = store.save(toSave)
        onSaved?(saved)
        dismiss()
    }
}

// MARK: - Builder option helpers

enum BuilderOptions {
    static let borders = ["none", "white", "film", "instant"]
    static let dateStamps = ["none", "classic", "orange"]
}

/// Tone-curve presets exposed in the builder.
enum CurvePreset: String, CaseIterable, Hashable {
    case linear, filmS, punchy, faded, soft
    var label: String {
        switch self {
        case .linear: return "Linear"
        case .filmS:  return "Film S"
        case .punchy: return "Punchy"
        case .faded:  return "Faded"
        case .soft:   return "Soft"
        }
    }
    var points: [CGPoint] {
        switch self {
        case .linear: return FilmRecipe.Curves.linear
        case .filmS:  return FilmRecipe.Curves.filmS
        case .punchy: return FilmRecipe.Curves.punchy
        case .faded:  return FilmRecipe.Curves.faded
        case .soft:   return FilmRecipe.Curves.softHi
        }
    }
    static func closest(to points: [CGPoint]) -> CurvePreset {
        allCases.first { $0.points == points } ?? .filmS
    }
}

/// B&W luma filter choices.
enum LumaChoice: String, CaseIterable, Hashable {
    case neutral, panchromatic, red, green, ortho
    var label: String { rawValue.capitalized }
    var weights: SIMD3<Float> {
        switch self {
        case .neutral:      return LumaPreset.neutral
        case .panchromatic: return LumaPreset.panchromatic
        case .red:          return LumaPreset.redFilter
        case .green:        return LumaPreset.greenFilter
        case .ortho:        return LumaPreset.ortho
        }
    }
    init(_ weights: SIMD3<Float>?) {
        guard let w = weights else { self = .panchromatic; return }
        self = LumaChoice.allCases.first { $0.weights == w } ?? .panchromatic
    }
}

// MARK: - Schedule choice bridging

extension SchedulePresetChoice {
    init(_ schedule: DevelopmentSchedule) {
        switch schedule {
        case .endOfWeek:    self = .endOfWeek
        case .endOfMonth:   self = .endOfMonth
        case .endOfQuarter: self = .endOfQuarter
        case .endOfYear:    self = .endOfYear
        case .custom:       self = .custom
        }
    }
    func schedule(customDate: Date) -> DevelopmentSchedule {
        switch self {
        case .endOfWeek:    return .endOfWeek
        case .endOfMonth:   return .endOfMonth
        case .endOfQuarter: return .endOfQuarter
        case .endOfYear:    return .endOfYear
        case .custom:       return .custom(customDate)
        }
    }
}

extension DevelopmentSchedule {
    var customDate: Date? {
        if case let .custom(date) = self { return date }
        return nil
    }
}

#Preview {
    RecipeBuilderView(recipe: .newCustom())
        .modelContainer(for: [CustomRecipeRecord.self], inMemory: true)
}
