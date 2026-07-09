import Foundation

// MARK: - Focus engine (ported from src/domain/pomodoroDomain.js — pure, immutable state)

public enum Phase: String, Sendable, Equatable {
    case focus, shortBreak, longBreak
}

public enum TimerStatus: String, Sendable, Equatable {
    case idle, running, paused
}

public struct PomodoroSettings: Sendable, Equatable {
    public var focusMinutes: Int
    public var shortBreakMinutes: Int
    public var longBreakMinutes: Int
    public var cyclesUntilLongBreak: Int
    public var autoStartNextPhase: Bool

    public init(focusMinutes: Int = 25, shortBreakMinutes: Int = 5, longBreakMinutes: Int = 15, cyclesUntilLongBreak: Int = 4, autoStartNextPhase: Bool = false) {
        self.focusMinutes = focusMinutes
        self.shortBreakMinutes = shortBreakMinutes
        self.longBreakMinutes = longBreakMinutes
        self.cyclesUntilLongBreak = cyclesUntilLongBreak
        self.autoStartNextPhase = autoStartNextPhase
    }

    public static let `default` = PomodoroSettings()

    public func sanitized() -> PomodoroSettings {
        PomodoroSettings(
            focusMinutes: clampInt(focusMinutes, 10, 90, 25),
            shortBreakMinutes: clampInt(shortBreakMinutes, 3, 30, 5),
            longBreakMinutes: clampInt(longBreakMinutes, 10, 45, 15),
            cyclesUntilLongBreak: clampInt(cyclesUntilLongBreak, 2, 6, 4),
            autoStartNextPhase: autoStartNextPhase
        )
    }
}

public struct PomodoroState: Sendable, Equatable {
    public var status: TimerStatus
    public var phase: Phase
    public var cycleInBlock: Int
    public var remaining: TimeInterval   // seconds left in the current phase
    public var endsAt: Date?
    public var updatedAt: Date

    public init(status: TimerStatus, phase: Phase, cycleInBlock: Int, remaining: TimeInterval, endsAt: Date?, updatedAt: Date) {
        self.status = status
        self.phase = phase
        self.cycleInBlock = cycleInBlock
        self.remaining = remaining
        self.endsAt = endsAt
        self.updatedAt = updatedAt
    }
}

/// Pure state transitions — same logic as the JS domain, expressed as value-returning functions.
public enum Pomodoro {

    public static func phaseDuration(_ phase: Phase, _ s: PomodoroSettings) -> TimeInterval {
        switch phase {
        case .focus:      return TimeInterval(max(1, s.focusMinutes) * 60)
        case .shortBreak: return TimeInterval(max(1, s.shortBreakMinutes) * 60)
        case .longBreak:  return TimeInterval(max(1, s.longBreakMinutes) * 60)
        }
    }

    public static func initialState(_ s: PomodoroSettings, now: Date = Date()) -> PomodoroState {
        PomodoroState(status: .idle, phase: .focus, cycleInBlock: 0,
                      remaining: phaseDuration(.focus, s), endsAt: nil, updatedAt: now)
    }

    public static func computeRemaining(_ state: PomodoroState, now: Date) -> TimeInterval {
        guard state.status == .running, let endsAt = state.endsAt else { return state.remaining }
        return max(0, endsAt.timeIntervalSince(now))
    }

    public static func start(_ state: PomodoroState, _ s: PomodoroSettings, now: Date = Date()) -> PomodoroState {
        let remaining = state.remaining > 0 ? state.remaining : phaseDuration(state.phase, s)
        var ns = state
        ns.status = .running
        ns.remaining = remaining
        ns.endsAt = now.addingTimeInterval(remaining)
        ns.updatedAt = now
        return ns
    }

    public static func pause(_ state: PomodoroState, now: Date = Date()) -> PomodoroState {
        guard state.status == .running else { return state }
        var ns = state
        ns.remaining = computeRemaining(state, now: now)
        ns.status = .paused
        ns.endsAt = nil
        ns.updatedAt = now
        return ns
    }

    public static func resume(_ state: PomodoroState, _ s: PomodoroSettings, now: Date = Date()) -> PomodoroState {
        guard state.status == .paused else { return state }
        return start(state, s, now: now)
    }

    public static func reset(_ s: PomodoroSettings, now: Date = Date()) -> PomodoroState {
        var st = initialState(s, now: now)
        st.updatedAt = now
        return st
    }

    public static func advance(_ state: PomodoroState, _ s: PomodoroSettings, now: Date = Date()) -> PomodoroState {
        var nextPhase: Phase = .focus
        var cycle = state.cycleInBlock

        if state.phase == .focus {
            let progressed = cycle + 1
            if progressed >= s.cyclesUntilLongBreak {
                nextPhase = .longBreak
                cycle = 0
            } else {
                nextPhase = .shortBreak
                cycle = progressed
            }
        } else {
            nextPhase = .focus
        }

        let dur = phaseDuration(nextPhase, s)
        var ns = state
        ns.status = s.autoStartNextPhase ? .running : .paused
        ns.phase = nextPhase
        ns.cycleInBlock = cycle
        ns.remaining = dur
        ns.endsAt = s.autoStartNextPhase ? now.addingTimeInterval(dur) : nil
        ns.updatedAt = now
        return ns
    }
}

fileprivate func clampInt(_ v: Int, _ lo: Int, _ hi: Int, _ fallback: Int) -> Int {
    if v < lo { return lo }
    if v > hi { return hi }
    return v
}
