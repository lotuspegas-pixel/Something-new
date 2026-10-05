import SwiftUI
import SwiftData

/// Sheet for loading a new roll: title → recipe → development schedule →
/// capacity. The chosen recipe is fixed for the life of the roll.
struct NewRollView: View {
    /// Called with the user's choices when they tap "Load Roll".
    let onCreate: (_ title: String, _ schedule: DevelopmentSchedule,
                   _ recipe: FilmRecipe, _ capacity: Int) -> Void

    @Environment(\.dismiss) private var dismiss

    @Query(sort: \CustomRecipeRecord.updatedAt, order: .reverse)
    private var customRecords: [CustomRecipeRecord]

    @State private var title = ""
    @State private var selectedRecipeID = FilmRecipeCatalog.default.id
    @State private var schedulePreset: SchedulePresetChoice = AppSettings.defaultSchedule
    @State private var customDate = Calendar.current.date(
        byAdding: .month, value: 1, to: Date()) ?? Date()
    @State private var capacity = AppSettings.defaultFrameCount

    private var customRecipes: [FilmRecipe] { customRecords.compactMap { $0.recipe() } }
    private var recipes: [FilmRecipe] { customRecipes + FilmRecipeCatalog.all }

    private func recipe(for id: String) -> FilmRecipe? {
        recipes.first { $0.id == id }
    }

    private var resolvedSchedule: DevelopmentSchedule {
        switch schedulePreset {
        case .endOfWeek:    return .endOfWeek
        case .endOfMonth:   return .endOfMonth
        case .endOfQuarter: return .endOfQuarter
        case .endOfYear:    return .endOfYear
        case .custom:       return .custom(customDate)
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Roll") {
                    TextField("Title (e.g. Summer '26)", text: $title)
                    Stepper("Frames: \(capacity)", value: $capacity, in: 1...72)
                }

                Section("Film recipe") {
                    Picker("Recipe", selection: $selectedRecipeID) {
                        if !customRecipes.isEmpty {
                            Section("My Recipes") {
                                ForEach(customRecipes) { Text($0.displayName).tag($0.id) }
                            }
                        }
                        Section("Built-in") {
                            ForEach(FilmRecipeCatalog.all) { Text($0.displayName).tag($0.id) }
                        }
                    }
                    if let recipe = recipe(for: selectedRecipeID) {
                        Text(recipe.summary)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    NavigationLink {
                        RecipeLibraryView()
                    } label: {
                        Label("Create or edit recipes", systemImage: "slider.horizontal.3")
                            .font(.subheadline)
                    }
                }

                Section("Develops") {
                    Picker("When", selection: $schedulePreset) {
                        ForEach(SchedulePresetChoice.allCases) { choice in
                            Text(choice.label).tag(choice)
                        }
                    }
                    if schedulePreset == .custom {
                        DatePicker("Unlock date", selection: $customDate,
                                   in: Date()..., displayedComponents: .date)
                    }
                    Text("You won't see these photos until they develop.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("New Roll")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Load Roll") {
                        let recipe = recipe(for: selectedRecipeID) ?? FilmRecipeCatalog.default
                        onCreate(title, resolvedSchedule, recipe, capacity)
                        dismiss()
                    }
                }
            }
        }
    }
}

/// UI-only enum for the schedule picker (separates `.custom` from its date).
enum SchedulePresetChoice: String, CaseIterable, Identifiable {
    case endOfWeek, endOfMonth, endOfQuarter, endOfYear, custom
    var id: String { rawValue }
    var label: String {
        switch self {
        case .endOfWeek:    return "End of Week"
        case .endOfMonth:   return "End of Month"
        case .endOfQuarter: return "End of Quarter"
        case .endOfYear:    return "End of Year"
        case .custom:       return "Custom Date"
        }
    }
}

#Preview {
    NewRollView { _, _, _, _ in }
}
