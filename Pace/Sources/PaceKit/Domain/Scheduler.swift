import Foundation

// MARK: - Auto-scheduler (SPEC §8): greedy, deadline-aware interval packing. Pure.

public enum Scheduler {

    /// Compute free slots within [dayStartHour, dayEndHour] for each given day,
    /// by subtracting (merged) busy blocks. Slots shorter than minBlock are dropped.
    public static func freeSlots(busy: [BusyBlock], days: [Date], calendar: Calendar = .current, constraints: SchedulingConstraints) -> [FreeSlot] {
        var result: [FreeSlot] = []

        for day in days {
            guard let dayStart = calendar.date(bySettingHour: constraints.dayStartHour, minute: 0, second: 0, of: day),
                  let dayEnd = calendar.date(bySettingHour: constraints.dayEndHour, minute: 0, second: 0, of: day),
                  dayStart < dayEnd else { continue }

            // Clip busy blocks to the day window.
            let clipped: [(start: Date, end: Date)] = busy.compactMap { b in
                let s = max(b.start, dayStart)
                let e = min(b.end, dayEnd)
                return s < e ? (s, e) : nil
            }.sorted { $0.start < $1.start }

            // Merge overlapping busy blocks.
            var merged: [(start: Date, end: Date)] = []
            for b in clipped {
                if var last = merged.last, b.start <= last.end {
                    last.end = max(last.end, b.end)
                    merged[merged.count - 1] = last
                } else {
                    merged.append(b)
                }
            }

            // Gaps between merged busy blocks become free slots.
            var cursor = dayStart
            for b in merged {
                if b.start > cursor {
                    let slot = FreeSlot(start: cursor, end: b.start)
                    if slot.minutes >= constraints.minBlockMinutes { result.append(slot) }
                }
                if b.end > cursor { cursor = b.end }
            }
            if cursor < dayEnd {
                let slot = FreeSlot(start: cursor, end: dayEnd)
                if slot.minutes >= constraints.minBlockMinutes { result.append(slot) }
            }
        }

        return result.sorted { $0.start < $1.start }
    }

    /// Pack task work into free slots, most-urgent-first, respecting min/max block,
    /// per-day load cap and inter-block buffer. Returns concrete StudySessions.
    public static func schedule(tasks: [StudyTask], freeSlots: [FreeSlot], calendar: Calendar = .current, constraints: SchedulingConstraints) -> [StudySession] {
        var sessions: [StudySession] = []
        var remaining: [UUID: Int] = [:]
        for t in tasks { remaining[t.id] = t.estimatedMinutes }

        let queue = tasks.sorted { urgency($0) < urgency($1) }   // earliest-deadline / highest-priority first
        var dailyLoad: [Date: Int] = [:]

        for slot in freeSlots.sorted(by: { $0.start < $1.start }) {
            var cursor = slot.start
            let slotEnd = slot.end

            while Int(slotEnd.timeIntervalSince(cursor) / 60) >= constraints.minBlockMinutes {
                let dayKey = calendar.startOfDay(for: cursor)
                let usedToday = dailyLoad[dayKey] ?? 0
                let dayBudget = constraints.maxDailyStudyMinutes - usedToday
                if dayBudget < constraints.minBlockMinutes { break }

                // Most urgent task that still has remaining work.
                guard let task = queue.first(where: { (remaining[$0.id] ?? 0) > 0 }) else { break }
                let rem = remaining[task.id] ?? 0
                let avail = Int(slotEnd.timeIntervalSince(cursor) / 60)
                let length = min(rem, constraints.maxBlockMinutes, avail, dayBudget)

                // Allow a short final block to finish a small remainder, otherwise require minBlock.
                if length < min(constraints.minBlockMinutes, rem) { break }

                let end = cursor.addingTimeInterval(Double(length) * 60)
                sessions.append(StudySession(taskID: task.id, subjectID: task.subjectID,
                                             title: task.title, start: cursor, end: end))
                remaining[task.id] = rem - length
                dailyLoad[dayKey] = usedToday + length
                cursor = end.addingTimeInterval(Double(constraints.bufferMinutes) * 60)
            }
        }

        return sessions
    }

    /// Lower = more urgent. Deadline dominates; priority breaks ties among near deadlines.
    public static func urgency(_ t: StudyTask) -> Double {
        t.deadline.timeIntervalSince1970 + Double(t.priority) * 86_400
    }
}
