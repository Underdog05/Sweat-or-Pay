import { CONFIG } from "./config.js";

const PLAYERS = CONFIG.players;
const GOAL_S = CONFIG.goals.situps;
const GOAL_P = CONFIG.goals.pushups;
const PENALTY = CONFIG.penalty;
const WHO_KEY = "sweatOrPayWho_v2";
const FB_VERSION = "10.14.1";
const MAX_REPS = 2000;
const configured = !!(CONFIG.firebase && CONFIG.firebase.apiKey && !CONFIG.firebase.apiKey.startsWith("HIER"));

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const playerById = (id) => PLAYERS.find((p) => p.id === id);
const pad2 = (n) => String(n).padStart(2, "0");
const fmtYmd = (d) => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
const todayStr = () => fmtYmd(new Date());
const addDays = (s, delta) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + delta); return fmtYmd(d); };

function isoWeekKey(s) {
  const d = new Date(s + "T00:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3);
  const ft = new Date(d.getFullYear(), 0, 4);
  ft.setDate(ft.getDate() - ((ft.getDay() + 6) % 7) + 3);
  return d.getFullYear() + "-W" + pad2(1 + Math.round((d - ft) / (7 * 86400000)));
}

function formatDate(s) {
  try {
    return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(s + "T00:00:00"));
  } catch (e) { return s; }
}

function cleanReps(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(MAX_REPS, Math.max(0, n)) : 0;
}

/* ---------- data layer ---------- */

function demoStore() {
  const KEY = "sweatOrPayDemoEntries_v1";
  const listeners = new Set();
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const emit = () => { const all = Object.entries(read()).map(([id, d]) => ({ id, ...d })); listeners.forEach((fn) => fn(all)); };
  return {
    demo: true,
    subscribe(next) { listeners.add(next); next(Object.entries(read()).map(([id, d]) => ({ id, ...d }))); return () => listeners.delete(next); },
    async save(id, data) {
      const all = read(); all[id] = data;
      try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) {}
      emit();
    },
  };
}

async function firebaseStore() {
  const base = "https://www.gstatic.com/firebasejs/" + FB_VERSION + "/";
  const [{ initializeApp }, fs] = await Promise.all([import(base + "firebase-app.js"), import(base + "firebase-firestore.js")]);
  const db = fs.getFirestore(initializeApp(CONFIG.firebase));
  return {
    demo: false,
    subscribe(next, onError) {
      const q = fs.query(fs.collection(db, "entries"), fs.orderBy("date", "desc"), fs.limit(1000));
      return fs.onSnapshot(q, (snap) => next(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
    },
    save(id, data) { return fs.setDoc(fs.doc(db, "entries", id), data); },
  };
}

/* ---------- state ---------- */

let who = null;
try { who = localStorage.getItem(WHO_KEY); } catch (e) {}
if (!playerById(who)) who = null;

let entries = [];
let index = new Map();
let store = null;
let started = false;
let formInitialized = false;
let selectedDate = todayStr();
const refs = {};

const gate = $("gate"), main = $("main");
const dateInput = $("dateInput"), situpsInput = $("situpsInput"), pushupsInput = $("pushupsInput");
const situpsBar = $("situpsBar"), pushupsBar = $("pushupsBar");
const skipInput = $("skipInput"), skipNote = $("skipNote");
const saveBtn = $("saveBtn"), saveFeedback = $("saveFeedback");

function setEntries(raw) {
  entries = [];
  index = new Map();
  raw.forEach((r) => {
    if (!playerById(r.who) || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return;
    const e = { who: r.who, date: r.date, situps: cleanReps(r.situps), pushups: cleanReps(r.pushups), skipped: r.skipped === true };
    entries.push(e);
    index.set(e.date + "|" + e.who, e);
  });
}

const entryFor = (w, date) => index.get(date + "|" + w) || null;

function statusFor(w, date) {
  const e = entryFor(w, date);
  if (!e) return { label: "Offen", cls: "pending" };
  if (e.skipped) return { label: "Skip-Tag", cls: "skip" };
  if (e.situps >= GOAL_S && e.pushups >= GOAL_P) return { label: "Geschafft", cls: "success" };
  return { label: "Verloren · " + PENALTY + "€", cls: "danger" };
}

/* ---------- build static UI ---------- */

function buildBoards() {
  $("gateKicker").textContent = GOAL_S + " Sit-ups · " + GOAL_P + " Liegestütze · jeden Tag";
  $("heroGoal").textContent = "Ziel: " + GOAL_S + " / " + GOAL_P;
  $("rules").innerHTML = "";
  const strong = el("strong", "", "Regeln:");
  $("rules").append(strong, " jeden Tag " + GOAL_S + " Sit-ups & " + GOAL_P + " Liegestütze. Jede:r hat einen Skip-Tag pro Woche. An allen anderen Tagen: wer das Ziel verpasst, zahlt " + PENALTY + " € — egal aus welchem Grund.");

  const head = el("div", "hrow head");
  head.append(el("div", "", ""));
  PLAYERS.forEach((p) => head.append(el("div", "", p.name)));
  $("historyGrid").style.setProperty("--n", PLAYERS.length);
  $("historyGrid").append(head);
  refs.historyBody = el("div", "");
  $("historyGrid").append(refs.historyBody);

  PLAYERS.forEach((p) => {
    const r = (refs[p.id] = {});

    const gb = el("button", "gate-btn", p.name);
    gb.type = "button";
    gb.addEventListener("click", () => setWho(p.id));
    $("gateButtons").append(gb);

    const card = el("div", "statusCard");
    r.pill = el("span", "pill pending", "Offen");
    r.nums = el("div", "nums num", "–");
    card.append(el("div", "name", p.name + " · heute"), r.pill, r.nums);
    $("statusRow").append(card);

    const dc = el("div", "totalsCol");
    r.debt = el("div", "totalsNum debtNum num", "0 €");
    r.debtDays = el("div", "totalsLabel", "0 verlorene Tage");
    dc.append(el("div", "totalsName", p.name + " schuldet"), r.debt, r.debtDays);
    $("debtRow").append(dc);

    const tc = el("div", "totalsCol");
    r.totSit = el("div", "totalsNum num", "0");
    r.totPush = el("div", "totalsNum num", "0");
    tc.append(el("div", "totalsName", p.name), r.totSit, el("div", "totalsLabel", "Sit-ups"), r.totPush, el("div", "totalsLabel", "Liegestütze"));
    $("totalsRow").append(tc);
  });
}

/* ---------- render ---------- */

function updateBars() {
  const s = cleanReps(situpsInput.value), p = cleanReps(pushupsInput.value);
  situpsBar.style.width = Math.min(100, (s / GOAL_S) * 100) + "%";
  situpsBar.classList.toggle("done", s >= GOAL_S);
  pushupsBar.style.width = Math.min(100, (p / GOAL_P) * 100) + "%";
  pushupsBar.classList.toggle("done", p >= GOAL_P);
}

function loadFormForDate() {
  dateInput.value = selectedDate;
  const mine = entryFor(who, selectedDate);
  situpsInput.value = mine ? mine.situps : 0;
  pushupsInput.value = mine ? mine.pushups : 0;
  skipInput.checked = !!(mine && mine.skipped);
  saveFeedback.hidden = true;
  updateBars();
}

function updateSkipAvailability() {
  const wk = isoWeekKey(selectedDate);
  const used = entries.find((e) => e.who === who && e.skipped && e.date !== selectedDate && isoWeekKey(e.date) === wk);
  if (used) {
    skipInput.checked = false;
    skipInput.disabled = true;
    skipNote.hidden = false;
    skipNote.textContent = "Skip-Tag dieser Woche schon am " + formatDate(used.date) + " genutzt.";
  } else {
    skipInput.disabled = false;
    skipNote.hidden = true;
  }
}

function renderStatus() {
  const today = todayStr();
  PLAYERS.forEach((p) => {
    const s = statusFor(p.id, today), e = entryFor(p.id, today);
    refs[p.id].pill.textContent = s.label;
    refs[p.id].pill.className = "pill " + s.cls;
    refs[p.id].nums.textContent = e ? e.situps + " Sit-ups · " + e.pushups + " Liegestütze" : "Noch nichts eingetragen";
  });
}

function renderDebtAndTotals() {
  const lost = {}, sit = {}, push = {};
  PLAYERS.forEach((p) => { lost[p.id] = 0; sit[p.id] = 0; push[p.id] = 0; });
  entries.forEach((e) => {
    sit[e.who] += e.situps;
    push[e.who] += e.pushups;
    if (!e.skipped && (e.situps < GOAL_S || e.pushups < GOAL_P)) lost[e.who] += 1;
  });
  PLAYERS.forEach((p) => {
    const r = refs[p.id], owed = lost[p.id] * PENALTY;
    r.debt.textContent = owed + " €";
    r.debt.classList.toggle("zero", owed === 0);
    r.debtDays.textContent = lost[p.id] + (lost[p.id] === 1 ? " verlorener Tag" : " verlorene Tage");
    r.totSit.textContent = sit[p.id];
    r.totPush.textContent = push[p.id];
  });
}

function renderHistory() {
  const today = todayStr();
  const rows = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(today, -i);
    const row = el("div", "hrow");
    row.append(el("div", "hdate num", formatDate(d)));
    PLAYERS.forEach((p) => {
      const s = statusFor(p.id, d);
      const cell = el("div", "hcell");
      cell.append(el("span", "dot " + s.cls), s.label);
      row.append(cell);
    });
    rows.push(row);
  }
  refs.historyBody.replaceChildren(...rows);
}

function renderAll() {
  if (!formInitialized) { loadFormForDate(); formInitialized = true; }
  renderStatus();
  renderDebtAndTotals();
  renderHistory();
  updateSkipAvailability();
}

function showFeedback(text, isErr) {
  saveFeedback.hidden = false;
  saveFeedback.textContent = text;
  saveFeedback.className = "feedback " + (isErr ? "err" : "ok");
}

/* ---------- actions ---------- */

async function save() {
  if (!store) return;
  const date = dateInput.value || selectedDate;
  const data = {
    who,
    date,
    situps: cleanReps(situpsInput.value),
    pushups: cleanReps(pushupsInput.value),
    skipped: !!skipInput.checked,
    updatedAt: new Date().toISOString(),
  };
  saveBtn.disabled = true;
  saveFeedback.hidden = true;
  try {
    const slow = new Promise((resolve) => setTimeout(() => resolve("slow"), 8000));
    const res = await Promise.race([store.save(date + "_" + who, data), slow]);
    showFeedback(res === "slow" ? "Wird gespeichert, sobald du wieder online bist." : "Gespeichert ✓", false);
  } catch (err) {
    showFeedback("Speichern hat nicht geklappt. Prüfe die Verbindung und die Firestore-Regeln.", true);
  } finally {
    saveBtn.disabled = false;
  }
}

function setWho(id) {
  who = id;
  try { localStorage.setItem(WHO_KEY, id); } catch (e) {}
  gate.hidden = true;
  main.hidden = false;
  $("whoBadge").textContent = playerById(id).name;
  formInitialized = false;
  if (started) renderAll(); else start();
}

async function start() {
  started = true;
  $("whoBadge").textContent = playerById(who).name;
  dateInput.max = todayStr();
  $("demoBanner").hidden = configured;
  try {
    store = configured ? await firebaseStore() : demoStore();
  } catch (err) {
    $("connBanner").hidden = false;
    $("connBanner").textContent = "Verbindung zur Datenbank fehlgeschlagen. Bitte später erneut öffnen.";
    store = null;
    renderAll();
    return;
  }
  store.subscribe(
    (raw) => { setEntries(raw); $("connBanner").hidden = true; renderAll(); },
    () => { $("connBanner").hidden = false; $("connBanner").textContent = "Verbindung zu den Daten unterbrochen."; }
  );
}

/* ---------- wiring ---------- */

buildBoards();

$("switchWho").addEventListener("click", () => {
  who = null;
  try { localStorage.removeItem(WHO_KEY); } catch (e) {}
  main.hidden = true;
  gate.hidden = false;
});

dateInput.addEventListener("change", () => {
  selectedDate = dateInput.value || todayStr();
  loadFormForDate();
  updateSkipAvailability();
});

document.querySelectorAll(".stepper button").forEach((btn) => {
  btn.addEventListener("click", () => {
    const inp = btn.dataset.target === "situps" ? situpsInput : pushupsInput;
    inp.value = cleanReps(cleanReps(inp.value) + parseInt(btn.dataset.delta, 10));
    updateBars();
  });
});
situpsInput.addEventListener("input", updateBars);
pushupsInput.addEventListener("input", updateBars);
saveBtn.addEventListener("click", save);

if (who) { main.hidden = false; start(); } else { gate.hidden = false; }

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
