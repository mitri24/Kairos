import Foundation

/// Abstraction over the calendar backend so the domain/application layers stay testable
/// and EventKit-free (Dependency Inversion — mirrors the injected adapters in pomodoroService.js).
public protocol CalendarRepository {
    /// Request access; returns true if granted. (App needs FULL access to read busy/free.)
    func requestAccess() async throws -> Bool

    /// Busy (occupied) blocks in [from, to).
    func busyBlocks(from: Date, to: Date) async throws -> [BusyBlock]

    /// Write planned study sessions into a dedicated calendar. Returns the count written.
    @discardableResult
    func writeStudySessions(_ sessions: [StudySession], calendarName: String) async throws -> Int

    /// Remove previously written Pace events in [from, to) from the named calendar. Returns count removed.
    @discardableResult
    func removeStudySessions(calendarName: String, from: Date, to: Date) async throws -> Int
}
