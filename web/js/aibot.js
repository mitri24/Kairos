// KI-Lernbuddy: seitliches Chat-Panel, das sich dem Lernprofil anpasst
// (visuell → Diagramme/Tabellen, Schreibtyp → Merksätze zum Abschreiben, ADHS →
// kurze Schritte …). Die Anpassung passiert server-seitig (server/ai.js baut den
// Systemprompt aus Profil + Prefs); hier: UI, Provider-Setup, Kontext-Chip.
import { escapeHtml as esc } from "/js/util.js";
import { icon } from "/js/icons.js";
import { getLang } from "/js/i18n.js";
import { showToast } from "/js/toast.js";

const TXT = {
  de: {
    fab: "KI-Buddy",
    title: "KI-Buddy",
    settings: "Anbieter einstellen",
    close: "Schließen",
    inputPh: "Frag mich zum Stoff … (Enter sendet, Shift+Enter = neue Zeile)",
    send: "Senden",
    thinking: "denkt nach …",
    contextTopic: (t) => `Kontext: ${t}`,
    clear: "Verlauf leeren",
    hello: "Hey! Ich bin dein Lern-Buddy. Frag mich zum Stoff, lass dir etwas erklären oder ein Thema abfragen — ich passe mich deinem Lernprofil an.",
    setupTitle: "KI einrichten",
    setupConsent: "KI aktivieren (Einwilligung: Profil & Fragen werden an den gewählten Anbieter geschickt)",
    setupIntro: "Wähle einen Anbieter. Kostenlos & privat: Ollama läuft komplett lokal auf deinem Rechner.",
    providers: {
      ollama: { name: "Ollama (lokal, kostenlos)", hint: "ollama.com installieren, dann z. B. „ollama pull llama3.2“. Läuft offline, Daten bleiben bei dir." },
      openai: { name: "OpenAI-kompatibel", hint: "Funktioniert mit Groq (kostenloses Kontingent), OpenRouter (Gratis-Modelle), LM Studio (lokal) u. v. m. — Basis-URL + Key eintragen." },
      anthropic: { name: "Anthropic Claude", hint: "API-Key von console.anthropic.com. Sehr gute Erklärqualität." },
    },
    baseUrl: "Basis-URL",
    model: "Modell",
    apiKey: "API-Key",
    keySet: "gespeichert — leer lassen zum Behalten",
    save: "Speichern",
    saved: "KI-Einstellungen gespeichert",
    back: "zurück zum Chat",
  },
  en: {
    fab: "AI buddy",
    title: "AI buddy",
    settings: "Configure provider",
    close: "Close",
    inputPh: "Ask about your material … (Enter sends, Shift+Enter = new line)",
    send: "Send",
    thinking: "thinking …",
    contextTopic: (t) => `Context: ${t}`,
    clear: "Clear history",
    hello: "Hey! I’m your study buddy. Ask about your material, get explanations or quiz yourself — I adapt to your learning profile.",
    setupTitle: "Set up AI",
    setupConsent: "Enable AI (consent: profile & questions are sent to the chosen provider)",
    setupIntro: "Pick a provider. Free & private: Ollama runs entirely on your machine.",
    providers: {
      ollama: { name: "Ollama (local, free)", hint: "Install from ollama.com, then e.g. “ollama pull llama3.2”. Runs offline, data stays with you." },
      openai: { name: "OpenAI-compatible", hint: "Works with Groq (free tier), OpenRouter (free models), LM Studio (local) and more — enter base URL + key." },
      anthropic: { name: "Anthropic Claude", hint: "API key from console.anthropic.com. Excellent explanations." },
    },
    baseUrl: "Base URL",
    model: "Model",
    apiKey: "API key",
    keySet: "saved — leave empty to keep",
    save: "Save",
    saved: "AI settings saved",
    back: "back to chat",
  },
};

const LS_CHAT = "kairos_ai_chat";

// Mini-Markdown (sicher): erst escapen, dann **fett**, `code`, ``` Blöcke, Listen.
function renderMd(text) {
  let s = esc(text);
  s = s.replace(/```([\s\S]*?)```/g, (_, code) => `<pre class="ai-code">${code.replace(/^\n|\n$/g, "")}</pre>`);
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  s = s.replace(/^[-•] (.*)$/gm, "<li>$1</li>");
  s = s.replace(/(<li>[\s\S]*?<\/li>)(\n(?=<li>))?/g, "$1");
  s = s.replace(/(?:^|\n)((?:<li>.*<\/li>)+)/g, (m, lis) => `\n<ul>${lis}</ul>`);
  s = s.replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");
  return `<p>${s}</p>`;
}

export function initAibot({ store, api }) {
  const t = () => TXT[getLang()] || TXT.de;
  let open = false;
  let mode = "chat";           // chat | setup
  let config = null;           // {provider, baseUrl, model, hasKey, ready}
  let busy = false;
  let messages;
  try { messages = JSON.parse(localStorage.getItem(LS_CHAT) || "[]"); } catch { messages = []; }
  const saveChat = () => {
    try { localStorage.setItem(LS_CHAT, JSON.stringify(messages.slice(-30))); } catch { /* privat */ }
  };

  const wrap = document.createElement("div");
  wrap.className = "aibot-wrap";
  document.body.appendChild(wrap);

  function currentContext() {
    const s = store.state;
    const topic = (s.topics || []).find((x) => x.id === s.ui?.selectedTopicId);
    const exam = (s.exams || []).find((x) => x.id === s.settings?.activeExamId && !x.archived);
    return {
      topic: topic?.text || null,
      exam: exam?.name || null,
    };
  }

  function needsSetup() {
    return !store.state.profile?.aiEnabled || !config || config.provider === "none";
  }

  function render() {
    const s = store.state;
    const x = t();
    const ctx = currentContext();
    wrap.innerHTML = `
      <button class="aibot-fab" id="aiFab" type="button" title="${esc(x.fab)}" aria-label="${esc(x.fab)}">${icon("sparkle", { size: 22 })}</button>
      <aside class="aibot" id="aiPanel" ${open ? "" : "hidden"} aria-label="${esc(x.title)}">
        <div class="aibot__head">
          <span class="aibot__title">${icon("sparkle", { size: 18 })}${esc(x.title)}</span>
          <div class="aibot__head-actions">
            <button class="aibot__hbtn" id="aiClear" title="${esc(x.clear)}">${icon("trash")}</button>
            <button class="aibot__hbtn" id="aiSettings" title="${esc(x.settings)}">${icon("settings")}</button>
            <button class="aibot__hbtn" id="aiClose" title="${esc(x.close)}">${icon("close")}</button>
          </div>
        </div>
        ${mode === "setup" || needsSetup() ? renderSetup(s, x) : renderChat(s, x, ctx)}
      </aside>`;
    if (open && mode === "chat" && !needsSetup()) {
      const list = wrap.querySelector("#aiMsgs");
      if (list) list.scrollTop = list.scrollHeight;
    }
  }

  function renderChat(s, x, ctx) {
    return `
      <div class="aibot__msgs" id="aiMsgs">
        ${messages.length ? "" : `<div class="ai-msg ai-msg--bot"><div class="ai-msg__body">${renderMd(x.hello)}</div></div>`}
        ${messages.map((m) => `
          <div class="ai-msg ai-msg--${m.role === "user" ? "user" : "bot"}">
            <div class="ai-msg__body">${m.role === "user" ? `<p>${esc(m.content)}</p>` : renderMd(m.content)}</div>
          </div>`).join("")}
        ${busy ? `<div class="ai-msg ai-msg--bot"><div class="ai-msg__body ai-msg__body--busy">${esc(x.thinking)}</div></div>` : ""}
      </div>
      ${ctx.topic || ctx.exam ? `<div class="aibot__ctx">${icon("paperclip")} ${esc(x.contextTopic(ctx.topic || ctx.exam))}</div>` : ""}
      <div class="aibot__inputrow">
        <textarea id="aiInput" class="aibot__input" rows="1" placeholder="${esc(x.inputPh)}"></textarea>
        <button class="aibot__send" id="aiSend" ${busy ? "disabled" : ""} aria-label="${esc(x.send)}">
          ${icon("arrowRight", { size: 17, stroke: 2.1 })}
        </button>
      </div>`;
  }

  function renderSetup(s, x) {
    const cfg = config || { provider: "none", baseUrl: "", model: "", hasKey: false };
    const consent = !!s.profile?.aiEnabled;
    const p = cfg.provider === "none" ? "ollama" : cfg.provider;
    const needsKey = p !== "ollama";
    return `
      <div class="aibot__setup">
        <div class="aibot__setup-title">${esc(x.setupTitle)}</div>
        <label class="aibot__consent">
          <input type="checkbox" id="aiConsent" ${consent ? "checked" : ""} />
          <span>${esc(x.setupConsent)}</span>
        </label>
        <p class="aibot__setup-intro">${esc(x.setupIntro)}</p>
        <div class="aibot__providers">
          ${["ollama", "openai", "anthropic"].map((k) => `
            <label class="aibot__provider${p === k ? " is-active" : ""}">
              <input type="radio" name="aiProvider" value="${k}" ${p === k ? "checked" : ""} />
              <span class="aibot__provider-name">${esc(x.providers[k].name)}</span>
              <span class="aibot__provider-hint">${esc(x.providers[k].hint)}</span>
            </label>`).join("")}
        </div>
        <div class="aibot__fields">
          <label>${esc(x.baseUrl)}<input type="text" id="aiBaseUrl" class="text-input" value="${esc(cfg.baseUrl || "")}" placeholder="${p === "ollama" ? "http://127.0.0.1:11434" : p === "anthropic" ? "https://api.anthropic.com" : "https://api.groq.com/openai/v1"}" /></label>
          <label>${esc(x.model)}<input type="text" id="aiModel" class="text-input" value="${esc(cfg.model || "")}" placeholder="${p === "ollama" ? "llama3.2" : p === "anthropic" ? "claude-opus-5" : "llama-3.3-70b-versatile"}" /></label>
          <label ${needsKey ? "" : "hidden"}>${esc(x.apiKey)}<input type="password" id="aiKey" class="text-input" placeholder="${cfg.hasKey ? esc(x.keySet) : "sk-…"}" autocomplete="off" /></label>
        </div>
        <div class="aibot__setup-foot">
          <button class="btn btn--ghost btn--sm" id="aiBack" ${cfg.ready && consent ? "" : "hidden"}>${icon("arrowLeft", { size: 13 })}${esc(x.back)}</button>
          <button class="btn btn--primary" id="aiSave">${esc(x.save)}</button>
        </div>
      </div>`;
  }

  async function loadConfig() {
    try { config = await api.ai.getConfig(); } catch (e) { console.warn("[aibot]", e.message); }
    render();
  }

  async function send() {
    const input = wrap.querySelector("#aiInput");
    const text = input?.value.trim();
    if (!text || busy) return;
    messages.push({ role: "user", content: text });
    saveChat();
    busy = true;
    render();
    try {
      const res = await api.ai.chat({
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        context: currentContext(),
        lang: getLang(),
      });
      messages.push({ role: "assistant", content: res.reply });
      saveChat();
    } catch (e) {
      // Reiner Text: wird escaped gerendert, gespeichert und wieder mitgesendet —
      // hier darf kein Icon-Markup hinein.
      messages.push({ role: "assistant", content: `${e.message}` });
    }
    busy = false;
    render();
    wrap.querySelector("#aiInput")?.focus();
  }

  wrap.addEventListener("click", async (e) => {
    if (e.target.closest("#aiFab")) {
      open = !open;
      if (open && !config) await loadConfig();
      mode = needsSetup() ? "setup" : "chat";
      render();
      if (open && mode === "chat") wrap.querySelector("#aiInput")?.focus();
      return;
    }
    if (e.target.closest("#aiClose")) { open = false; render(); return; }
    if (e.target.closest("#aiSettings")) { mode = "setup"; render(); return; }
    if (e.target.closest("#aiBack")) { mode = "chat"; render(); return; }
    if (e.target.closest("#aiClear")) { messages = []; saveChat(); render(); return; }
    if (e.target.closest("#aiSend")) { send(); return; }
    if (e.target.closest("#aiSave")) {
      const x = t();
      const provider = wrap.querySelector('input[name="aiProvider"]:checked')?.value || "ollama";
      const baseUrl = wrap.querySelector("#aiBaseUrl")?.value.trim();
      const model = wrap.querySelector("#aiModel")?.value.trim();
      const key = wrap.querySelector("#aiKey")?.value;
      const consent = wrap.querySelector("#aiConsent")?.checked;
      try {
        if (consent !== undefined && consent !== !!store.state.profile?.aiEnabled) {
          store.applySnapshot(await api.profile.save({ aiEnabled: !!consent }));
        }
        const patch = { provider, baseUrl: baseUrl || null, model: model || null };
        if (key) patch.apiKey = key;   // leer = behalten
        config = await api.ai.saveConfig(patch);
        showToast({ type: "success", title: x.saved });
        mode = needsSetup() ? "setup" : "chat";
      } catch (err) {
        showToast({ type: "error", title: err.message });
      }
      render();
    }
  });
  wrap.addEventListener("change", (e) => {
    if (e.target.name === "aiProvider") render();
  });
  wrap.addEventListener("keydown", (e) => {
    if (e.target.id === "aiInput" && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  // Kontext-Chip aktuell halten, ohne Tipptext zu verlieren: nur neu rendern,
  // wenn Panel zu ist oder sich nichts im Eingabefeld befindet.
  store.subscribe(() => {
    if (!open) return;
    const input = wrap.querySelector("#aiInput");
    if (!input || !input.value) render();
  });

  render();
  return {};
}
