// Health-Ansicht (Kairos Sage): Quellen-Zeile + 6-Karten-Raster
// (Sleep · Recovery · Cycle · Activity · Body · Wellness). Ehrlich: nur echte
// Backend-Felder werden zu Zahlen/Diagrammen, alles ohne Backend ist ein ruhiger
// „noch keine Daten"-Zustand (kein erfundener Wert).
//
// Datenquellen (im Store verdrahtet): store.state.health (computeHealthContext),
// store.state.profile, store.state.settings.todayGoalHours. Der rohe jüngste Tag
// (Schlafphasen, Schritte …) + die HRV-Reihe werden separat per api geladen.

import { formatClock, dayKeyOf, keyToMs, escapeHtml } from "/js/util.js";
import { createFocusTrap } from "/js/focusTrap.js";
import { icon } from "/js/icons.js";

const SOURCE_LABELS = {
  oura: "Oura Ring", ringconn: "RingConn", whoop: "WHOOP", apple_health: "Apple Health",
  google_fit: "Google Fit", manual: "Manual", generic: "Generic",
};
const REC = {
  increase: { badge: "Ready",  word: "Ready to push",   cls: "increase", ring: "var(--accent)" },
  reduce:   { badge: "Rest",   word: "Ease off today",  cls: "reduce",   ring: "var(--now)" },
  maintain: { badge: "Steady", word: "Hold steady",     cls: "maintain", ring: "var(--muted-3)" },
  unknown:  { badge: "—",      word: "Not enough data", cls: "unknown",  ring: "var(--muted-3)" },
};

export function initHealth({ store, api }) {
  const el = (id) => document.getElementById(id);
  let cachedLatest = null;  // rohes jüngstes Tagesobjekt (DAILY_FIELDS) oder null
  let cachedDaily = [];     // chronologische Tagesreihe (für HRV-/Gewichts-Linien)
  let syncedAt = null;

  const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const one = (n) => (n == null ? "–" : Number(n).toFixed(1));
  const compactK = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));

  function hoursToHM(hours) {
    if (hours == null) return "–:––";
    const total = Math.max(0, Math.round(hours * 60));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  }
  function relTime(ms) {
    if (ms == null) return "—";
    const diff = store.now() - ms;
    if (diff < 60_000) return "just now";
    const min = Math.floor(diff / 60_000);
    if (min < 60) return `${min} min ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} h ago`;
    const d = Math.floor(hr / 24);
    return d === 1 ? "yesterday" : `${d} d ago`;
  }

  // ── Diagramm-Bausteine ─────────────────────────────────
  function ringHtml(frac, color, val, unit, cls = "") {
    const f = Math.max(0, Math.min(1, frac || 0));
    return `<div class="ring health-ring ${cls}" style="--frac:${f.toFixed(3)}; --ring-color:${color}; --ring-track:#EAE8E0">
        <div class="ring__hole"><span class="health-ring__val">${val}</span><span class="health-ring__unit">${unit}</span></div>
      </div>`;
  }
  // Linien-Chart aus einer Zahlenreihe (auto-skaliert). <2 Punkte → flache Basislinie.
  function lineChart(values, color) {
    const pts = values.map((v, i) => [i, num(v)]).filter((p) => p[1] != null);
    if (pts.length < 2) {
      return `<svg class="health-line" viewBox="0 0 140 46" preserveAspectRatio="none"><line x1="0" y1="23" x2="140" y2="23" stroke="var(--line)" stroke-width="2.5" stroke-linecap="round"/></svg>`;
    }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    let minY = Math.min(...ys), maxY = Math.max(...ys);
    if (maxY - minY < 1e-6) { minY -= 1; maxY += 1; }
    const pad = (maxY - minY) * 0.18; minY -= pad; maxY += pad;
    const X = (x) => ((x - minX) / (maxX - minX || 1)) * 140;
    const Y = (y) => 46 - ((y - minY) / (maxY - minY)) * 46;
    const d = pts.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(" ");
    return `<svg class="health-line" viewBox="0 0 140 46" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  function orb(frac, color, label, muted) {
    const grad = muted
      ? `conic-gradient(#EAE8E0 100%, #EAE8E0 0)`
      : `conic-gradient(${color} ${(Math.max(0, Math.min(1, frac)) * 100).toFixed(0)}%, #EAE8E0 0)`;
    return `<div class="health-orb"><div class="health-orb__ring" style="background:${grad}"><div class="health-orb__hole"></div></div><div class="health-orb__label">${label}</div></div>`;
  }
  function badgeHtml(rec) { return `<span class="health-badge health-badge--${rec.cls}">${rec.badge}</span>`; }
  function card(title, right, body, cls = "") {
    const label = right ? (String(right).startsWith("<") ? right : `<span class="health-card__label">${escapeHtml(right)}</span>`) : "";
    return `<section class="card health-card ${cls}">
        <div class="health-card__head"><span class="health-card__title">${title}</span>${label}</div>
        ${body}
      </section>`;
  }
  const foot = (l, r) => `<div class="health-foot"><span class="health-foot__l">${l}</span><span class="health-foot__r">${r}</span></div>`;

  // ── Datenladen ─────────────────────────────────────────
  async function loadLatest() {
    try { cachedLatest = (await api.health.latest())?.day ?? null; }
    catch { cachedLatest = null; }
    try {
      const res = await api.health.daily();
      cachedDaily = (res?.days || []).slice().sort((a, b) => String(a.dayKey).localeCompare(String(b.dayKey)));
    } catch { cachedDaily = []; }
    render();
  }
  async function saveManual(payload) {
    try {
      await api.health.saveDaily(payload);
      store.applySnapshot(await api.getState());
      await loadLatest();
    } catch (e) { console.warn("[health]", e.message); }
  }
  async function act(fn) { try { store.applySnapshot(await fn()); } catch (e) { console.warn("[health]", e.message); } }

  // „Enter manually" wird pro Render neu erzeugt → Delegation auf #healthSource.
  el("healthSource")?.addEventListener("click", (e) => {
    if (e.target.closest("#healthManualBtn")) openManualModal();
  });

  // ── Quellen-Zeile ──────────────────────────────────────
  function renderSource(health, aim) {
    const host = el("healthSource");
    if (!host) return;
    const manualChip = `<span class="health-chip health-chip--action" id="healthManualBtn" role="button" tabindex="0">${icon("edit", { size: 14, stroke: 2 })}Enter manually</span>`;
    if (!health.hasData) {
      syncedAt = null;
      host.innerHTML = `
        <div class="health-source__chips">${manualChip}</div>
        <span class="health-source__note">No wearable data yet — enter a night manually · aim ~${one(aim)} h</span>`;
      return;
    }
    const active = health.source;
    syncedAt = num(cachedLatest?.recordedAt) ?? num(cachedLatest?.updatedAt) ?? keyToMs(health.latestDay);
    const label = SOURCE_LABELS[active] || active;
    host.innerHTML = `
      <div class="health-source__chips">
        <span class="health-chip is-active"><span class="health-chip__dot"></span>${escapeHtml(label)} · synced ${relTime(syncedAt)}</span>
        <span class="health-chip" title="Apple Health — connect coming soon"><span class="health-chip__dot"></span>Apple Health</span>
        ${manualChip}
      </div>
      <span class="health-source__note">Feeds today's capacity → aim ~${one(aim)} h</span>`;
  }

  // ── Karten ─────────────────────────────────────────────
  function cardSleep(health) {
    const s = health.sleep || {};
    const goal = num(health.goalHours) ?? 8;
    const hrs = num(s.lastNightHours);
    const L = cachedLatest || {};
    if (hrs == null) return card("Sleep", "last night", `<p class="empty health-card__grow">No sleep logged — add a night manually.</p>`);

    const ring = ringHtml(hrs / goal, "var(--accent)", hoursToHM(hrs), "hours");
    const deep = num(L.sleepDeepMin), rem = num(L.sleepRemMin), light = num(L.sleepLightMin);
    const total = (deep || 0) + (rem || 0) + (light || 0);
    let stages = "";
    if (total > 0) {
      const seg = (m, cls) => (m ? `<span class="health-stage health-stage--${cls}" style="flex-grow:${m}"></span>` : "");
      stages = `<div class="health-stages">${seg(deep, "deep")}${seg(rem, "rem")}${seg(light, "light")}</div>
        <div class="health-legend">${deep ? "<span>Deep</span>" : ""}${rem ? "<span>REM</span>" : ""}${light ? "<span>Light</span>" : ""}</div>`;
    }
    const score = num(L.sleepScore), inBed = num(L.sleepStart);
    const meta = [];
    if (score != null) meta.push(`Score ${Math.round(score)}`);
    if (inBed != null) meta.push(`in bed ${formatClock(inBed)}`);
    const metaLine = meta.length ? `<div class="health-sub">${meta.join(" · ")}</div>` : "";
    return card("Sleep", "last night", `<div class="health-row">${ring}<div class="health-col">${stages}${metaLine}</div></div>`);
  }

  function cardRecovery(health) {
    const rec = REC[health.recommendation] || REC.unknown;
    const readiness = num(health.readiness);
    const hrv = health.hrv || {};
    const rhr = health.restingHr || {};
    const L = cachedLatest || {};
    const hasAny = readiness != null || num(hrv.latestMs) != null || num(rhr.latest) != null;
    if (!hasAny) return card("Recovery", badgeHtml(rec), `<p class="empty health-card__grow">No recovery signals yet.</p>`);

    // Design: Recovery = volle HRV-Sparkline + Badge + Foot (KEIN Ring).
    const series = cachedDaily.map((d) => d.hrvMs);
    const line = lineChart(series, "var(--accent)");
    const hrvD = num(hrv.deltaPct);
    const trend = hrvD == null ? "No HRV trend yet" : hrvD > 0 ? "HRV trending up" : hrvD < 0 ? "HRV trending down" : "HRV steady";
    const parts = [];
    if (num(rhr.latest) != null) parts.push(`RHR ${Math.round(num(rhr.latest))}`);
    if (num(L.spo2Avg) != null) parts.push(`SpO₂ ${Math.round(num(L.spo2Avg))}`);
    return card("Recovery", badgeHtml(rec), `${line}${foot(trend, parts.join(" · "))}`);
  }

  // Cycle: kein Backend → ehrlicher Leerzustand mit 1:1-Layout (rosa Ring gedämpft).
  function cardCycle() {
    const ring = `<div class="ring health-ring health-ring--cycle"><div class="ring__hole"><span class="health-ring__val">–</span><span class="health-ring__unit">day</span></div></div>`;
    return card("Cycle", "women's health",
      `<div class="health-row">${ring}<div class="health-col"><div class="health-cycle__phase">Cycle</div><div class="health-sub">Tracking not connected yet</div><div class="health-muted">Coming soon</div></div></div>`);
  }

  function cardActivity() {
    const L = cachedLatest || {};
    const steps = num(L.steps), mins = num(L.activityMin);
    if (steps == null && mins == null) return card("Activity", "today", `<p class="empty health-card__grow">No movement data — add steps manually.</p>`);
    // Ehrlich: keine Intraday-Aufschlüsselung → gleichmäßig gedämpfte Platzhalter-Balken.
    const bars = `<div class="health-bars">${Array.from({ length: 7 }, () => `<i style="height:46%"></i>`).join("")}</div>`;
    const l = steps != null ? `${compactK(steps)} steps` : "—";
    const r = mins != null ? `${Math.round(mins)} active min` : "";
    return card("Activity", "today", `${bars}${foot(l, r)}`);
  }

  function cardBody(profile) {
    const w = num(profile.weightKg), hcm = num(profile.heightCm);
    if (w == null) return card("Body", "30 days", `<p class="empty health-card__grow">Add your weight in your profile.</p>`);
    // Ehrlich: kein Gewichtsverlauf gespeichert → flache Basislinie.
    const line = lineChart(cachedDaily.map(() => w), "var(--blue)");
    let r = "";
    if (hcm != null && hcm > 0) {
      const bmi = w / ((hcm / 100) ** 2);
      const catn = bmi < 18.5 ? "under" : bmi < 25 ? "normal" : bmi < 30 ? "over" : "high";
      r = `BMI ${bmi.toFixed(1)} <span class="health-foot__cat">${catn}</span>`;
    }
    return card("Body", "30 days", `${line}${foot(`${one(w)} kg · steady`, r)}`);
  }

  function cardWellness(health) {
    const L = cachedLatest || {};
    const stress = num(L.stressAvg), readiness = num(health.readiness);
    const orbs = `<div class="health-wellness">
        ${orb(0, "var(--accent)", "Mood", true)}
        ${orb(stress != null ? stress / 100 : 0, "var(--amber)", "Stress", stress == null)}
        ${orb(readiness != null ? readiness / 100 : 0, "var(--accent)", "Energy", readiness == null)}
      </div>`;
    return card("Wellness", "how you feel", orbs);
  }

  // ── Manuelles Eingabe-Modal (unverändert) ──────────────
  function openManualModal() {
    const today = dayKeyOf(store.now());
    const L = cachedLatest && cachedLatest.dayKey === today ? cachedLatest : {};
    const prefSleep = L.sleepTotalMin != null ? (L.sleepTotalMin / 60).toFixed(1) : "";
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="healthManualTitle">
        <div class="modal-box__title" id="healthManualTitle">Log a night manually</div>
        <div class="modal-box__msg">Enter what you know — blanks are left untouched. Feeds today's capacity.</div>
        <div class="health-form">
          <label class="health-field">Date<input type="date" data-f="date" value="${today}" max="${today}" /></label>
          <label class="health-field">Sleep (hours)<input type="number" data-f="sleep" step="0.1" min="0" max="24" placeholder="7.5" value="${prefSleep}" /></label>
          <label class="health-field">HRV (ms)<input type="number" data-f="hrv" step="1" min="0" max="400" placeholder="58" value="${L.hrvMs ?? ""}" /></label>
          <label class="health-field">Resting HR (bpm)<input type="number" data-f="rhr" step="1" min="20" max="220" placeholder="54" value="${L.restingHr ?? ""}" /></label>
          <label class="health-field">Steps<input type="number" data-f="steps" step="100" min="0" max="200000" placeholder="8000" value="${L.steps ?? ""}" /></label>
        </div>
        <div class="modal-box__actions">
          <button class="btn btn--ghost" data-a="cancel">Cancel</button>
          <button class="btn btn--primary" data-a="save">Save</button>
        </div>
      </div>`;
    const close = () => { trap.release(); overlay.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    const v = (f) => overlay.querySelector(`[data-f="${f}"]`)?.value;
    function submit() {
      const payload = { source: "manual", date: v("date") || dayKeyOf(store.now()) };
      const sleep = num(v("sleep")), hrv = num(v("hrv")), rhr = num(v("rhr")), steps = num(v("steps"));
      if (sleep != null) payload.sleepTotalMin = Math.round(sleep * 60);
      if (hrv != null) payload.hrvMs = hrv;
      if (rhr != null) payload.restingHr = rhr;
      if (steps != null) payload.steps = Math.round(steps);
      close();
      saveManual(payload);
    }
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) return close();
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (a === "cancel") close();
      if (a === "save") submit();
    });
    overlay.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); submit(); } });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
    const trap = createFocusTrap(overlay.querySelector(".modal-box"), { initialFocus: false });
    trap.activate();
    overlay.querySelector('[data-f="sleep"]')?.focus();
  }

  // ── Render ─────────────────────────────────────────────
  function render() {
    const s = store.state;
    const health = s.health || { hasData: false, recommendation: "unknown", capacityMultiplier: 1 };
    const profile = s.profile || {};
    const baseGoal = num(s.settings?.todayGoalHours) ?? 4;
    const aim = (num(health.capacityMultiplier) ?? 1) * baseGoal;

    renderSource(health, aim);
    const grid = el("healthGrid");
    if (!grid) return;
    grid.innerHTML = [
      cardSleep(health), cardRecovery(health), cardCycle(),
      cardActivity(), cardBody(profile), cardWellness(health),
    ].join("");
  }

  store.subscribe(render);
  render();
  loadLatest();

  function tick() {
    if (syncedAt == null) return;
    const chip = document.querySelector(".health-chip.is-active");
    // Nur das relative Sync-Label auffrischen wäre teuer (Text im Chip) — überspringen,
    // der nächste Store-/Reconcile-Render aktualisiert es ohnehin.
    void chip;
  }
  return { tick };
}
