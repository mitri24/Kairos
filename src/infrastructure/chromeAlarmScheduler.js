const ALARM_NAME = "pomodoro-phase-end";
const BADGE_TICK_ALARM_NAME = "pomodoro-badge-tick";
const BADGE_TICK_PERIOD_MINUTES = 1;

export class ChromeAlarmScheduler {
  constructor({ onFired, onTick }) {
    this.onFired = onFired;
    this.onTick = onTick;
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === ALARM_NAME) this.onFired();
      if (alarm.name === BADGE_TICK_ALARM_NAME && this.onTick) this.onTick();
    });
  }

  async schedule(delayMs) {
    await chrome.alarms.clear(ALARM_NAME);
    await chrome.alarms.create(ALARM_NAME, {
      when: Date.now() + delayMs
    });

    await chrome.alarms.create(BADGE_TICK_ALARM_NAME, {
      delayInMinutes: BADGE_TICK_PERIOD_MINUTES,
      periodInMinutes: BADGE_TICK_PERIOD_MINUTES
    });
  }

  async clear() {
    await chrome.alarms.clear(ALARM_NAME);
    await chrome.alarms.clear(BADGE_TICK_ALARM_NAME);
  }
}
