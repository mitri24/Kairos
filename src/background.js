import { PomodoroService } from "./application/pomodoroService.js";
import { ChromeStorageRepository } from "./infrastructure/chromeStorageRepository.js";
import { ChromeAlarmScheduler } from "./infrastructure/chromeAlarmScheduler.js";
import { ChromeNotificationService } from "./infrastructure/chromeNotificationService.js";
import { ChromeBroadcaster } from "./infrastructure/chromeBroadcaster.js";
import { ChromeActionBadge } from "./infrastructure/chromeActionBadge.js";
import { ChromeBookmarkBarTicker } from "./infrastructure/chromeBookmarkBarTicker.js";
import { ChromeSoundPlayer } from "./infrastructure/chromeSoundPlayer.js";

const service = new PomodoroService({
  storage: new ChromeStorageRepository(),
  scheduler: new ChromeAlarmScheduler({
    onFired: async () => {
      await service.onAlarmFired();
    },
    onTick: async () => {
      await service.onTick();
    }
  }),
  notifier: new ChromeNotificationService(),
  broadcaster: new ChromeBroadcaster(),
  badge: new ChromeActionBadge(),
  bookmarkTicker: new ChromeBookmarkBarTicker(),
  soundPlayer: new ChromeSoundPlayer()
});

bootstrapService().catch((error) => {
  console.error("[Pomodoro] Service worker bootstrap failed:", error);
});

// Klick auf das Toolbar-Icon öffnet die angedockte Seitenleiste (statt eines
// Popups), damit der Timer tab-übergreifend sichtbar bleibt.
if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.warn("[Pomodoro] sidePanel setup failed:", error));
}

chrome.runtime.onInstalled.addListener(async () => {
  await service.init();
});

chrome.runtime.onStartup.addListener(async () => {
  await service.init();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((payload) => sendResponse({ ok: true, payload }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

async function handleMessage(message) {
  if (!message?.type) return service.getSnapshot();

  switch (message.type) {
    case "GET_STATE":
      return service.getSnapshot();
    case "START":
      return service.start();
    case "PAUSE":
      return service.pause();
    case "RESUME":
      return service.resume();
    case "SKIP":
      return service.skip();
    case "RESET":
      return service.reset();
    case "UPDATE_SETTINGS":
      return service.updateSettings(message.settings ?? {});
    default:
      return service.getSnapshot();
  }
}

async function bootstrapService() {
  await service.init();
}
