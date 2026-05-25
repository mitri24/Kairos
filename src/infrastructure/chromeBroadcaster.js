export class ChromeBroadcaster {
  async sendState(payload) {
    try {
      await chrome.runtime.sendMessage({
        type: "STATE_UPDATED",
        payload
      });
    } catch {
      // Popup kann geschlossen sein; kein Fehlerfall.
    }
  }
}
