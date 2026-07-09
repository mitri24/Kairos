import Foundation
import EventKit

/// EventKit-backed implementation of `CalendarRepository`.
/// Reads the user's existing calendars (iCloud/Google/Exchange all surface here) and
/// writes Pace study sessions into a dedicated calendar. All data stays on-device.
public final class EventKitCalendarRepository: CalendarRepository {

    private let store = EKEventStore()

    public init() {}

    public func requestAccess() async throws -> Bool {
        // Full access is required: write-only cannot read busy/free (SPEC §12.3 / RESEARCH E1).
        try await store.requestFullAccessToEvents()
    }

    public func busyBlocks(from: Date, to: Date) async throws -> [BusyBlock] {
        let predicate = store.predicateForEvents(withStart: from, end: to, calendars: nil) // nil = all calendars
        let events = store.events(matching: predicate)
        return events.compactMap { ev in
            guard !ev.isAllDay else { return nil }            // ignore all-day markers
            guard ev.availability != .free else { return nil } // respect explicitly "free" events
            return BusyBlock(start: ev.startDate, end: ev.endDate, title: ev.title ?? "Busy")
        }
    }

    @discardableResult
    public func writeStudySessions(_ sessions: [StudySession], calendarName: String) async throws -> Int {
        let calendar = try paceCalendar(named: calendarName)
        var count = 0
        for s in sessions {
            let ev = EKEvent(eventStore: store)
            ev.title = "📚 " + s.title
            ev.startDate = s.start
            ev.endDate = s.end
            ev.calendar = calendar
            ev.notes = "Pace study session"
            try store.save(ev, span: .thisEvent, commit: false)
            count += 1
        }
        try store.commit()
        return count
    }

    @discardableResult
    public func removeStudySessions(calendarName: String, from: Date, to: Date) async throws -> Int {
        guard let calendar = store.calendars(for: .event).first(where: { $0.title == calendarName }) else { return 0 }
        let predicate = store.predicateForEvents(withStart: from, end: to, calendars: [calendar])
        let events = store.events(matching: predicate)
        var count = 0
        for ev in events {
            try store.remove(ev, span: .thisEvent, commit: false)
            count += 1
        }
        try store.commit()
        return count
    }

    // MARK: - Helpers

    private func paceCalendar(named name: String) throws -> EKCalendar {
        if let existing = store.calendars(for: .event).first(where: { $0.title == name }) {
            return existing
        }
        let calendar = EKCalendar(for: .event, eventStore: store)
        calendar.title = name
        calendar.source = store.defaultCalendarForNewEvents?.source
            ?? store.sources.first(where: { $0.sourceType == .local })
            ?? store.sources.first
        do {
            try store.saveCalendar(calendar, commit: true)
            return calendar
        } catch {
            // Fall back to the default calendar if a dedicated one can't be created.
            if let def = store.defaultCalendarForNewEvents { return def }
            throw error
        }
    }
}
