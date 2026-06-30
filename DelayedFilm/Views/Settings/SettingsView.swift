import SwiftUI

/// App settings. Phase 1 placeholder; reveal reminders, default schedule, and
/// export preferences are added in later phases.
struct SettingsView: View {
    var body: some View {
        NavigationStack {
            List {
                Section("About") {
                    LabeledContent("App", value: "Delayed Film")
                    LabeledContent("Phase", value: "1 — Foundation")
                }
                Section("The Promise") {
                    Text("Photos stay sealed in their roll until development day. No previews. No peeking.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Settings")
        }
    }
}

#Preview {
    SettingsView()
}
