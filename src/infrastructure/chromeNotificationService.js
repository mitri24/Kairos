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
      iconUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAABY0lEQVR4Xu3aMQ7CMAwF0GX9/1+2N2QGGEKMluSleqU9jwELyhl725LLJoCBAgQIECBAgAABAv4CF2EePXuE/7DiIP9N6byN1Nsx3Rp3XIan+FQIwgux1DPkWS9Vyuk3F7S3w7DnkAuehJpNggCBQKBgYGBgYLwHPQfQtbDNRsTA70vsK1tnE+bBZ5qTqL0+8BCLlcQFV3ayhtq/Y5cHIzoHmr18bODsPwhjNzklOMrgJUgIAQIECBAgAABAgQIECBAgAABAgQIECBAgAABAgQIECBAgAABAgQIECBAgAABAgQIECBAgAABAn4M4DccnE9vrFica8FWHZpLxXTc3swaP42gnikIYjneAX/7gToYtL6vhfVqlhK/SXGEdq8np5xpoE2mR7BfrpsAAAAAElFTkSuQmCC",
      title,
      message,
      priority: 2
    });
  }
}
