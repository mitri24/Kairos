import Foundation
import PaceKit

// Minimal, dependency-free check harness (XCTest is unavailable under Command Line Tools).
// Run with:  swift run PaceCheck

var failures = 0
var total = 0

func check(_ condition: Bool, _ message: String) {
    total += 1
    if condition {
        print("  ✓ \(message)")
    } else {
        print("  ✗ \(message)")
        failures += 1
    }
}

func checkEqual<T: Equatable>(_ actual: T, _ expected: T, _ message: String) {
    check(actual == expected, "\(message)  [got \(actual), expected \(expected)]")
}

// Calendar helper (fixed timezone for deterministic dates).
var cal = Calendar(identifier: .gregorian)
cal.timeZone = TimeZone(identifier: "Europe/Zurich") ?? .current
func d(_ y: Int, _ mo: Int, _ da: Int, _ h: Int, _ mi: Int) -> Date {
    var c = DateComponents()
    c.year = y; c.month = mo; c.day = da; c.hour = h; c.minute = mi
    c.timeZone = cal.timeZone
    return cal.date(from: c)!
}

// MARK: - Pomodoro focus engine

print("Pomodoro engine")
let settings = PomodoroSettings.default
do {
    let st = Pomodoro.initialState(settings)
    checkEqual(st.status, .idle, "initial status is idle")
    checkEqual(st.phase, .focus, "initial phase is focus")
    checkEqual(st.remaining, 25 * 60, "initial remaining is 25min")
}
do {
    let now = Date(timeIntervalSince1970: 1_000_000)
    let st = Pomodoro.start(Pomodoro.initialState(settings, now: now), settings, now: now)
    checkEqual(st.status, .running, "start sets running")
    checkEqual(st.endsAt, now.addingTimeInterval(25 * 60), "start sets endsAt = now + 25min")
}
do {
    let now = Date(timeIntervalSince1970: 1_000_000)
    var st = Pomodoro.start(Pomodoro.initialState(settings, now: now), settings, now: now)
    st = Pomodoro.pause(st, now: now.addingTimeInterval(60))
    checkEqual(st.status, .paused, "pause sets paused")
    checkEqual(st.remaining, 24 * 60, "pause computes remaining after 1min elapsed")
    check(st.endsAt == nil, "pause clears endsAt")
}
do {
    let now = Date(timeIntervalSince1970: 1_000_000)
    var st = Pomodoro.start(Pomodoro.initialState(settings, now: now), settings, now: now)
    st = Pomodoro.pause(st, now: now.addingTimeInterval(60))
    let resumeAt = now.addingTimeInterval(120)
    st = Pomodoro.resume(st, settings, now: resumeAt)
    checkEqual(st.status, .running, "resume sets running")
    checkEqual(st.endsAt, resumeAt.addingTimeInterval(24 * 60), "resume continues remaining time")
}
do {
    var st = Pomodoro.initialState(settings) // cyclesUntilLongBreak = 4
    let expected: [Phase] = [.shortBreak, .focus, .shortBreak, .focus, .shortBreak, .focus, .longBreak]
    var ok = true
    for phase in expected {
        st = Pomodoro.advance(st, settings)
        if st.phase != phase { ok = false }
    }
    check(ok, "4 focus cycles advance focus→short…→longBreak")
    checkEqual(st.cycleInBlock, 0, "cycle counter resets after long break")
}
do {
    let s = PomodoroSettings(focusMinutes: 500, shortBreakMinutes: 1, longBreakMinutes: 200, cyclesUntilLongBreak: 99).sanitized()
    checkEqual(s.focusMinutes, 90, "sanitize clamps focus to 90")
    checkEqual(s.shortBreakMinutes, 3, "sanitize clamps short break to 3")
    checkEqual(s.longBreakMinutes, 45, "sanitize clamps long break to 45")
    checkEqual(s.cyclesUntilLongBreak, 6, "sanitize clamps cycles to 6")
}

// MARK: - Scheduler

print("\nScheduler")
do {
    let day = d(2026, 6, 1, 0, 0)
    let busy = [
        BusyBlock(start: d(2026, 6, 1, 10, 0), end: d(2026, 6, 1, 11, 0), title: "Vorlesung"),
        BusyBlock(start: d(2026, 6, 1, 13, 0), end: d(2026, 6, 1, 14, 0), title: "Job"),
    ]
    let slots = Scheduler.freeSlots(busy: busy, days: [day], calendar: cal, constraints: .default)
    checkEqual(slots.count, 3, "free slots around 2 busy blocks → 3 gaps")
    checkEqual(slots.map { $0.minutes }, [120, 120, 480], "gap durations 08-10, 11-13, 14-22")
}
do {
    let day = d(2026, 6, 1, 0, 0)
    let busy = [
        BusyBlock(start: d(2026, 6, 1, 10, 0), end: d(2026, 6, 1, 12, 0)),
        BusyBlock(start: d(2026, 6, 1, 11, 0), end: d(2026, 6, 1, 13, 0)),
    ]
    let slots = Scheduler.freeSlots(busy: busy, days: [day], calendar: cal, constraints: .default)
    checkEqual(slots.count, 2, "overlapping busy blocks merge → 2 gaps")
    checkEqual(slots.map { $0.minutes }, [120, 540], "merged busy 10-13 → free 08-10, 13-22")
}
do {
    let day = d(2026, 6, 1, 0, 0)
    let slots = Scheduler.freeSlots(busy: [], days: [day], calendar: cal, constraints: .default)
    let tasks = [StudyTask(subjectID: UUID(), title: "Mathe", deadline: d(2026, 6, 2, 0, 0), priority: 1, estimatedMinutes: 200)]
    let sessions = Scheduler.schedule(tasks: tasks, freeSlots: slots, calendar: cal, constraints: .default)
    check(!sessions.isEmpty, "200min of work produces sessions")
    check(sessions.allSatisfy { $0.minutes <= 90 }, "no session exceeds maxBlock (90)")
    checkEqual(sessions.reduce(0) { $0 + $1.minutes }, 200, "all 200min are scheduled")
    let sorted = sessions.sorted { $0.start < $1.start }
    var noOverlap = true
    for i in 1..<sorted.count where sorted[i - 1].end > sorted[i].start { noOverlap = false }
    check(noOverlap, "sessions do not overlap")
}
do {
    let day = d(2026, 6, 1, 0, 0)
    let slots = Scheduler.freeSlots(busy: [], days: [day], calendar: cal, constraints: .default)
    let tasks = [
        StudyTask(subjectID: UUID(), title: "Später", deadline: d(2026, 6, 10, 0, 0), priority: 3, estimatedMinutes: 60),
        StudyTask(subjectID: UUID(), title: "Dringend", deadline: d(2026, 6, 2, 0, 0), priority: 1, estimatedMinutes: 60),
    ]
    let sessions = Scheduler.schedule(tasks: tasks, freeSlots: slots, calendar: cal, constraints: .default)
    checkEqual(sessions.first?.title ?? "", "Dringend", "most urgent (earliest deadline) task scheduled first")
}
do {
    let slots = Scheduler.freeSlots(busy: [], days: [d(2026, 6, 1, 0, 0), d(2026, 6, 2, 0, 0)], calendar: cal, constraints: .default)
    let tasks = [StudyTask(subjectID: UUID(), title: "Marathon", deadline: d(2026, 6, 10, 0, 0), priority: 1, estimatedMinutes: 1000)]
    let sessions = Scheduler.schedule(tasks: tasks, freeSlots: slots, calendar: cal, constraints: .default)
    let byDay = Dictionary(grouping: sessions) { cal.startOfDay(for: $0.start) }
    let capRespected = byDay.values.allSatisfy { $0.reduce(0) { $0 + $1.minutes } <= 360 }
    check(capRespected, "daily study load never exceeds maxDailyStudyMinutes (360)")
}

// MARK: - Result

print("\n\(total - failures)/\(total) checks passed" + (failures == 0 ? " ✅" : " — \(failures) FAILED ❌"))
exit(failures == 0 ? 0 : 1)
