let activeAudio = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "PLAY_EXTENSION_SOUND") return;

  playSound(message.payload?.sourceUrl)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

async function playSound(sourceUrl) {
  if (!sourceUrl) return;

  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
  }

  activeAudio = new Audio(sourceUrl);
  activeAudio.preload = "auto";
  activeAudio.volume = 1;
  await activeAudio.play();
}