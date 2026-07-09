// Ansichts-Navigation (Sidebar). Startet IMMER auf "Heute" (Startseite = heutiger Tag).
export function initNav({ store }) {
  const el = (id) => document.getElementById(id);
  const views = { today: el("viewToday"), week: el("viewWeek"), exam: el("viewExam") };
  const navBtns = { today: el("navToday"), week: el("navWeek"), exam: el("navExam") };
  let current = "today";

  function show(view) {
    if (!views[view]) return;
    current = view;
    for (const [k, v] of Object.entries(views)) if (v) v.hidden = k !== view;
    for (const [k, b] of Object.entries(navBtns)) if (b) b.classList.toggle("is-active", k === view);
    store.emit(); // sichtbar gewordene Ansicht frisch rendern lassen
  }

  for (const [k, b] of Object.entries(navBtns)) b?.addEventListener("click", () => show(k));

  // Mini-Timer klicken → zur Heute-/Timer-Ansicht (außer auf die Steuer-Buttons).
  const mini = el("miniTimer");
  mini?.addEventListener("click", (e) => { if (!e.target.closest(".mini-btn")) show("today"); });
  mini?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show("today"); }
  });

  show("today");
  return { show, getCurrent: () => current };
}
