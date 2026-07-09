// Anbindung an das Lernuhr-Backend (Node/SQLite, http://localhost:4321).
// Teilt denselben autoritativen Timer mit der PWA. Jede Timer-Mutation liefert
// die volle Momentaufnahme (Snapshot) zurück. Wirft bei Nichterreichbarkeit,
// damit das Popup sauber auf sein lokales Verhalten zurückfallen kann.

export const BASE = "http://localhost:4321";

// Generischer Request mit AbortController-Timeout. Wirft bei Netz-/HTTP-Fehler.
async function req(method, path, body, timeoutMs = 4000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Kurzer Health-Check (~800 ms). Gibt bool zurück, wirft nie.
export async function isReachable() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 800);
  try {
    const res = await fetch(BASE + "/api/health", { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Vollständige Momentaufnahme lesen.
export function getState() {
  return req("GET", "/api/state");
}

// ── Timer-Aktionen (liefern jeweils den neuen Snapshot) ──
export function start()  { return req("POST", "/api/timer/start"); }
export function pause()  { return req("POST", "/api/timer/pause"); }
export function resume() { return req("POST", "/api/timer/resume"); }
export function skip()   { return req("POST", "/api/timer/skip"); }
export function reset()  { return req("POST", "/api/timer/reset"); }

// Aktive Aufgabe im Timer setzen (id oder null).
export function setActiveTask(id) {
  return req("POST", "/api/timer/active-task", { taskId: id });
}
