import SwiftUI
import AppKit
import PaceKit

struct MenuBarView: View {
    @Bindable var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: "brain.head.profile")
                Text("Pace — Lernplaner").font(.headline)
            }

            Text(model.statusMessage)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 8) {
                Button("Kalender verbinden") { Task { await model.connect() } }
                if model.accessGranted {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                }
            }

            HStack(spacing: 8) {
                Button("Plan erstellen") { Task { await model.generatePlan() } }
                    .disabled(!model.accessGranted)
                Button("In Kalender schreiben") { Task { await model.commitPlan() } }
                    .disabled(model.plan == nil)
            }

            if let plan = model.plan, !plan.sessions.isEmpty {
                Divider()
                Text("Geplante Sessions (\(plan.sessions.count))").font(.subheadline.bold())
                ScrollView {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(plan.sessions) { session in
                            HStack {
                                Text(session.title).lineLimit(1)
                                Spacer()
                                Text("\(Self.format(session.start)) · \(session.minutes)m")
                                    .font(.caption.monospacedDigit())
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                .frame(maxHeight: 200)
            }

            Divider()
            Button("Beenden") { NSApplication.shared.terminate(nil) }
                .keyboardShortcut("q")
        }
        .padding(12)
        .frame(width: 340)
    }

    private static func format(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "de_DE")
        f.dateFormat = "E HH:mm"
        return f.string(from: date)
    }
}
