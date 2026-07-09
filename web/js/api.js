// REST-Client zum Lernuhr-Backend. Jede Mutation liefert die volle Momentaufnahme.
// Bei Netzfehler wird onOffline() gemeldet, damit die UI weiterläuft (PWA-Cache).

const BASE = ""; // gleiche Origin wie die PWA

let offlineHandler = null;
export function onConnectivity(fn) { offlineHandler = fn; }

async function req(method, path, body) {
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    offlineHandler?.(true);
    return await res.json();
  } catch (e) {
    offlineHandler?.(false);
    throw e;
  }
}

export const api = {
  getTime: () => req("GET", "/api/time"),
  getState: () => req("GET", "/api/state"),

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

  tasks: {
    create: (data) => req("POST", "/api/tasks", data),
    update: (id, patch) => req("PUT", `/api/tasks/${id}`, patch),
    remove: (id) => req("DELETE", `/api/tasks/${id}`),
    reorder: (ids) => req("POST", "/api/tasks/reorder", { ids }),
    addSubtask: (taskId, text) => req("POST", `/api/tasks/${taskId}/subtasks`, { text }),
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

  push: {
    publicKey: () => req("GET", "/api/push/public-key"),
    subscribe: (sub) => req("POST", "/api/push/subscribe", sub),
    unsubscribe: (endpoint) => req("POST", "/api/push/unsubscribe", { endpoint }),
    test: () => req("POST", "/api/push/test"),
  },
};
