import SwiftUI

/// App settings: shooting defaults, feedback, privacy, and explanations.
struct SettingsView: View {
    @AppStorage(AppSettings.defaultScheduleKey) private var defaultSchedule = SchedulePresetChoice.endOfMonth.rawValue
    @AppStorage(AppSettings.defaultFrameCountKey) private var defaultFrames = 27
    @AppStorage(AppSettings.hapticsEnabledKey) private var haptics = true
    @AppStorage(AppSettings.soundEnabledKey) private var sound = true
    @AppStorage(AppSettings.gridEnabledKey) private var grid = false
    @AppStorage(AppSettings.dateStampDefaultKey) private var dateStamp = "none"
    @AppStorage(AppSettings.saveOriginalKey) private var saveOriginal = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Recipes") {
                    NavigationLink {
                        RecipeLibraryView()
                    } label: {
                        Label("Recipe Library", systemImage: "camera.filters")
                    }
                    #if DEBUG
                    NavigationLink {
                        RecipeCatalogDebugView()
                    } label: {
                        Label("Recipe Catalog (debug)", systemImage: "ladybug")
                    }
                    #endif
                }

                Section("New roll defaults") {
                    Picker("Develops", selection: $defaultSchedule) {
                        ForEach(SchedulePresetChoice.allCases) { Text($0.label).tag($0.rawValue) }
                    }
                    Stepper("Frames: \(defaultFrames)", value: $defaultFrames, in: 1...72)
                }

                Section("Camera") {
                    Toggle("Haptics", isOn: $haptics)
                    Toggle("Shutter sound", isOn: $sound)
                    Toggle("Grid by default", isOn: $grid)
                    Picker("Date stamp", selection: $dateStamp) {
                        ForEach(BuilderOptions.dateStamps, id: \.self) { Text($0.capitalized).tag($0) }
                    }
                }

                Section {
                    Toggle("Keep a private original", isOn: $saveOriginal)
                } header: {
                    Text("Storage")
                } footer: {
                    Text("Saves an unprocessed copy in the roll's protected storage. Still hidden until the roll develops. Off by default.")
                }

                Section("Privacy") {
                    LabeledContent("Photos") {
                        Text("Add-only, on export").foregroundStyle(.secondary)
                    }
                    Text("Delayed Film stores your photos privately on this device with file protection. Nothing is uploaded, and nothing is saved to your photo library until you export a developed roll.")
                        .font(.footnote).foregroundStyle(.secondary)
                }

                Section("About recipes") {
                    Text("Recipes are film-inspired looks applied to the full-resolution photo after capture. Names are original and brand-safe; the built-in set spans color negative, slide, cine, instant-style, and black & white.")
                        .font(.footnote).foregroundStyle(.secondary)
                }

                Section("About") {
                    LabeledContent("App", value: "Delayed Film")
                    LabeledContent("The promise") {
                        Text("No previews. No peeking.").foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Settings")
        }
    }
}

#Preview {
    SettingsView()
}
