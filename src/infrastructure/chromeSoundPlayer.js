const OFFSCREEN_DOCUMENT_PATH = "src/infrastructure/offscreenAudio.html";

const SOUND_FILES = {
  sessionStart: "assets/sounds/session-start.mp3",
  focusComplete: "assets/sounds/focus-complete.mp3",
  focusPause: "assets/sounds/focus-pause.mp3"
};

export class ChromeSoundPlayer {
  async playSessionStart() {
    await this._play("sessionStart");
  }

  async playFocusComplete() {
    await this._play("focusComplete");
  }

  async playFocusPause() {
    await this._play("focusPause");
  }

  async _play(soundKey) {
    if (!chrome.offscreen) return;

    const sourcePath = SOUND_FILES[soundKey];
    if (!sourcePath) return;

    try {
      await this._ensureOffscreenDocument();
      await chrome.runtime.sendMessage({
        type: "PLAY_EXTENSION_SOUND",
        payload: {
          sourceUrl: chrome.runtime.getURL(sourcePath)
        }
      });
    } catch (error) {
      console.warn("[Pomodoro] Sound konnte nicht abgespielt werden:", error);
    }
  }

  async _ensureOffscreenDocument() {
    const hasDocument = await this._hasOffscreenDocument();
    if (hasDocument) return;

    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Pomodoro Start/Abschluss-Sounds im Background abspielen"
    });
  }

  async _hasOffscreenDocument() {
    if (typeof chrome.offscreen.hasDocument === "function") {
      return chrome.offscreen.hasDocument();
    }

    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
    });

    return contexts.length > 0;
  }
}