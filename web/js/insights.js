// Insights: schreibgeschütztes Analyse-Dashboard, rein aus store.state abgeleitet.
// Layout (Design): Top-Row = Streak-Hero + Focus this month + Topic confidence;
// Chart-Row = Focus hours across the day + Time by subject. Keine api-Mutationen.
// Speist zusätzlich das (im Design von Today entfernte) #focusRhythm-Widget, falls vorhanden.
import {
  escapeHtml, subjectColor, formatHours, dayKeyOf, keyToMs, addDaysKey, mondayOf,
} from "/js/util.js";
import { computeStreak } from "/shared/streak.js";
import { t, getLang } from "/js/i18n.js";
import { icon } from "/js/icons.js";

const DOW_SHORT = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const DOW_3 = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function initInsights({ store }) {
  const el = (id) => document.getElementById(id);
  const gridEl = el("insightsGrid");
  const rhythmChartEl = el("focusRhythmChart");
  const rhythmNoteEl = el("focusRhythmNote");

  let lastGrid = null, lastChart = null, lastNote = null;
  const focusOf = (metrics, key) => (metrics[key] && metrics[key].focusMs) || 0;

  // ── Top-Row · Streak-Hero (grün) ─────────────────
  function heroStreak(metrics, todayKey) {
    // ADHS-freundlich: ein einzelner Fehltag bricht die Serie nicht (Gnadentag).
    const { streak, graceUsed } = computeStreak(metrics, todayKey, { graceDays: 1 });
    const segs = [];
    for (let i = 6; i >= 0; i--) {
      const key = addDaysKey(todayKey, -i);
      segs.push(`<i class="ins-hero__seg${focusOf(metrics, key) > 0 ? " is-on" : ""}"></i>`);
    }
    const grace = graceUsed > 0
      ? `<div class="ins-hero__grace" style="margin-top:6px;font-size:12px;font-weight:600;opacity:.72">${icon("heart")}${escapeHtml(t("insights.grace_used"))}</div>`
      : "";
    return `<div class="ins-card ins-hero">
      <div class="ins-hero__eyebrow">Streak</div>
      <div class="ins-hero__num">${streak}<span class="ins-hero__unit">day${streak === 1 ? "" : "s"}</span></div>
      <div class="ins-hero__strip">${segs.join("")}</div>
      ${grace}
    </div>`;
  }

  // ── Top-Row · Focus this month (echt, mit Delta gegen den Vormonat) ──
  function statFocusMonth(metrics, todayKey) {
    const [y, m] = todayKey.split("-").map(Number);
    const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
    let cur = 0, prev = 0;
    for (const [key, v] of Object.entries(metrics)) {
      const [ky, km] = key.split("-").map(Number);
      const ms = (v && v.focusMs) || 0;
      if (ky === y && km === m) cur += ms;
      else if (ky === py && km === pm) prev += ms;
    }
    let delta = "";
    if (prev > 0 && cur > 0) {
      const pct = Math.round(((cur - prev) / prev) * 100);
      const up = pct >= 0;
      // Richtung kommt vom Icon (bei „runter" per CSS gespiegelt), Farbe aus .is-up/.is-down.
      delta = `<span class="ins-delta${up ? " is-up" : " is-down"}">${icon("trending", { size: 13 })}${Math.abs(pct)}%</span>`;
    }
    const sub = prev > 0 ? `vs ${formatHours(prev)} h last month` : (cur > 0 ? "first tracked month" : "no focus logged yet");
    return `<div class="ins-card ins-stat-card">
      <div class="ins-stat-card__eyebrow">Focus this month</div>
      <div class="ins-stat-card__row"><span class="ins-stat-card__num">${formatHours(cur)}<span class="ins-stat-card__unit">h</span></span>${delta}</div>
      <div class="ins-stat-card__sub">${escapeHtml(sub)}</div>
    </div>`;
  }

  // ── Top-Row · Topic confidence (echt: Anteil „solid" über alle Prüfungs-Themen) ──
  // Ehrlich aus done/confidence abgeleitet — „solid" = erledigt oder Confidence 3/3.
  function statTopicConfidence(topics) {
    const total = topics.length;
    const solid = topics.reduce((n, t) => n + ((t.done || (t.confidence || 0) >= 3) ? 1 : 0), 0);
    const unrated = topics.reduce((n, t) => n + ((!t.done && (t.confidence || 0) === 0) ? 1 : 0), 0);
    const frac = total ? solid / total : 0;
    const pct = Math.round(frac * 100);
    const note = !total
      ? "Add topics to an exam and rate them to see what’s solid."
      : `${solid} of ${total} topic${total === 1 ? "" : "s"} solid${unrated ? ` · ${unrated} unrated` : ""}`;
    return `<div class="ins-card ins-stat-card">
      <div class="ins-stat-card__eyebrow">Topic confidence</div>
      <div class="ins-recall">
        <div class="ins-recall__ring ring${total ? " is-live" : ""}" style="--frac:${frac.toFixed(3)}"><div class="ring__hole ins-recall__hole">${total ? pct + "%" : "—"}</div></div>
        <div class="ins-recall__note">${escapeHtml(note)}</div>
      </div>
    </div>`;
  }

  // ── Chart-Row · Focus hours across the day (kein Stunden-Backend → Struktur + ehrlich leer) ──
  function chartFocusHours() {
    const bars = Array.from({ length: 13 }, () => `<i class="ins-hourbar"></i>`).join("");
    return `<div class="ins-card ins-chart-card ins-chart-card--wide">
      <div class="ins-chart-card__title">Focus hours across the day</div>
      <div class="ins-chart-card__sub">your real productive windows</div>
      <div class="ins-hours">
        <div class="ins-hours__bars">${bars}</div>
        <div class="ins-hours__empty">Hour-by-hour view needs session times — it fills in as you focus.</div>
      </div>
      <div class="ins-hours__axis"><span>08</span><span>12</span><span>16</span><span>20</span></div>
    </div>`;
  }

  // ── Chart-Row · Schätzung vs. Realität (gelerntes Tempo je Schwierigkeit) ──
  function chartPace(pace) {
    const rows = [1, 2, 3].map((d) => {
      const b = pace?.byDifficulty?.[d];
      const label = t(`task.diff${d}`);
      if (!b || !b.n) return `<div class="ins-pace"><span class="ins-pace__lbl">${escapeHtml(label)}</span><div class="ins-pace__track"></div><span class="ins-pace__val">—</span></div>`;
      const f = Math.round(b.factor * 100) / 100;
      const w = Math.max(6, Math.min(100, Math.round((f / 2) * 100)));   // ×2 = volle Breite
      return `<div class="ins-pace">
        <span class="ins-pace__lbl">${escapeHtml(label)}</span>
        <div class="ins-pace__track"><div class="ins-pace__bar${f > 1.1 ? " is-over" : ""}" style="width:${w}%"></div></div>
        <span class="ins-pace__val">${escapeHtml(t("insights.pace_row", { f, n: b.n }))}</span>
      </div>`;
    }).join("");
    const any = [1, 2, 3].some((d) => pace?.byDifficulty?.[d]?.n);
    return `<div class="ins-card ins-chart-card">
      <div class="ins-chart-card__title">${escapeHtml(t("insights.pace_title"))}</div>
      <div class="ins-chart-card__sub">${escapeHtml(t("insights.pace_sub"))}</div>
      ${any ? `<div class="ins-pace-list">${rows}</div>` : `<p class="empty">${escapeHtml(t("insights.pace_empty"))}</p>`}
    </div>`;
  }

  // Aufgabenfluss gehört bewusst hierher, nicht auf Today: Insights wird aktiv
  // geöffnet. Neutrale Sprache, keine Warnfarbe, keine Bewertung.
  function taskFlow(tasks, todayKey, now) {
    const open = tasks.filter((x) => !x.done);
    const carried = open.filter((x) => x.plannedDate && x.plannedDate < todayKey).length;
    const due = open.filter((x) => x.dueDate && x.dueDate < now).length;
    const weekAgo = now - 7 * 86_400_000;
    const completed = tasks.filter((x) => x.done && x.doneAt && x.doneAt >= weekAgo).length;
    const de = getLang() === "de";
    const stats = de
      ? [[open.length,"Offen"],[carried,"Aus früheren Tagen"],[due,"Deadline vorbei"],[completed,"In 7 Tagen erledigt"]]
      : [[open.length,"Open"],[carried,"From earlier days"],[due,"Past deadline"],[completed,"Done in 7 days"]];
    return `<div class="ins-card ins-flow-card">
      <div class="ins-chart-card__title">${de ? "Aufgabenfluss" : "Task flow"}</div>
      <div class="ins-chart-card__sub">${de ? "Nur zur Analyse — diese Zahlen erscheinen nicht auf Today." : "For reflection only — these numbers stay off Today."}</div>
      <div class="ins-flow">${stats.map(([n,l]) => `<div class="ins-flow__stat"><b>${n}</b><span>${escapeHtml(l)}</span></div>`).join("")}</div>
    </div>`;
  }

  // ── Chart-Row · Time by subject (echt: reale Fokuszeit, sonst Schätzung erledigter Aufgaben) ──
  function chartSubjects(tasks) {
    const bySubject = new Map();
    for (const t of tasks) {
      let eff = t.spentMs || 0;
      if (eff <= 0 && t.done && t.estMinutes) eff = t.estMinutes * 60_000;
      if (eff <= 0) continue;
      const name = (t.subject || "").trim() || "No subject";
      bySubject.set(name, (bySubject.get(name) || 0) + eff);
    }
    const rows = [...bySubject.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    let inner, foot = "";
    if (rows.length) {
      const max = rows[0][1] || 1;
      inner = rows.map(([name, ms]) => {
        const sc = subjectColor(name === "No subject" ? "" : name);
        const w = Math.max(4, Math.round((ms / max) * 100));
        return `<div class="ins-subj ${sc.cls}"><div class="ins-subj__top"><span class="ins-subj__name">${escapeHtml(name)}</span><span class="ins-subj__hrs">${formatHours(ms)} h</span></div><div class="ins-subj__track"><div class="ins-subj__bar" style="width:${w}%"></div></div></div>`;
      }).join("");
      foot = `<div class="ins-subj-foot">Most effort on ${escapeHtml(rows[0][0])} — ${formatHours(rows[0][1])} h so far.</div>`;
    } else {
      inner = `<p class="empty">Track focus on tasks to see where your time goes.</p>`;
    }
    return `<div class="ins-card ins-chart-card">
      <div class="ins-chart-card__title">Time by subject</div>
      <div class="ins-subj-list">${inner}</div>
      ${foot}
    </div>`;
  }

  // ── „Focus this week"-Widget (falls das Element existiert; im Design von Today entfernt) ──
  function renderTodayWidget(metrics, todayKey) {
    if (!rhythmChartEl && !rhythmNoteEl) return;
    const monday = mondayOf(todayKey);
    const bars = [];
    let total = 0, peakIdx = -1, peakVal = 0, max = 0;
    for (let i = 0; i < 7; i++) {
      const key = addDaysKey(monday, i);
      const ms = focusOf(metrics, key);
      total += ms; max = Math.max(max, ms);
      if (ms > peakVal) { peakVal = ms; peakIdx = i; }
      bars.push({ ms, isToday: key === todayKey });
    }
    if (max <= 0) { setHtml(`<p class="empty">Start a focus session to see your rhythm.</p>`); setText("No focus logged this week yet."); return; }
    const html = `<div class="ins-chart ins-chart--mini"><div class="ins-chart__bars">${bars.map((b) => {
      const px = b.ms > 0 ? Math.max(4, Math.round((b.ms / max) * 44)) : 3;
      return `<div class="ins-bar${b.isToday ? " is-hot" : ""}${b.ms > 0 ? "" : " is-empty"}" style="height:${px}px"></div>`;
    }).join("")}</div></div>`;
    setHtml(html);
    setText(`${formatHours(total)} h this week${peakIdx >= 0 ? ` · best on ${DOW_3[peakIdx]}` : ""}`);
  }
  function setHtml(html) { if (rhythmChartEl && html !== lastChart) { lastChart = html; rhythmChartEl.innerHTML = html; } }
  function setText(t) { if (rhythmNoteEl && t !== lastNote) { lastNote = t; rhythmNoteEl.textContent = t; } }

  // ── Haupt-Render ────────────────────────────────
  function render() {
    const s = store.state;
    const metrics = s.recentMetrics || {};
    const tasks = s.tasks || [];
    const todayKey = dayKeyOf(store.now());

    if (gridEl) {
      const html =
        `<div class="ins-stat-row">${heroStreak(metrics, todayKey)}${statFocusMonth(metrics, todayKey)}${statTopicConfidence(s.topics || [])}</div>` +
        `<div class="ins-chart-row">${chartFocusHours()}${chartSubjects(tasks)}</div>` +
        `<div class="ins-chart-row" style="flex:none;min-height:0">${chartPace(s.pace)}${taskFlow(tasks, todayKey, store.now())}</div>`;
      if (html !== lastGrid) { lastGrid = html; gridEl.innerHTML = html; }
    }

    renderTodayWidget(metrics, todayKey);
  }

  store.subscribe(render);
  render();
  return { render };
}
