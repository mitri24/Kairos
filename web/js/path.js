// Lernroute: die Themen einer Prüfung als Serpentinen-Weg mit Stationen —
// sichtbar, wo du stehst („Du bist hier"), was sicher sitzt und was noch kommt.
//
// Lebt als TAB im Prüfungs-Workspace (nicht als eigene Ansicht): eine Route
// gehört immer zu genau einer Prüfung, also folgt sie der aktiven Prüfung aus
// der Seitenleiste. Klick auf eine Station wechselt in den Themen-Tab.
import { escapeHtml as esc, daysUntil } from "/js/util.js";
import { getLang } from "/js/i18n.js";
import { icon } from "/js/icons.js";
import { shareContent } from "/js/share.js";

const TXT = {
  de: {
    eyebrow: "Dein Weg",
    title: "Lernroute",
    sub: "Jedes Thema eine Station. Grün = sitzt, Bernstein = wackelig, leer = noch offen.",
    youAreHere: "Du bist hier",
    goal: (name) => name,
    daysLeft: (n) => n === 1 ? "noch 1 Tag" : `noch ${n} Tage`,
    progress: (a, b) => `${a} von ${b} Stationen geschafft`,
    empty: "Noch keine Themen — lege sie im Themen-Tab an, dann entsteht hier dein Weg.",
    emptyBtn: "Zu den Themen",
    share: "Route teilen",
    all: "Alle Themen",
    done: "geschafft",
    shaky: "wackelig",
    open: "offen",
  },
  en: {
    eyebrow: "Your way",
    title: "Learning path",
    sub: "Every topic is a station. Green = solid, amber = shaky, empty = still open.",
    youAreHere: "You are here",
    goal: (name) => name,
    daysLeft: (n) => n === 1 ? "1 day left" : `${n} days left`,
    progress: (a, b) => `${a} of ${b} stations done`,
    empty: "No topics yet — add them in the Topics tab and your path appears here.",
    emptyBtn: "Go to Topics",
    share: "Share route",
    all: "All topics",
    done: "done",
    shaky: "shaky",
    open: "open",
  },
};

const COLS = [110, 320, 530];   // x-Positionen (viewBox 640 breit)
const ROW_H = 118;
const TOP = 70;

export function initPath({ store, api }) {
  const root = document.getElementById("pathRoot");
  if (!root) return {};

  const T = () => TXT[getLang()] || TXT.de;
  async function act(fn) {
    try { store.applySnapshot(await fn()); } catch (e) { console.warn("[path]", e.message); }
  }

  function nodePos(i) {
    const row = Math.floor(i / COLS.length);
    const inRow = i % COLS.length;
    // Serpentine: jede zweite Reihe rückwärts.
    const x = COLS[row % 2 === 0 ? inRow : COLS.length - 1 - inRow];
    return { x, y: TOP + row * ROW_H };
  }

  function wrapLabel(text, max = 18) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length > max && cur) { lines.push(cur); cur = w; }
      else cur = (cur + " " + w).trim();
      if (lines.length === 2) break;
    }
    if (cur && lines.length < 2) lines.push(cur);
    else if (cur) lines[1] = lines[1].slice(0, max - 1) + "…";
    return lines.map((l) => (l.length > max ? l.slice(0, max - 1) + "…" : l));
  }

  // Aktive Prüfung — dieselbe Quelle wie der übrige Prüfungs-Workspace.
  function activeExamId(s) {
    const exams = (s.exams || []).filter((e) => !e.archived);
    return exams.find((e) => e.id === s.settings?.activeExamId)?.id ?? exams[0]?.id ?? null;
  }

  function render(s) {
    // Weder in versteckter Ansicht noch im inaktiven Tab rendern.
    if (root.closest(".view")?.hidden || root.closest(".exam-pane")?.hidden) return;
    const t = T();
    const exams = (s.exams || []).filter((e) => !e.archived);
    const currentExamId = activeExamId(s);
    const exam = exams.find((e) => e.id === currentExamId) || null;
    const topics = (s.topics || []).filter((x) => x.examId === currentExamId);

    const doneCount = topics.filter((x) => x.done || x.confidence === 3).length;
    const hereIdx = topics.findIndex((x) => !(x.done || x.confidence === 3));

    let svg = "";
    if (topics.length) {
      const n = topics.length;
      const goalPos = nodePos(n);
      const height = goalPos.y + 90;
      // Weg: geglättete Kurve durch alle Stationen + Ziel.
      const pts = [...topics.map((_, i) => nodePos(i)), goalPos];
      let d = `M ${pts[0].x} ${pts[0].y}`;
      for (let i = 1; i < pts.length; i++) {
        const p0 = pts[i - 1], p1 = pts[i];
        const my = (p0.y + p1.y) / 2;
        d += p0.y === p1.y
          ? ` L ${p1.x} ${p1.y}`
          : ` C ${p0.x} ${my}, ${p1.x} ${my}, ${p1.x} ${p1.y}`;
      }
      const nodes = topics.map((topic, i) => {
        const { x, y } = nodePos(i);
        const done = topic.done || topic.confidence === 3;
        const shaky = !done && topic.confidence === 1;
        const okay = !done && topic.confidence === 2;
        const here = i === hereIdx;
        const cls = done ? "is-done" : shaky ? "is-shaky" : okay ? "is-okay" : "";
        const label = wrapLabel(topic.text);
        return `
          <g class="path-node ${cls}${here ? " is-here" : ""}" data-topic="${topic.id}" transform="translate(${x} ${y})" tabindex="0" role="button" aria-label="${esc(topic.text)}">
            ${here ? `<circle class="path-node__pulse" r="34"></circle>` : ""}
            <circle class="path-node__circle" r="26"></circle>
            ${done
              // Innerhalb eines SVG kann kein <svg> aus icons.js stehen — daher der
              // Pfad des "check"-Icons direkt, auf den Stationsmittelpunkt gesetzt.
              ? `<g class="path-node__check" transform="translate(-13.8 -13.8) scale(1.15)" aria-hidden="true"><path d="m5 12.6 4.6 4.6L19 6.8"/></g>`
              : `<text class="path-node__mark" text-anchor="middle" dy="7">${i + 1}</text>`}
            ${label.map((l, li) => `<text class="path-node__label" text-anchor="middle" y="${44 + li * 15}">${esc(l)}</text>`).join("")}
            ${here ? `<g class="path-here"><rect x="-46" y="-58" rx="10" width="92" height="22"></rect><text text-anchor="middle" y="-43">${esc(t.youAreHere)}</text></g>` : ""}
          </g>`;
      }).join("");
      const days = exam?.date ? daysUntil(exam.date, store.now()) : null;
      // Zielflagge: Pfad des "flag"-Icons direkt im SVG (ein verschachteltes
      // <svg> aus icons.js hätte hier keine Position). Bounding-Box des Glyphs
      // ist (6, 3.8)–(17.5, 21), Mitte also (11.75, 12.4) — bei scale 1.5 um
      // (-17.6, -18.6) verschoben, damit die Flagge exakt auf dem Ziel sitzt.
      const goal = `
        <g class="path-goal" transform="translate(${goalPos.x} ${goalPos.y})">
          <circle class="path-goal__circle" r="30"></circle>
          <g class="path-goal__flag" transform="translate(-17.6 -18.6) scale(1.5)" aria-hidden="true"><path d="M6 21V3.8"/><path d="M6 5h11.5l-2.2 3.6L17.5 12H6"/></g>
          <text class="path-node__label path-goal__name" text-anchor="middle" y="50">${esc(exam ? exam.name : t.all)}</text>
          ${days != null ? `<text class="path-goal__days" text-anchor="middle" y="66">${esc(t.daysLeft(days))}</text>` : ""}
        </g>`;
      svg = `
        <svg class="path-svg" viewBox="0 0 640 ${height}" role="list">
          <path class="path-road" d="${d}"></path>
          <path class="path-road path-road--dash" d="${d}"></path>
          ${nodes}
          ${goal}
        </svg>`;
    }

    // Schlanker Kopf: die Prüfung steht schon über dem Tab — hier nur Legende,
    // Fortschritt und Teilen.
    root.innerHTML = `
      <div class="path-head">
        <p class="path-sub">${esc(t.sub)}</p>
        <div class="path-head__actions">
          ${topics.length ? `<span class="path-progress">${esc(t.progress(doneCount, topics.length))}</span>` : ""}
          ${exam ? `<button class="btn btn--ghost btn--sm" data-a="share">${icon("share")}${esc(t.share)}</button>` : ""}
        </div>
      </div>
      ${topics.length ? `<div class="card path-card">${svg}</div>` : `
        <div class="empty--box path-empty">
          <p>${esc(t.empty)}</p>
          <button class="btn btn--primary" data-a="topics">${esc(t.emptyBtn)}</button>
        </div>`}
    `;
  }

  root.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-exam]");
    if (chip) {
      examId = chip.dataset.exam === "none" ? null : Number(chip.dataset.exam);
      render(store.state);
      return;
    }
    const a = e.target.closest("[data-a]");
    if (a?.dataset.a === "share") {
      const exams = (store.state.exams || []).filter((x) => !x.archived);
      const id = examId !== undefined ? examId : (store.state.settings?.activeExamId ?? exams[0]?.id);
      if (id != null) shareContent(api, "exam", id);
      return;
    }
    if (a?.dataset.a === "exams") {
      document.dispatchEvent(new CustomEvent("navigate", { detail: { view: "exam" } }));
      return;
    }
    const node = e.target.closest("[data-topic]");
    if (node) {
      const topicId = Number(node.dataset.topic);
      const topic = (store.state.topics || []).find((x) => x.id === topicId);
      // In den Prüfungs-Workspace zu genau diesem Thema springen.
      if (topic?.examId != null && topic.examId !== store.state.settings?.activeExamId) {
        act(() => api.setSettings({ activeExamId: topic.examId }));
      }
      store.setUi({ selectedTopicId: topicId, examTab: "topics" });
      document.dispatchEvent(new CustomEvent("navigate", { detail: { view: "exam" } }));
    }
  });

  store.subscribe(render);
  render(store.state);
  return {};
}
