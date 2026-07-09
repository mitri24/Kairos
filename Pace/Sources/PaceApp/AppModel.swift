import Foundation
import Observation
import PaceKit

@MainActor
@Observable
final class AppModel {
    var accessGranted = false
    var statusMessage = "Noch nicht mit dem Kalender verbunden."
    var plan: Plan?
    var tasks: [StudyTask] = AppModel.demoTasks()
    var constraints = SchedulingConstraints.default

    /// CLI `swift run` has no bundle Info.plist → no calendar usage string → EventKit would fail.
    /// Detect that and guide the user to the bundled app.
    let infoPlistOK = Bundle.main.object(forInfoDictionaryKey: "NSCalendarsFullAccessUsageDescription") != nil

    private let planService: PlanService

    init() {
        self.planService = PlanService(calendarRepo: EventKitCalendarRepository())
    }

    func connect() async {
        guard infoPlistOK else {
            statusMessage = "Für Kalender-Zugriff bitte als App starten:  ./scripts/make_app.sh  →  open ./Pace.app"
            return
        }
        do {
            accessGranted = try await planService.requestCalendarAccess()
            statusMessage = accessGranted
                ? "Verbunden. Bereit, einen Plan zu erstellen."
                : "Zugriff verweigert. In den Systemeinstellungen → Datenschutz → Kalender erlauben."
        } catch {
            statusMessage = "Fehler beim Verbinden: \(error.localizedDescription)"
        }
    }

    func generatePlan() async {
        do {
            let plan = try await planService.generatePlan(tasks: tasks, horizonDays: 7, constraints: constraints)
            self.plan = plan
            statusMessage = "Plan: \(plan.sessions.count) Sessions · \(plan.totalPlannedMinutes) Min · um \(plan.busy.count) Termine herum, \(plan.freeSlots.count) freie Slots."
        } catch {
            statusMessage = "Fehler beim Planen: \(error.localizedDescription)"
        }
    }

    func commitPlan() async {
        guard let plan else { return }
        do {
            let n = try await planService.commitPlan(plan)
            statusMessage = "\(n) Lern-Events in den Pace-Kalender geschrieben."
        } catch {
            statusMessage = "Schreibfehler: \(error.localizedDescription)"
        }
    }

    static func demoTasks() -> [StudyTask] {
        let now = Date()
        let cal = Calendar.current
        func inDays(_ n: Int) -> Date { cal.date(byAdding: .day, value: n, to: now) ?? now }
        let math = UUID(), chem = UUID(), hist = UUID()
        return [
            StudyTask(subjectID: math, title: "Analysis – Übungsblatt 7", deadline: inDays(2), priority: 1, estimatedMinutes: 180),
            StudyTask(subjectID: chem, title: "Organik – 30 Folien", deadline: inDays(4), priority: 2, estimatedMinutes: 150),
            StudyTask(subjectID: hist, title: "Geschichte – 40 Seiten lesen", deadline: inDays(6), priority: 3, estimatedMinutes: 120),
        ]
    }
}
