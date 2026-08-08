import {
  DEFAULT_SETTINGS,
  PHASES,
  STATUS,
  sanitizeSettings,
  createInitialState,
  startPhase,
  pausePhase,
  resumePhase,
  resetSession,
  advanceToNextPhase,
  applySettings,
  computeRemainingMs
} from "../domain/pomodoroDomain.js";

export class PomodoroService {
  constructor({ storage, scheduler, notifier, broadcaster, badge, soundPlayer, clock = () => Date.now() }) {
    this.storage = storage;
    this.scheduler = scheduler;
    this.notifier = notifier;
    this.broadcaster = broadcaster;
    this.badge = badge;
    this.soundPlayer = soundPlayer;
    this.clock = clock;
    this.settings = sanitizeSettings(DEFAULT_SETTINGS);
    this.state = createInitialState(this.settings);
  }

  async init() {
    const persisted = await this.storage.load();
    this.settings = sanitizeSettings({ ...DEFAULT_SETTINGS, ...persisted.settings });
    this.state = persisted.state ?? createInitialState(this.settings);

    await this._recoverAfterSleep();
    await this._persistAndBroadcast();

    return this.getSnapshot();
  }

  async getSnapshot() {
    const safeSettings = this.settings
      ? sanitizeSettings({ ...DEFAULT_SETTINGS, ...this.settings })
      : sanitizeSettings(DEFAULT_SETTINGS);

    if (this.settings !== safeSettings) {
      this.settings = safeSettings;
    }

    return {
      state: this._getResolvedState(),
      settings: safeSettings
    };
  }

  async start() {
    const now = this.clock();
    if (this.state.status === STATUS.RUNNING) return this.getSnapshot();

    this.state = startPhase(this.state, this.settings, now);
    await this._syncAlarm();
    await this._persistAndBroadcast();
    await this._playSessionStartSound();
    return this.getSnapshot();
  }

  async pause() {
    const now = this.clock();
    const wasRunningFocus = this.state.status === STATUS.RUNNING && this.state.phase === PHASES.FOCUS;
    this.state = pausePhase(this.state, now);
    await this._syncAlarm();
    await this._persistAndBroadcast();
    if (wasRunningFocus) {
      await this._playFocusPauseSound();
    }
    return this.getSnapshot();
  }

  async resume() {
    const now = this.clock();
    const wasPausedFocus = this.state.status === STATUS.PAUSED && this.state.phase === PHASES.FOCUS;
    this.state = resumePhase(this.state, this.settings, now);
    await this._syncAlarm();
    await this._persistAndBroadcast();
    if (wasPausedFocus) {
      await this._playFocusPauseSound();
    }
    return this.getSnapshot();
  }

  async skip() {
    const now = this.clock();
    const wasFocusPhase = this._getResolvedState(now).phase === PHASES.FOCUS;
    this.state = advanceToNextPhase(this._getResolvedState(), this.settings, now);
    await this._syncAlarm();
    await this._persistAndBroadcast();
    if (wasFocusPhase) {
      await this._playFocusPauseSound();
    }
    return this.getSnapshot();
  }

  async reset() {
    const now = this.clock();
    const wasFocusPhase = this.state.phase === PHASES.FOCUS;
    this.state = resetSession(this.settings, now);
    await this._syncAlarm();
    await this._persistAndBroadcast();
    if (wasFocusPhase) {
      await this._playFocusPauseSound();
    }
    return this.getSnapshot();
  }

  async updateSettings(nextSettings) {
    const now = this.clock();
    this.settings = sanitizeSettings({ ...this.settings, ...nextSettings });
    this.state = applySettings(this._getResolvedState(), this.settings, now);
    await this._syncAlarm();
    await this._persistAndBroadcast();
    return this.getSnapshot();
  }

  async onAlarmFired() {
    const now = this.clock();
    const resolved = this._getResolvedState(now);
    if (resolved.status !== STATUS.RUNNING || computeRemainingMs(resolved, now) > 0) {
      return this.getSnapshot();
    }

    const completedPhase = resolved.phase;
    this.state = advanceToNextPhase(resolved, this.settings, now);

    await this.notifier.notifyPhaseDone(completedPhase, this.state.phase);
    if (completedPhase === PHASES.FOCUS) {
      await this._playFocusCompleteSound();
    }
    await this._syncAlarm();
    await this._persistAndBroadcast();
    return this.getSnapshot();
  }

  async _playSessionStartSound() {
    if (!this.soundPlayer) return;
    await this.soundPlayer.playSessionStart();
  }

  async _playFocusCompleteSound() {
    if (!this.soundPlayer) return;
    await this.soundPlayer.playFocusComplete();
  }

  async _playFocusPauseSound() {
    if (!this.soundPlayer) return;
    await this.soundPlayer.playFocusPause();
  }

  async onTick() {
    const payload = await this.getSnapshot();
    if (this.badge) {
      await this.badge.render(payload, this.clock());
    }
  }

  _getResolvedState(now = this.clock()) {
    if (!this.state) return createInitialState(this.settings ?? DEFAULT_SETTINGS);

    if (this.state.status !== STATUS.RUNNING) return this.state;

    const remainingMs = computeRemainingMs(this.state, now);
    if (remainingMs > 0) {
      return {
        ...this.state,
        remainingMs
      };
    }

    return {
      ...this.state,
      remainingMs: 0
    };
  }

  async _recoverAfterSleep() {
    const now = this.clock();
    const resolved = this._getResolvedState(now);

    if (resolved.status === STATUS.RUNNING && resolved.remainingMs <= 0) {
      this.state = advanceToNextPhase(resolved, this.settings, now);
    } else {
      this.state = resolved;
    }

    await this._syncAlarm();
  }

  async _syncAlarm() {
    if (this.state.status !== STATUS.RUNNING || !this.state.endsAt) {
      await this.scheduler.clear();
      return;
    }

    const delayMs = Math.max(1000, this.state.endsAt - this.clock());
    await this.scheduler.schedule(delayMs);
  }

  async _persistAndBroadcast() {
    const payload = await this.getSnapshot();
    await this.storage.save(payload);
    await this.broadcaster.sendState(payload);
    if (this.badge) {
      await this.badge.render(payload, this.clock());
    }
  }
}
