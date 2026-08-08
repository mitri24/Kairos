// REST-Client zum Lernuhr-Backend. Jede Mutation liefert die volle Momentaufnahme.
// Bei Netzfehler wird onOffline() gemeldet, damit die UI weiterläuft (PWA-Cache).

import { showToast } from "/js/toast.js";

const BASE = ""; // gleiche Origin wie die PWA

let offlineHandler = null;
export function onConnectivity(fn) { offlineHandler = fn; }

// Offline-Hinweis für fehlgeschlagene Mutationen — entprellt (max. alle 8 s).
let lastOfflineToast = 0;
function offlineToast() {
  const now = Date.now();
  if (now - lastOfflineToast < 8000) return;
  lastOfflineToast = now;
  showToast({ type: "warn", title: "Offline — change not saved", body: "You can keep working; reconnect and try again." });
}

async function req(method, path, body) {
  const mutation = method !== "GET";
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    // Netzfehler → offline. Mutationen melden es dezent; GET-Polling bleibt still.
    offlineHandler?.(false);
    if (mutation) offlineToast();
    throw e;
  }
  offlineHandler?.(true); // Server erreicht (auch ein HTTP-Fehler heißt: online)
  if (!res.ok) {
    // Sitzung fehlt/abgelaufen → Login anstoßen (kein Fehler-Toast, kein Spam).
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent("auth-required"));
      throw new Error("Not signed in");
    }
    const err = await res.json().catch(() => ({}));
    const msg = err.error || `HTTP ${res.status}`;
    if (mutation) showToast({ type: "error", title: "Couldn’t save your change", body: msg });
    throw new Error(msg);
  }
  return await res.json();
}

export const api = {
  getTime: () => req("GET", "/api/time"),
  getState: () => req("GET", "/api/state"),

  // Passwortloser Login (Magic-Link) + Sitzung.
  auth: {
    me: () => req("GET", "/api/auth/me"),
    request: (email) => req("POST", "/api/auth/request", { email }),
    logout: () => req("POST", "/api/auth/logout"),
  },

  timer: {
    start:  () => req("POST", "/api/timer/start"),
    pause:  () => req("POST", "/api/timer/pause"),
    resume: () => req("POST", "/api/timer/resume"),
    skip:   () => req("POST", "/api/timer/skip"),
    reset:  () => req("POST", "/api/timer/reset"),
    phase:  (phase) => req("POST", "/api/timer/phase", { phase }),
    activeTask: (taskId) => req("POST", "/api/timer/active-task", { taskId }),
  },

  setSettings: (patch) => req("PUT", "/api/settings", patch),

  exams: {
    create: (data) => req("POST", "/api/exams", data),
    update: (id, patch) => req("PUT", `/api/exams/${id}`, patch),
    remove: (id) => req("DELETE", `/api/exams/${id}`),
  },

  navNodes: {
    create: (data) => req("POST", "/api/nav-nodes", data),
    update: (id, patch) => req("PUT", `/api/nav-nodes/${id}`, patch),
    remove: (id) => req("DELETE", `/api/nav-nodes/${id}`),
  },

  tasks: {
    create: (data) => req("POST", "/api/tasks", data),
    update: (id, patch) => req("PUT", `/api/tasks/${id}`, patch),
    remove: (id) => req("DELETE", `/api/tasks/${id}`),
    reorder: (ids) => req("POST", "/api/tasks/reorder", { ids }),
    addSubtask: (taskId, text) => req("POST", `/api/tasks/${taskId}/subtasks`, { text }),
    // Verschieben: erhöht postpone_count UND setzt Datum/Uhrzeit in einem Schritt.
    postpone: (id, patch) => req("POST", `/api/tasks/${id}/postpone`, patch),
    // Abhängigkeiten: erst Grundlage, dann Vertiefung.
    addDep: (id, dependsOnId) => req("POST", `/api/tasks/${id}/deps`, { dependsOnId }),
    removeDep: (id, dependsOnId) => req("DELETE", `/api/tasks/${id}/deps/${dependsOnId}`),
  },

  // Auto-Tagesplan (Prio/Deps/Kalender/Kapazität) — Antwort: Snapshot + plan-Report.
  plan: {
    day: (date, capacityMultiplier) => req("POST", "/api/plan/day", {
      ...(date ? { date } : {}),
      ...(capacityMultiplier != null ? { capacityMultiplier } : {}),
    }),
    // Lernziel → Themenvorschlag. Schreibt NICHTS (liefert keinen Snapshot).
    topics: (data) => req("POST", "/api/plan/topics", data),
    // Vorschlag übernehmen → Snapshot + { applied: { examId, topics, tasks } }.
    applyTopics: (data) => req("POST", "/api/plan/topics/apply", data),
  },

  // Kalender-Konten (iCloud-CalDAV / ICS-Abo) + Tages-Termine.
  calendar: {
    accounts: () => req("GET", "/api/calendar/accounts"),
    addAccount: (data) => req("POST", "/api/calendar/accounts", data),
    updateAccount: (id, patch) => req("PUT", `/api/calendar/accounts/${id}`, patch),
    removeAccount: (id) => req("DELETE", `/api/calendar/accounts/${id}`),
    syncAccount: (id) => req("POST", `/api/calendar/accounts/${id}/sync`),
    setCalendarEnabled: (id, enabled) => req("PUT", `/api/calendar/collections/${id}`, { enabled }),
    removeCalendar: (id) => req("DELETE", `/api/calendar/collections/${id}`),
    day: (date) => req("GET", `/api/calendar/day?date=${encodeURIComponent(date)}`),
  },

  subtasks: {
    update: (id, patch) => req("PUT", `/api/subtasks/${id}`, patch),
    remove: (id) => req("DELETE", `/api/subtasks/${id}`),
  },

  topics: {
    create: (data) => req("POST", "/api/topics", data),
    update: (id, patch) => req("PUT", `/api/topics/${id}`, patch),
    remove: (id) => req("DELETE", `/api/topics/${id}`),
  },

  notes: {
    create: (data) => req("POST", "/api/notes", data),
    update: (id, patch) => req("PUT", `/api/notes/${id}`, patch),
    remove: (id) => req("DELETE", `/api/notes/${id}`),
  },

  resources: {
    create: (data) => req("POST", "/api/resources", data),
    update: (id, patch) => req("PUT", `/api/resources/${id}`, patch),
    remove: (id) => req("DELETE", `/api/resources/${id}`),
  },

  profile: {
    get: () => req("GET", "/api/profile"),
    save: (patch) => req("PUT", "/api/profile", patch),
  },

  health: {
    latest: () => req("GET", "/api/health/latest"),
    daily: () => req("GET", "/api/health/daily"),
    context: () => req("GET", "/api/health/context"),
    saveDaily: (data) => req("POST", "/api/health/daily", data),
  },

  push: {
    publicKey: () => req("GET", "/api/push/public-key"),
    subscribe: (sub) => req("POST", "/api/push/subscribe", sub),
    unsubscribe: (endpoint) => req("POST", "/api/push/unsubscribe", { endpoint }),
    test: () => req("POST", "/api/push/test"),
  },

  // Nutzer-Präferenzen (Lernprofil, Darstellung, Features, Methoden) — JSON-Merge.
  prefs: {
    save: (patch) => req("PUT", "/api/prefs", patch),
  },

  // Material-Bibliothek: Links/Karten als JSON, Dateien als Roh-Upload.
  materials: {
    create: (data) => req("POST", "/api/materials", data),
    update: (id, patch) => req("PUT", `/api/materials/${id}`, patch),
    remove: (id) => req("DELETE", `/api/materials/${id}`),
    fileUrl: (id) => `/api/materials/${id}/file`,
    // Roh-Upload: Browser setzt Content-Type aus file.type; Metadaten via Query.
    upload: async (file, meta = {}) => {
      const params = new URLSearchParams();
      params.set("title", meta.title || file.name || "File");
      if (meta.topicId != null) params.set("topicId", String(meta.topicId));
      if (meta.examId != null) params.set("examId", String(meta.examId));
      if (meta.noteId != null) params.set("noteId", String(meta.noteId));
      if (meta.subject) params.set("subject", meta.subject);
      let res;
      try {
        res = await fetch(`/api/materials/upload?${params}`, { method: "POST", body: file });
      } catch (e) {
        offlineHandler?.(false);
        offlineToast();
        throw e;
      }
      offlineHandler?.(true);
      if (!res.ok) {
        if (res.status === 401) {
          window.dispatchEvent(new CustomEvent("auth-required"));
          throw new Error("Not signed in");
        }
        const err = await res.json().catch(() => ({}));
        const msg = err.error || `HTTP ${res.status}`;
        showToast({ type: "error", title: "Upload failed", body: msg });
        throw new Error(msg);
      }
      return await res.json();
    },
  },

  // Aktiver Abruf (SRS).
  reviews: {
    add: (kind, refId) => req("POST", "/api/reviews", { kind, refId }),
    answer: (id, grade) => req("POST", `/api/reviews/${id}/answer`, { grade }),
    remove: (id) => req("DELETE", `/api/reviews/${id}`),
  },

  journal: {
    get: (days = 14) => req("GET", `/api/journal?days=${days}`),
  },

  // Teilen per Link.
  shares: {
    list: () => req("GET", "/api/shares"),
    create: (kind, refId) => req("POST", "/api/shares", { kind, refId }),
    revoke: (id) => req("DELETE", `/api/shares/${id}`),
    importToken: (token) => req("POST", "/api/shares/import", { token }),
    resolve: (token) => req("GET", `/api/shares/public/${encodeURIComponent(token)}`),
  },

  // KI-Buddy.
  ai: {
    getConfig: () => req("GET", "/api/ai/config"),
    saveConfig: (patch) => req("PUT", "/api/ai/config", patch),
    chat: (payload) => req("POST", "/api/ai/chat", payload),
  },
};
