import Foundation

/// Orchestrates the core loop: read calendar → compute free slots → schedule → (optionally) write back.
@MainActor
public final class PlanService {

    private let calendarRepo: CalendarRepository

    public init(calendarRepo: CalendarRepository) {
        self.calendarRepo = calendarRepo
    }

    public func requestCalendarAccess() async throws -> Bool {
        try await calendarRepo.requestAccess()
    }

    /// Build a plan over the next `horizonDays` days.
    public func generatePlan(tasks: [StudyTask],
                             horizonDays: Int,
                             constraints: SchedulingConstraints,
                             now: Date = Date(),
                             calendar: Calendar = .current) async throws -> Plan {
        let from = calendar.startOfDay(for: now)
        let to = calendar.date(byAdding: .day, value: horizonDays, to: from) ?? from

        let busy = try await calendarRepo.busyBlocks(from: from, to: to)
        let days = (0..<horizonDays).compactMap { calendar.date(byAdding: .day, value: $0, to: from) }

        let allSlots = Scheduler.freeSlots(busy: busy, days: days, calendar: calendar, constraints: constraints)

        // Only consider time from `now` onward (don't schedule into the past part of today).
        let futureSlots = allSlots
            .map { FreeSlot(start: max($0.start, now), end: $0.end) }
            .filter { $0.minutes >= constraints.minBlockMinutes }

        let sessions = Scheduler.schedule(tasks: tasks, freeSlots: futureSlots, calendar: calendar, constraints: constraints)
        return Plan(busy: busy, freeSlots: futureSlots, sessions: sessions)
    }

    /// Replace any existing Pace events in the horizon with the new plan's sessions.
    @discardableResult
    public func commitPlan(_ plan: Plan, calendarName: String = "Pace", horizonDays: Int = 7, now: Date = Date(), calendar: Calendar = .current) async throws -> Int {
        let from = calendar.startOfDay(for: now)
        let to = calendar.date(byAdding: .day, value: horizonDays, to: from) ?? from
        _ = try await calendarRepo.removeStudySessions(calendarName: calendarName, from: from, to: to)
        return try await calendarRepo.writeStudySessions(plan.sessions, calendarName: calendarName)
    }
}

/// The result of a scheduling run.
public struct Plan: Sendable {
    public var busy: [BusyBlock]
    public var freeSlots: [FreeSlot]
    public var sessions: [StudySession]

    public init(busy: [BusyBlock], freeSlots: [FreeSlot], sessions: [StudySession]) {
        self.busy = busy
        self.freeSlots = freeSlots
        self.sessions = sessions
    }

    public var totalPlannedMinutes: Int { sessions.reduce(0) { $0 + $1.minutes } }
    public var totalFreeMinutes: Int { freeSlots.reduce(0) { $0 + $1.minutes } }
}
