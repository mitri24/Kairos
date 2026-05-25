import { STATUS, computeRemainingMs } from "../domain/pomodoroDomain.js";

const TICKER_STORAGE_KEY = "pomodoroBookmarkTickerId";
const TICKER_URL = "https://pomodoro.local/timer";

export class ChromeBookmarkBarTicker {
  constructor({ storage = chrome.storage.local } = {}) {
    this.storage = storage;
  }

  async render(snapshot, now = Date.now()) {
    if (!chrome.bookmarks) return;

    const state = snapshot?.state;
    if (!state) return;

    const bookmarkId = await this._ensureTickerBookmark();
    const title = this._createTitle(state, now);

    await chrome.bookmarks.update(bookmarkId, { title });
  }

  _createTitle(state, now) {
    const baseRemainingMs = state.status === STATUS.RUNNING
      ? computeRemainingMs(state, now)
      : state.remainingMs;

    const totalSeconds = Math.max(0, Math.ceil(baseRemainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const time = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    if (state.status === STATUS.PAUSED) return `⏸ ${time}`;
    if (state.status === STATUS.IDLE) return `⏱ ${time}`;
    return `⏱ ${time}`;
  }

  async _ensureTickerBookmark() {
    const cachedId = await this._getStoredId();
    if (cachedId) {
      const existing = await chrome.bookmarks.get(cachedId).catch(() => []);
      if (existing.length > 0) return cachedId;
    }

    const barId = await this._getBookmarksBarId();
    const created = await chrome.bookmarks.create({
      parentId: barId,
      title: "⏱ 00:00",
      url: TICKER_URL
    });

    await this._storeId(created.id);
    return created.id;
  }

  async _getBookmarksBarId() {
    const tree = await chrome.bookmarks.getTree();
    const root = tree?.[0];
    const candidates = root?.children ?? [];

    const directBar = candidates.find((node) => /bookmark/i.test(node.title) && /bar/i.test(node.title));
    if (directBar?.id) return directBar.id;

    const firstFolder = candidates.find((node) => Array.isArray(node.children));
    if (firstFolder?.id) return firstFolder.id;

    throw new Error("Bookmarks bar folder not found");
  }

  async _getStoredId() {
    const result = await this.storage.get(TICKER_STORAGE_KEY);
    return result?.[TICKER_STORAGE_KEY] ?? null;
  }

  async _storeId(bookmarkId) {
    await this.storage.set({ [TICKER_STORAGE_KEY]: bookmarkId });
  }
}