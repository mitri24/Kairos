const PHASE_LABEL = {
  focus: "Fokus",
  "short-break": "Kurze Pause",
  "long-break": "Lange Pause"
};

export class ChromeNotificationService {
  async notifyPhaseDone(previousPhase, nextPhase) {
    const title = `${PHASE_LABEL[previousPhase]} beendet`;
    const message = `Nächster Schritt: ${PHASE_LABEL[nextPhase]}. Ruhig durchatmen und weiter.`;

    await chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("assets/icons/icon-128.png"),
      title,
      message,
      priority: 2
    });
  }
}
