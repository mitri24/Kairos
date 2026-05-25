const STORAGE_KEY = "adhdPomodoroState";

export class ChromeStorageRepository {
  async load() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] ?? {};
  }

  async save(payload) {
    await chrome.storage.local.set({
      [STORAGE_KEY]: payload
    });
  }
}
