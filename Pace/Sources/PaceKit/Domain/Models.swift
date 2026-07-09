import Foundation

// MARK: - Core domain value types (pure, Sendable, UI/EventKit-independent)

/// Cognitive type of a subject — used later for circadian/energy-aware placement (高考状元 method).
public enum CognitiveType: String, Codable, Sendable, CaseIterable {
    case memorize, calculate, understand, read
}

public struct Subject: Identifiable, Hashable, Codable, Sendable {
    public let id: UUID
    public var name: String
    public var colorHex: String
    public var cognitiveType: CognitiveType

    public init(id: UUID = UUID(), name: String, colorHex: String = "#4F8EF7", cognitiveType: CognitiveType = .understand) {
        self.id = id
        self.name = name
        self.colorHex = colorHex
        self.cognitiveType = cognitiveType
    }
}

/// A concrete piece of work with a deadline. `estimatedMinutes` comes from the pace model
/// (here provided directly); the scheduler packs `estimatedMinutes` of work into free slots.
public struct StudyTask: Identifiable, Hashable, Codable, Sendable {
    public let id: UUID
    public var subjectID: UUID
    public var title: String
    public var deadline: Date
    public var priority: Int          // 1 (P1, highest) … 4 (P4, lowest)
    public var estimatedMinutes: Int

    public init(id: UUID = UUID(), subjectID: UUID, title: String, deadline: Date, priority: Int = 3, estimatedMinutes: Int) {
        self.id = id
        self.subjectID = subjectID
        self.title = title
        self.deadline = deadline
        self.priority = priority
        self.estimatedMinutes = estimatedMinutes
    }
}

/// An occupied time range read from the calendar (busy).
public struct BusyBlock: Hashable, Sendable {
    public var start: Date
    public var end: Date
    public var title: String

    public init(start: Date, end: Date, title: String = "Busy") {
        self.start = start
        self.end = end
        self.title = title
    }
}

/// A computed gap of free time the scheduler may fill.
public struct FreeSlot: Hashable, Sendable {
    public var start: Date
    public var end: Date

    public init(start: Date, end: Date) {
        self.start = start
        self.end = end
    }

    public var minutes: Int { max(0, Int(end.timeIntervalSince(start) / 60)) }
}

/// A planned (or committed) study block. `isPinned` marks a manual placement that the
/// auto-scheduler must treat as a soft anchor and never overwrite (SPEC F7.6 / F8a).
public struct StudySession: Identifiable, Hashable, Sendable {
    public let id: UUID
    public var taskID: UUID
    public var subjectID: UUID
    public var title: String
    public var start: Date
    public var end: Date
    public var isPinned: Bool

    public init(id: UUID = UUID(), taskID: UUID, subjectID: UUID, title: String, start: Date, end: Date, isPinned: Bool = false) {
        self.id = id
        self.taskID = taskID
        self.subjectID = subjectID
        self.title = title
        self.start = start
        self.end = end
        self.isPinned = isPinned
    }

    public var minutes: Int { max(0, Int(end.timeIntervalSince(start) / 60)) }
}

/// Day boundaries + block/load constraints fed into the scheduler (SPEC §8.2).
public struct SchedulingConstraints: Sendable, Equatable {
    public var dayStartHour: Int
    public var dayEndHour: Int
    public var minBlockMinutes: Int
    public var maxBlockMinutes: Int
    public var bufferMinutes: Int
    public var maxDailyStudyMinutes: Int

    public init(dayStartHour: Int, dayEndHour: Int, minBlockMinutes: Int, maxBlockMinutes: Int, bufferMinutes: Int, maxDailyStudyMinutes: Int) {
        self.dayStartHour = dayStartHour
        self.dayEndHour = dayEndHour
        self.minBlockMinutes = minBlockMinutes
        self.maxBlockMinutes = maxBlockMinutes
        self.bufferMinutes = bufferMinutes
        self.maxDailyStudyMinutes = maxDailyStudyMinutes
    }

    public static let `default` = SchedulingConstraints(
        dayStartHour: 8,
        dayEndHour: 22,
        minBlockMinutes: 25,
        maxBlockMinutes: 90,
        bufferMinutes: 10,
        maxDailyStudyMinutes: 360
    )
}
