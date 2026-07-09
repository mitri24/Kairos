// Headless-Verifikation der PWA via Chrome DevTools Protocol (zero-dep, Node 22 WebSocket).
// Startet Chrome headless, lädt die Seite, sammelt Konsolenfehler/Exceptions und liest das DOM.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL_TO_TEST = process.env.VERIFY_URL || "http://localhost:4321";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9222;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdpJson(path) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`);
  return res.json();
}

// Wertet einen JS-Ausdruck in der Seite aus und gibt den (String-)Wert zurück.
async function evalJson(send, expression) {
  const r = await send("Runtime.evaluate", { expression: `String(${expression})`, returnByValue: true });
  return r?.result?.value ?? "";
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const events = [];
    ws.addEventListener("open", () => resolve({ send, events, ws }));
    ws.addEventListener("error", (e) => reject(new Error("WS error")));
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve } = pending.get(msg.id);
        pending.delete(msg.id);
        resolve(msg.result);
      } else if (msg.method) {
        events.push(msg);
      }
    });
    function send(method, params = {}) {
      return new Promise((resolve) => {
        const mid = ++id;
        pending.set(mid, { resolve });
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    }
  });
}

async function main() {
  const userDir = mkdtempSync(join(tmpdir(), "lernuhr-verify-"));
  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDir}`,
    "--window-size=1440,1600", "--hide-scrollbars", "about:blank",
  ], { stdio: "ignore" });

  const errors = [];
  const warnings = [];
  try {
    // Auf DevTools-Endpoint warten
    let target = null;
    for (let i = 0; i < 40; i++) {
      try {
        const list = await cdpJson("/json");
        target = list.find((t) => t.type === "page");
        if (target?.webSocketDebuggerUrl) break;
      } catch { /* noch nicht bereit */ }
      await sleep(250);
    }
    if (!target) throw new Error("Kein Chrome-DevTools-Target gefunden");

    const { send, events } = await connect(target.webSocketDebuggerUrl);
    await send("Runtime.enable");
    await send("Log.enable");
    await send("Page.enable");
    await send("Network.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1500, deviceScaleFactor: 2, mobile: false });
    await send("Page.navigate", { url: URL_TO_TEST });

    // Warten bis geladen + Module + erster Reconcile
    await sleep(5000);

    // DOM-Zustand lesen
    const expr = `JSON.stringify({
      wallTime: document.getElementById('wallTime')?.textContent,
      digital: document.getElementById('digitalTime')?.textContent,
      timeStr: document.getElementById('timeStr')?.textContent,
      mode: document.getElementById('modeLabel')?.textContent,
      toggle: document.getElementById('toggleBtn')?.textContent,
      tasksOpen: document.getElementById('taskListOpen')?.children.length,
      tasksDone: document.getElementById('taskListDone')?.children.length,
      taskCount: document.getElementById('taskCount')?.textContent,
      nextHidden: document.getElementById('nextTaskCard')?.hidden,
      nextText: document.getElementById('nextText')?.textContent,
      ctTitle: document.getElementById('ctTitle')?.textContent,
      ctClass: document.getElementById('currentTaskCard')?.className,
      examName: document.getElementById('examName')?.value,
      examDays: document.getElementById('examDaysNum')?.textContent,
      examHMS: document.getElementById('examHMS')?.textContent,
      examChips: document.getElementById('examChips')?.children.length,
      topics: document.getElementById('topicList')?.children.length,
      topicCount: document.getElementById('topicCount')?.textContent,
      timeline: document.getElementById('timeline')?.children.length,
      finish: document.getElementById('finishLabel')?.textContent,
      today: document.getElementById('todayDoneLabel')?.textContent,
      progressW: document.getElementById('todayProgressBar')?.style.width,
      dialOffset: document.getElementById('dialProgress')?.style.strokeDashoffset,
      secHand: document.getElementById('secHand')?.getAttribute('transform'),
      tabFocusActive: document.getElementById('tabFocus')?.classList.contains('is-active'),
      swController: !!navigator.serviceWorker?.controller,
      navTodayActive: document.getElementById('navToday')?.classList.contains('is-active'),
      viewTodayVisible: !document.getElementById('viewToday')?.hidden,
      viewWeekHidden: document.getElementById('viewWeek')?.hidden,
      bodyOverflow: getComputedStyle(document.body).overflow,
      pageFits: document.documentElement.scrollHeight <= window.innerHeight,
      scrollH: document.documentElement.scrollHeight,
      innerH: window.innerHeight,
      miniTime: document.getElementById('miniTime')?.textContent,
    })`;
    const res = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
    const dom = JSON.parse(res.result.value);

    console.log("=== DOM STATE ===");
    console.log(JSON.stringify(dom, null, 1));

    // ── Interaktions-Tests (Schreibpfade UI → API → Re-Render) ──
    const interact = {};
    // 1) Timer pausieren via Toggle
    await send("Runtime.evaluate", { expression: "document.getElementById('toggleBtn').click()" });
    await sleep(1200);
    interact.toggleAfterPause = (await evalJson(send, "document.getElementById('toggleBtn').textContent")).trim();
    interact.modeAfterPause = (await evalJson(send, "document.getElementById('modeLabel').textContent")).trim();
    // 2) Thema per Eingabe + Button hinzufügen
    await send("Runtime.evaluate", { expression:
      "(()=>{const i=document.getElementById('topicInput');i.value='Proteinbiosynthese';document.getElementById('topicAddBtn').click();})()" });
    await sleep(1200);
    interact.topicsAfterAdd = await evalJson(send, "document.getElementById('topicList').children.length");
    interact.topicCountAfterAdd = (await evalJson(send, "document.getElementById('topicCount').textContent")).trim();
    // 3) Erstes Thema abhaken (Checkbox/Toggle) — irgendein klickbares Element in erster Zeile
    await send("Runtime.evaluate", { expression:
      "(()=>{const row=document.querySelector('#topicList > *');const c=row&&(row.querySelector('input[type=checkbox]')||row.querySelector('button')||row);c&&c.click();})()" });
    await sleep(1200);
    interact.topicCountAfterToggle = (await evalJson(send, "document.getElementById('topicCount').textContent")).trim();
    // 4) Aufgabe aufklappen (Fix #1) → Detail muss erscheinen
    await send("Runtime.evaluate", { expression:
      "document.querySelector('#taskListOpen [data-act=\\\"expand\\\"]')?.click()" });
    await sleep(900);
    interact.detailVisibleAfterExpand = (await evalJson(send, "!!document.querySelector('#taskListOpen .task__detail')"));
    // 5) Prio-Chip zyklieren (Fix #2) → Label muss sich ändern
    interact.prioBefore = (await evalJson(send, "document.querySelector('#taskListOpen [data-act=\\\"cycle-prio\\\"]')?.textContent")).trim();
    await send("Runtime.evaluate", { expression:
      "document.querySelector('#taskListOpen [data-act=\\\"cycle-prio\\\"]')?.click()" });
    await sleep(1200);
    interact.prioAfter = (await evalJson(send, "document.querySelector('#taskListOpen [data-act=\\\"cycle-prio\\\"]')?.textContent")).trim();
    // 6) Zur Wochen-Ansicht wechseln → 7 Spalten
    await send("Runtime.evaluate", { expression: "document.getElementById('navWeek').click()" });
    await sleep(700);
    interact.weekVisible = (await evalJson(send, "!document.getElementById('viewWeek').hidden"));
    interact.weekColumns = (await evalJson(send, "document.getElementById('weekGrid').children.length"));
    interact.weekHasToday = (await evalJson(send, "!!document.querySelector('#weekGrid .week-day.is-today')"));
    // 7) Aufgabe in eine Tages-Spalte planen
    await send("Runtime.evaluate", { expression:
      "(()=>{const i=document.querySelector('#weekGrid .wk-add');if(i){i.value='Woche-Testaufgabe';i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));}})()" });
    await sleep(1200);
    interact.weekTaskAdded = (await evalJson(send, "!!Array.from(document.querySelectorAll('#weekGrid .wk-text')).find(e=>e.textContent.includes('Woche-Testaufgabe'))"));
    // 8) Zurück auf Heute
    await send("Runtime.evaluate", { expression: "document.getElementById('navToday').click()" });
    await sleep(400);
    interact.backToToday = (await evalJson(send, "!document.getElementById('viewToday').hidden"));

    console.log("\n=== INTERACTION TESTS ===");
    console.log(JSON.stringify(interact, null, 1));

    // Alle Konsolen-/Exception-Events EINMAL auswerten (Laden + Interaktion)
    for (const ev of events) {
      if (ev.method === "Runtime.exceptionThrown") {
        const d = ev.params.exceptionDetails;
        errors.push("EXCEPTION: " + (d.exception?.description || d.text));
      } else if (ev.method === "Runtime.consoleAPICalled") {
        const text = (ev.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(" ");
        if (ev.params.type === "error") errors.push("console.error: " + text);
        else if (ev.params.type === "warning") warnings.push("console.warn: " + text);
      } else if (ev.method === "Log.entryAdded" && ev.params.entry.level === "error") {
        errors.push(`log(${ev.params.entry.source}): ${ev.params.entry.text}`);
      }
    }
    interact.togglePaused = interact.toggleAfterPause?.includes("Resume");
    console.log("\n=== CONSOLE ERRORS (" + errors.length + ") ===");
    errors.forEach((e) => console.log("  ✗ " + e));
    console.log("=== WARNINGS (" + warnings.length + ") ===");
    warnings.slice(0, 8).forEach((w) => console.log("  ! " + w));

    // Screenshot für visuelle Bestätigung
    try {
      const shotPath = process.env.SHOT_PATH || join(tmpdir(), "lernuhr-shot.png");
      const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, fromSurface: true });
      if (shot?.data) { writeFileSync(shotPath, Buffer.from(shot.data, "base64")); console.log("\nScreenshot: " + shotPath); }
    } catch (e) { console.log("Screenshot fehlgeschlagen:", e.message); }

    const ok = errors.length === 0 && dom.wallTime && dom.wallTime !== "--:--:--";
    console.log("\n=== RESULT: " + (ok ? "PASS ✓" : "FAIL ✗") + " ===");
    process.exitCode = ok ? 0 : 1;
  } finally {
    chrome.kill("SIGKILL");
  }
}

main().catch((e) => { console.error("VERIFY ERROR:", e.message); process.exitCode = 1; });
