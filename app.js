import { CONFIG } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, sendPasswordResetEmail, connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator,
  doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const MAX_REPS = 2000;
const DEFAULTS = CONFIG.defaults;
const configured = !!(CONFIG.firebase && CONFIG.firebase.apiKey && !CONFIG.firebase.apiKey.startsWith("HIER"));

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const pad2 = (n) => String(n).padStart(2, "0");
const fmtYmd = (d) => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
const todayStr = () => fmtYmd(new Date());
const addDays = (s, delta) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + delta); return fmtYmd(d); };
const nowIso = () => new Date().toISOString();

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

function makeCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/* ---------- state ---------- */

const S = { user: null, name: "", isAdmin: false, memberships: [], pendingName: null, profileTried: false, view: null, g: null };
const subs = { profile: null, memberships: null };
let homeToken = 0;
let adminToken = 0;
let flashTimer = null;
let auth = null;
let db = null;

/* ---------- ui helpers ---------- */

function show(view) {
  ["viewAuth", "viewHome", "viewGroup", "viewAdmin"].forEach((v) => { $(v).hidden = v !== view; });
  $("topbar").hidden = view === "viewAuth";
  if (S.view !== view) window.scrollTo(0, 0);
  S.view = view;
}

function flash(text, kind) {
  const b = $("banner");
  b.textContent = text;
  b.className = "banner" + (kind ? " " + kind : "");
  b.hidden = false;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { b.hidden = true; }, 6000);
}

function setMsg(node, text, ok) {
  node.hidden = !text;
  node.textContent = text || "";
  node.className = "feedback " + (ok ? "ok" : "err");
}

function updateBadge() {
  $("whoBadge").textContent = S.name + (S.isAdmin ? " · Admin" : "");
}

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) { return false; }
}

async function deleteRefs(refs) {
  for (let i = 0; i < refs.length; i += 400) {
    const b = writeBatch(db);
    refs.slice(i, i + 400).forEach((r) => b.delete(r));
    await b.commit();
  }
}

/* ---------- auth ---------- */

const AUTH_ERRORS = {
  "auth/invalid-email": "Bitte gib eine gültige E-Mail-Adresse ein.",
  "auth/email-already-in-use": "Für diese E-Mail gibt es schon ein Konto. Melde dich an.",
  "auth/weak-password": "Das Passwort ist zu kurz (mindestens 6 Zeichen).",
  "auth/invalid-credential": "E-Mail oder Passwort stimmt nicht.",
  "auth/wrong-password": "E-Mail oder Passwort stimmt nicht.",
  "auth/user-not-found": "E-Mail oder Passwort stimmt nicht.",
  "auth/too-many-requests": "Zu viele Versuche. Bitte warte kurz und versuche es erneut.",
  "auth/network-request-failed": "Keine Verbindung. Prüfe dein Internet.",
};

let authMode = "login";
function setAuthMode(mode) {
  authMode = mode;
  $("tabLogin").classList.toggle("active", mode === "login");
  $("tabRegister").classList.toggle("active", mode === "register");
  $("nameField").hidden = mode !== "register";
  $("forgotBtn").hidden = mode !== "login";
  $("authSubmit").textContent = mode === "login" ? "Anmelden" : "Konto erstellen";
  $("authPass").autocomplete = mode === "login" ? "current-password" : "new-password";
  setMsg($("authMsg"), "");
}

async function submitAuth(e) {
  e.preventDefault();
  const msg = $("authMsg");
  const email = $("authEmail").value.trim();
  const pass = $("authPass").value;
  if (!email || !pass) return setMsg(msg, "Bitte E-Mail und Passwort eingeben.");
  let name = "";
  if (authMode === "register") {
    name = $("authName").value.trim();
    if (!name) return setMsg(msg, "Bitte gib deinen Namen ein.");
  }
  $("authSubmit").disabled = true;
  setMsg(msg, "");
  try {
    if (authMode === "register") {
      S.pendingName = name;
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await setDoc(doc(db, "users", cred.user.uid), { name, createdAt: nowIso() });
      S.name = name;
      updateBadge();
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
    }
  } catch (err) {
    S.pendingName = null;
    setMsg(msg, AUTH_ERRORS[err.code] || "Das hat nicht geklappt. Bitte versuche es nochmal.");
  } finally {
    $("authSubmit").disabled = false;
  }
}

async function forgotPassword() {
  const msg = $("authMsg");
  const email = $("authEmail").value.trim();
  if (!email) return setMsg(msg, "Gib oben deine E-Mail-Adresse ein, dann schicken wir dir einen Link.");
  try {
    await sendPasswordResetEmail(auth, email);
    setMsg(msg, "Falls ein Konto mit dieser E-Mail existiert, haben wir dir einen Link zum Zurücksetzen geschickt.", true);
  } catch (err) {
    setMsg(msg, AUTH_ERRORS[err.code] || "Das hat nicht geklappt. Bitte versuche es nochmal.");
  }
}

function onAuth(user) {
  S.user = user;
  if (subs.profile) subs.profile();
  if (subs.memberships) subs.memberships();
  subs.profile = subs.memberships = null;
  stopGroup();

  if (!user) {
    S.name = ""; S.isAdmin = false; S.memberships = []; S.pendingName = null; S.profileTried = false;
    $("authPass").value = "";
    show("viewAuth");
    return;
  }

  S.name = S.pendingName || user.displayName || (user.email || "").split("@")[0] || "Spieler";
  updateBadge();

  getDoc(doc(db, "admins", user.uid)).then((s) => s.exists(), () => false).then((isAdmin) => {
    if (S.user !== user) return;
    S.isAdmin = isAdmin;
    updateBadge();
    if (S.view === "viewHome") $("adminBtn").hidden = !isAdmin;
    if (location.hash === "#admin") route();
  });

  subs.profile = onSnapshot(doc(db, "users", user.uid), (snap) => {
    if (snap.exists()) {
      S.name = snap.data().name;
      updateBadge();
    } else if (!S.profileTried) {
      S.profileTried = true;
      setDoc(doc(db, "users", user.uid), { name: S.name, createdAt: nowIso() }).catch(() => {});
    }
  }, () => {});

  subs.memberships = onSnapshot(collection(db, "users", user.uid, "groups"), (snap) => {
    S.memberships = snap.docs.map((d) => d.id);
    if (S.view === "viewHome") renderHome();
  }, () => {});

  route();
}

/* ---------- routing ---------- */

function route() {
  if (!S.user) { show("viewAuth"); return; }
  const h = location.hash;
  if (h.startsWith("#g/")) {
    const id = h.slice(3);
    if (!S.g || S.g.id !== id) startGroup(id);
    show("viewGroup");
  } else if (h === "#admin" && S.isAdmin) {
    stopGroup();
    openAdmin();
  } else {
    stopGroup();
    openHome();
  }
}

/* ---------- home ---------- */

function openHome() {
  show("viewHome");
  $("adminBtn").hidden = !S.isAdmin;
  if (!$("createSitups").value) $("createSitups").value = DEFAULTS.situps;
  if (!$("createPushups").value) $("createPushups").value = DEFAULTS.pushups;
  if (!$("createPenalty").value) $("createPenalty").value = DEFAULTS.penalty;
  renderHome();
}

async function renderHome() {
  const token = ++homeToken;
  $("groupEmpty").hidden = S.memberships.length > 0;
  const rows = await Promise.all(S.memberships.map(async (id) => {
    try {
      const s = await getDoc(doc(db, "groups", id));
      return s.exists() ? { id, data: s.data() } : { id, stale: true };
    } catch (e) {
      return e.code === "permission-denied" ? { id, stale: true } : { id, offline: true };
    }
  }));
  if (token !== homeToken) return;
  const list = $("groupList");
  list.replaceChildren();
  rows.forEach((r) => {
    if (r.stale) {
      deleteDoc(doc(db, "users", S.user.uid, "groups", r.id)).catch(() => {});
      return;
    }
    const a = el("a", "listItem");
    a.href = "#g/" + r.id;
    const left = el("div");
    left.append(el("span", "", r.data ? r.data.name : "Gruppe (offline)"));
    if (r.data) left.append(el("small", "", r.data.situps + " Sit-ups · " + r.data.pushups + " Liegestütze · " + r.data.penalty + " € Strafe"));
    a.append(left);
    if (r.data && r.data.adminUid === S.user.uid) a.append(el("span", "badge", "Admin"));
    else a.append(el("span", "", "›"));
    list.append(a);
  });
}

async function joinGroup(e) {
  e.preventDefault();
  const msg = $("joinMsg");
  const code = $("joinCode").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 6) return setMsg(msg, "Der Code hat 6 Zeichen.");
  $("joinBtn").disabled = true;
  setMsg(msg, "");
  try {
    const c = await getDoc(doc(db, "groupCodes", code));
    if (!c.exists()) { setMsg(msg, "Diesen Code gibt es nicht."); return; }
    const gid = c.data().groupId;
    if (S.memberships.includes(gid)) { location.hash = "g/" + gid; return; }
    const now = nowIso();
    await setDoc(doc(db, "groups", gid, "members", S.user.uid), { name: S.name, code, joinedAt: now });
    await setDoc(doc(db, "users", S.user.uid, "groups", gid), { joinedAt: now });
    $("joinCode").value = "";
    location.hash = "g/" + gid;
  } catch (err) {
    setMsg(msg, err.code === "permission-denied"
      ? "Beitritt nicht möglich. Prüfe den Code oder frage nach einem neuen."
      : "Das hat nicht geklappt. Bitte versuche es nochmal.");
  } finally {
    $("joinBtn").disabled = false;
  }
}

function readSettings(prefix) {
  const name = $(prefix + "Name").value.trim();
  const situps = Number($(prefix + "Situps").value);
  const pushups = Number($(prefix + "Pushups").value);
  const penalty = Number($(prefix + "Penalty").value);
  let error = null;
  if (name.length < 2 || name.length > 40) error = "Der Gruppenname braucht 2 bis 40 Zeichen.";
  else if (!Number.isInteger(situps) || situps < 1 || situps > MAX_REPS) error = "Sit-ups: bitte eine ganze Zahl zwischen 1 und 2000.";
  else if (!Number.isInteger(pushups) || pushups < 1 || pushups > MAX_REPS) error = "Liegestütze: bitte eine ganze Zahl zwischen 1 und 2000.";
  else if (!Number.isInteger(penalty) || penalty < 0 || penalty > 1000) error = "Strafe: bitte eine ganze Zahl zwischen 0 und 1000.";
  return { error, name, situps, pushups, penalty };
}

async function createGroup(e) {
  e.preventDefault();
  const msg = $("createMsg");
  const v = readSettings("create");
  if (v.error) return setMsg(msg, v.error);
  $("createBtn").disabled = true;
  setMsg(msg, "");
  try {
    const uid = S.user.uid;
    const gid = doc(collection(db, "groups")).id;
    let code = makeCode();
    const now = nowIso();
    await setDoc(doc(db, "groups", gid), { name: v.name, code, adminUid: uid, situps: v.situps, pushups: v.pushups, penalty: v.penalty, createdAt: now });
    for (let i = 0; ; i++) {
      try {
        await setDoc(doc(db, "groupCodes", code), { groupId: gid });
        break;
      } catch (err) {
        if (i >= 5) throw err;
        code = makeCode();
        await updateDoc(doc(db, "groups", gid), { code });
      }
    }
    await setDoc(doc(db, "groups", gid, "members", uid), { name: S.name, code, joinedAt: now });
    await setDoc(doc(db, "users", uid, "groups", gid), { joinedAt: now });
    $("createName").value = "";
    $("createDetails").open = false;
    location.hash = "g/" + gid;
  } catch (err) {
    setMsg(msg, "Die Gruppe konnte nicht erstellt werden. Bitte versuche es nochmal.");
  } finally {
    $("createBtn").disabled = false;
  }
}

/* ---------- admin ---------- */

async function deleteGroupFully(gid, code) {
  const gref = doc(db, "groups", gid);
  const [ents, mems] = await Promise.all([getDocs(collection(gref, "entries")), getDocs(collection(gref, "members"))]);
  await deleteRefs(ents.docs.map((d) => d.ref));
  await deleteRefs(mems.docs.map((d) => doc(db, "users", d.id, "groups", gid)));
  await deleteRefs(mems.docs.map((d) => d.ref));
  try { await deleteDoc(doc(db, "groupCodes", code)); } catch (e) {}
  await deleteDoc(gref);
}

async function openAdmin() {
  show("viewAdmin");
  const token = ++adminToken;
  const list = $("adminList");
  list.replaceChildren();
  $("adminEmpty").hidden = true;
  let snap;
  try {
    snap = await getDocs(collection(db, "groups"));
  } catch (e) {
    flash("Die Gruppenliste konnte nicht geladen werden.", "err");
    return;
  }
  if (token !== adminToken) return;
  $("adminEmpty").hidden = snap.size > 0;
  snap.docs.forEach((d) => {
    const g = d.data();
    const row = el("div", "listItem");
    const a = el("a", "", "");
    a.href = "#g/" + d.id;
    a.style.cssText = "flex:1;color:inherit;text-decoration:none;";
    const title = el("span", "", g.name);
    const small = el("small", "", "Code " + g.code + " · " + g.situps + "/" + g.pushups + " · " + g.penalty + " €");
    a.append(title, small);
    const del = el("button", "secondary small", "Löschen");
    del.type = "button";
    del.addEventListener("click", async () => {
      if (!confirm("Gruppe \"" + g.name + "\" mit allen Einträgen endgültig löschen?")) return;
      del.disabled = true;
      try { await deleteGroupFully(d.id, g.code); flash("Gruppe gelöscht.", "ok"); openAdmin(); }
      catch (err) { del.disabled = false; flash("Löschen hat nicht geklappt.", "err"); }
    });
    row.append(a, del);
    list.append(row);
  });
}

/* ---------- group ---------- */

function stopGroup() {
  if (S.g) {
    S.g.stopped = true;
    S.g.unsubs.forEach((u) => u());
    S.g = null;
  }
  $("viewGroup").classList.add("loading");
}

function startGroup(id) {
  stopGroup();
  const G = {
    id, group: null, members: [], entries: [], index: new Map(),
    selectedDate: todayStr(), formInit: false, stopped: false, unsubs: [],
    loaded: { g: false, m: false, e: false },
  };
  S.g = G;
  show("viewGroup");
  $("groupName").textContent = "Lade …";
  $("roleBadge").hidden = true;
  $("adminTools").open = false;
  setMsg($("editMsg"), "");
  $("saveFeedback").hidden = true;
  setTab("today");

  const gref = doc(db, "groups", id);
  const fail = (err) => {
    if (G.stopped) return;
    if (err && err.code === "permission-denied") {
      flash("Du hast keinen Zugriff auf diese Gruppe (mehr).", "err");
      deleteDoc(doc(db, "users", S.user.uid, "groups", id)).catch(() => {});
      location.hash = "";
    } else {
      flash("Verbindung zu den Daten unterbrochen.", "err");
    }
  };

  G.unsubs.push(onSnapshot(gref, (snap) => {
    if (G.stopped) return;
    if (!snap.exists()) { flash("Diese Gruppe gibt es nicht mehr.", "err"); location.hash = ""; return; }
    G.group = snap.data(); G.loaded.g = true; renderGroup();
  }, fail));
  G.unsubs.push(onSnapshot(collection(gref, "members"), (snap) => {
    if (G.stopped) return;
    G.members = snap.docs.map((d) => ({ uid: d.id, name: String(d.data().name || "?") }));
    G.loaded.m = true; renderGroup();
  }, fail));
  G.unsubs.push(onSnapshot(collection(gref, "entries"), (snap) => {
    if (G.stopped) return;
    G.entries = [];
    G.index = new Map();
    snap.docs.forEach((d) => {
      const r = d.data();
      if (typeof r.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return;
      const e = { uid: String(r.uid), date: r.date, situps: cleanReps(r.situps), pushups: cleanReps(r.pushups), skipped: r.skipped === true };
      G.entries.push(e);
      G.index.set(e.date + "|" + e.uid, e);
    });
    G.loaded.e = true; renderGroup();
  }, fail));
}

const entryFor = (G, uid, date) => G.index.get(date + "|" + uid) || null;
const isMemberOf = (G) => G.members.some((m) => m.uid === S.user.uid);

function statusFor(G, uid, date) {
  const g = G.group;
  const e = entryFor(G, uid, date);
  if (!e) return { label: "Offen", cls: "pending" };
  if (e.skipped) return { label: "Skip-Tag", cls: "skip" };
  if (e.situps >= g.situps && e.pushups >= g.pushups) return { label: "Geschafft", cls: "success" };
  return { label: "Verloren · " + g.penalty + "€", cls: "danger" };
}

function updateBars() {
  const G = S.g;
  if (!G || !G.group) return;
  const s = cleanReps($("situpsInput").value), p = cleanReps($("pushupsInput").value);
  $("situpsBar").style.width = Math.min(100, (s / G.group.situps) * 100) + "%";
  $("situpsBar").classList.toggle("done", s >= G.group.situps);
  $("pushupsBar").style.width = Math.min(100, (p / G.group.pushups) * 100) + "%";
  $("pushupsBar").classList.toggle("done", p >= G.group.pushups);
  $("situpsCount").textContent = s + " / " + G.group.situps;
  $("pushupsCount").textContent = p + " / " + G.group.pushups;
}

const PANES = { today: "paneToday", rang: "paneRang", bilanz: "paneBilanz", verlauf: "paneVerlauf", gruppe: "paneGruppe" };

/* ---------- Ränge ---------- */

// Ränge richten sich nach der Zahl voller Tage (Tagesziel der Gruppe × Tage), für Sit-ups und Liegestütze getrennt.
const RANKS = [
  { name: "Rookie", days: 0 },
  { name: "Kämpfer", days: 5 },
  { name: "Athlet", days: 15 },
  { name: "Krieger", days: 30 },
  { name: "Veteran", days: 50 },
  { name: "Champion", days: 100 },
  { name: "Master", days: 200 },
  { name: "Grandmaster", days: 300 },
  { name: "Legende", days: 365 },
];
const HIGH_LEVEL = 7;
const nf = (n) => n.toLocaleString("de-DE");

function rankFor(total, daily) {
  let i = 0;
  RANKS.forEach((r, k) => { if (total >= r.days * daily) i = k; });
  const next = RANKS[i + 1];
  return {
    level: i + 1, name: RANKS[i].name, base: RANKS[i].days * daily,
    next: next ? { name: next.name, need: next.days * daily } : null,
  };
}

function rankChip(r) {
  return el("span", "rk" + (r.level >= HIGH_LEVEL ? " hi" : ""), "Lv " + r.level + " · " + r.name);
}

function currentStreak(G, uid, today) {
  const grp = G.group;
  let d = today, streak = 0;
  if (!entryFor(G, uid, d)) d = addDays(d, -1);
  for (let i = 0; i < 800; i++) {
    const e = entryFor(G, uid, d);
    if (!e) break;
    const done = e.situps >= grp.situps && e.pushups >= grp.pushups;
    if (!e.skipped && !done) break;
    if (!e.skipped) streak++;
    d = addDays(d, -1);
  }
  return streak;
}

const METRICS = {
  situps: { key: "sit", unit: "", hint: "Alle Sit-ups, die jemals in dieser Gruppe eingetragen wurden." },
  pushups: { key: "push", unit: "", hint: "Alle Liegestütze, die jemals in dieser Gruppe eingetragen wurden." },
  done: { key: "done", unit: " Tage", hint: "Tage, an denen das Tagesziel geschafft wurde." },
  streak: { key: "streak", unit: " Tage", hint: "Geschaffte Tage in Folge bis heute. Skip-Tage unterbrechen die Serie nicht, ein verpasster Tag setzt sie auf 0." },
};

function renderBoard() {
  const G = S.g;
  if (!G || !G.stats) return;
  const grp = G.group, me = S.user.uid;
  const metric = G.metric || "situps";
  const cfg = METRICS[metric];
  const val = (m) => G.stats[m.uid][cfg.key];
  const sorted = [...G.membersView].sort((a, b) => val(b) - val(a) || a.name.localeCompare(b.name, "de"));
  document.querySelectorAll("#metricSeg button").forEach((b) => b.classList.toggle("active", b.dataset.metric === metric));
  $("board").replaceChildren(...sorted.map((m) => {
    const v = val(m);
    const pos = 1 + sorted.filter((o) => val(o) > v).length;
    const row = el("div", "brow" + (m.uid === me ? " me" : ""));
    const main = el("div", "bmain");
    main.append(el("div", "bname", m.name + (m.uid === me ? " (du)" : "")));
    if (metric === "situps") main.append(rankChip(rankFor(v, grp.situps)));
    if (metric === "pushups") main.append(rankChip(rankFor(v, grp.pushups)));
    const unit = cfg.unit ? (v === 1 ? " Tag" : " Tage") : "";
    row.append(el("div", "pos" + (pos <= 3 && v > 0 ? " p" + pos : ""), String(pos)), main, el("div", "bval num", nf(v) + unit));
    return row;
  }));
  $("boardHint").textContent = cfg.hint;
}

function renderRanks(isMember) {
  const G = S.g, grp = G.group, me = S.user.uid;
  $("myRankCard").hidden = !isMember;
  if (isMember) {
    const mine = G.stats[me] || { sit: 0, push: 0 };
    const blocks = [["Sit-ups", mine.sit, grp.situps], ["Liegestütze", mine.push, grp.pushups]].map(([label, total, daily]) => {
      const r = rankFor(total, daily);
      const box = el("div", "myRank");
      const top = el("div", "myRankTop");
      top.append(el("span", "exName", label), rankChip(r));
      const mid = el("div", "myRankMid");
      mid.append(
        el("div", "myRankTotal num", nf(total)),
        el("div", "myRankNext", r.next ? "noch " + nf(r.next.need - total) + " bis " + r.next.name : "Höchster Rang erreicht")
      );
      const bar = el("div", "bar");
      const fill = el("div", "bar-fill rankfill" + (r.level >= HIGH_LEVEL ? " hi" : ""));
      fill.style.width = (r.next ? Math.min(100, ((total - r.base) / (r.next.need - r.base)) * 100) : 100) + "%";
      bar.append(fill);
      box.append(top, mid, bar);
      return box;
    });
    $("myRanks").replaceChildren(...blocks);
  }
  $("ladder").replaceChildren(...RANKS.map((r, i) => {
    const row = el("div", "lrow");
    row.append(
      rankChip({ level: i + 1, name: r.name }),
      el("span", "", ""),
      el("div", "need", r.days === 0
        ? "Startrang"
        : nf(r.days * grp.situps) + " Sit-ups · " + nf(r.days * grp.pushups) + " Liegestütze (" + r.days + " volle Tage)")
    );
    return row;
  }));
  renderBoard();
}
function setTab(tab) {
  if (S.g) S.g.tab = tab;
  Object.keys(PANES).forEach((t) => { $(PANES[t]).hidden = t !== tab; });
  document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  window.scrollTo(0, 0);
}

function loadForm() {
  const G = S.g;
  $("dateInput").value = G.selectedDate;
  const mine = entryFor(G, S.user.uid, G.selectedDate);
  $("situpsInput").value = mine ? mine.situps : 0;
  $("pushupsInput").value = mine ? mine.pushups : 0;
  $("skipInput").checked = !!(mine && mine.skipped);
  $("saveFeedback").hidden = true;
  updateBars();
}

function updateSkip() {
  const G = S.g;
  const wk = isoWeekKey(G.selectedDate);
  const used = G.entries.find((e) => e.uid === S.user.uid && e.skipped && e.date !== G.selectedDate && isoWeekKey(e.date) === wk);
  if (used) {
    $("skipInput").checked = false;
    $("skipInput").disabled = true;
    $("skipNote").hidden = false;
    $("skipNote").textContent = "Skip-Tag dieser Woche schon am " + formatDate(used.date) + " genutzt.";
  } else {
    $("skipInput").disabled = false;
    $("skipNote").hidden = true;
  }
}

function renderGroup() {
  const G = S.g;
  if (!G || !G.loaded.g || !G.loaded.m || !G.loaded.e) return;
  $("viewGroup").classList.remove("loading");

  const grp = G.group, me = S.user.uid;
  const member = isMemberOf(G);
  const isGAdmin = grp.adminUid === me;
  const canManage = isGAdmin || S.isAdmin;
  const members = [...G.members].sort((a, b) => (a.uid === me ? -1 : b.uid === me ? 1 : a.name.localeCompare(b.name, "de")));

  $("groupName").textContent = grp.name;
  $("roleBadge").hidden = !canManage;
  $("roleBadge").textContent = isGAdmin ? "Admin" : "App-Admin";

  $("entryCard").hidden = !member;
  $("heroGoal").textContent = "Ziel: " + grp.situps + " / " + grp.pushups;
  $("dateInput").max = todayStr();
  $("dateInput").min = addDays(todayStr(), -30);
  if (member && !G.formInit) { loadForm(); G.formInit = true; }
  if (member) { updateSkip(); updateBars(); }

  const today = todayStr();

  $("todayList").replaceChildren(...members.map((m) => {
    const s = statusFor(G, m.uid, today), e = entryFor(G, m.uid, today);
    const row = el("div", "person");
    const main = el("div", "personMain");
    main.append(
      el("div", "personName", m.name + (m.uid === me ? " (du)" : "")),
      el("div", "personSub", e ? (e.skipped ? "Skip-Tag genutzt" : e.situps + " Sit-ups · " + e.pushups + " Liegestütze") : "Noch nichts eingetragen")
    );
    row.append(el("div", "avatar" + (m.uid === me ? " me" : ""), (m.name.trim()[0] || "?").toUpperCase()), main, el("span", "pill " + s.cls, s.label));
    return row;
  }));

  const lost = {}, sit = {}, push = {};
  members.forEach((m) => { lost[m.uid] = 0; sit[m.uid] = 0; push[m.uid] = 0; });
  G.entries.forEach((e) => {
    if (!(e.uid in lost)) return;
    sit[e.uid] += e.situps;
    push[e.uid] += e.pushups;
    if (!e.skipped && (e.situps < grp.situps || e.pushups < grp.pushups)) lost[e.uid] += 1;
  });

  const thead = el("thead");
  const headRow = el("tr");
  ["Mitglied", "Schulden", "Sit-ups", "Liegestütze"].forEach((t, i) => headRow.append(el("th", i ? "r" : "", t)));
  thead.append(headRow);
  const tbody = el("tbody");
  members.forEach((m) => {
    const tr = el("tr", m.uid === me ? "me" : "");
    const owed = lost[m.uid] * grp.penalty;
    const debt = el("td", "r");
    debt.append(
      el("div", "debtNum num" + (owed === 0 ? " zero" : ""), owed + " €"),
      el("div", "sub", lost[m.uid] + (lost[m.uid] === 1 ? " Tag" : " Tage"))
    );
    tr.append(
      el("td", "nameCell", m.name + (m.uid === me ? " (du)" : "")),
      debt,
      el("td", "r num", sit[m.uid].toLocaleString("de-DE")),
      el("td", "r num", push[m.uid].toLocaleString("de-DE"))
    );
    tbody.append(tr);
  });
  $("bilanzTable").replaceChildren(thead, tbody);

  const stats = {};
  members.forEach((m) => { stats[m.uid] = { sit: sit[m.uid], push: push[m.uid], done: 0, streak: currentStreak(G, m.uid, today) }; });
  G.entries.forEach((e) => {
    const st = stats[e.uid];
    if (st && !e.skipped && e.situps >= grp.situps && e.pushups >= grp.pushups) st.done++;
  });
  G.stats = stats;
  G.membersView = members;
  renderRanks(member);

  const MARK = { success: "✓", danger: "✕", skip: "S", pending: "·" };
  const grid = $("historyGrid");
  grid.style.setProperty("--n", members.length);
  const head = el("div", "hrow head");
  head.append(el("div", "", ""));
  members.forEach((m) => head.append(el("div", "", m.uid === me ? "Du" : m.name)));
  const rows = [head];
  for (let i = 0; i < 14; i++) {
    const d = addDays(today, -i);
    const row = el("div", "hrow" + (i === 0 ? " today" : ""));
    row.append(el("div", "hdate num", formatDate(d)));
    members.forEach((m) => {
      const s = statusFor(G, m.uid, d);
      const cell = el("div", "hcell");
      const mark = el("i", "mark " + s.cls, MARK[s.cls]);
      mark.title = s.label;
      cell.append(mark);
      row.append(cell);
    });
    rows.push(row);
  }
  grid.replaceChildren(...rows);

  $("codeValue").textContent = grp.code;
  $("shareCode").hidden = !navigator.share;
  $("memberList").replaceChildren(...members.map((m) => {
    const row = el("div", "memberRow");
    const left = el("span", "", m.name);
    if (m.uid === me) left.append(el("span", "tag", "(du)"));
    if (m.uid === grp.adminUid) left.append(el("span", "tag", "Admin"));
    row.append(left);
    if (canManage && m.uid !== grp.adminUid) {
      const b = el("button", "", "Entfernen");
      b.type = "button";
      b.addEventListener("click", () => removeMember(m));
      row.append(b);
    }
    return row;
  }));
  $("rules").textContent = "Regeln: jeden Tag " + grp.situps + " Sit-ups und " + grp.pushups + " Liegestütze. Jede:r hat einen Skip-Tag pro Woche. An allen anderen Tagen zahlt, wer das Ziel verpasst, " + grp.penalty + " € — egal aus welchem Grund.";

  $("adminTools").hidden = !canManage;
  if (canManage && !$("adminTools").open) {
    $("editName").value = grp.name;
    $("editSitups").value = grp.situps;
    $("editPushups").value = grp.pushups;
    $("editPenalty").value = grp.penalty;
  }
  $("leaveBtn").hidden = !(member && !isGAdmin);
}

/* ---------- group actions ---------- */

async function saveEntry() {
  const G = S.g;
  if (!G || !isMemberOf(G)) return;
  const date = $("dateInput").value || G.selectedDate;
  const data = {
    uid: S.user.uid,
    date,
    situps: cleanReps($("situpsInput").value),
    pushups: cleanReps($("pushupsInput").value),
    skipped: $("skipInput").checked && !$("skipInput").disabled,
    updatedAt: nowIso(),
  };
  const fb = $("saveFeedback");
  $("saveBtn").disabled = true;
  fb.hidden = true;
  try {
    const slow = new Promise((resolve) => setTimeout(() => resolve("slow"), 8000));
    const res = await Promise.race([setDoc(doc(db, "groups", G.id, "entries", date + "_" + S.user.uid), data), slow]);
    setMsg(fb, res === "slow" ? "Wird gespeichert, sobald du wieder online bist." : "Gespeichert ✓", true);
  } catch (err) {
    setMsg(fb, "Speichern hat nicht geklappt. Prüfe deine Verbindung.");
  } finally {
    $("saveBtn").disabled = false;
  }
}

async function removeMember(m) {
  const G = S.g;
  if (!G || !confirm(m.name + " aus der Gruppe entfernen?")) return;
  try {
    await deleteDoc(doc(db, "users", m.uid, "groups", G.id));
    await deleteDoc(doc(db, "groups", G.id, "members", m.uid));
    flash(m.name + " wurde entfernt.", "ok");
  } catch (err) {
    flash("Entfernen hat nicht geklappt.", "err");
  }
}

async function leaveGroup() {
  const G = S.g;
  if (!G || !confirm("Gruppe wirklich verlassen?")) return;
  const id = G.id;
  stopGroup();
  try {
    await deleteDoc(doc(db, "groups", id, "members", S.user.uid));
    await deleteDoc(doc(db, "users", S.user.uid, "groups", id));
    flash("Du hast die Gruppe verlassen.", "ok");
  } catch (err) {
    flash("Verlassen hat nicht geklappt.", "err");
  }
  location.hash = "";
}

async function deleteGroup() {
  const G = S.g;
  if (!G || !confirm("Gruppe \"" + G.group.name + "\" mit allen Einträgen endgültig löschen? Das kann nicht rückgängig gemacht werden.")) return;
  const { id } = G, code = G.group.code;
  stopGroup();
  try {
    await deleteGroupFully(id, code);
    flash("Gruppe gelöscht.", "ok");
  } catch (err) {
    flash("Löschen hat nicht (vollständig) geklappt.", "err");
  }
  location.hash = "";
}

async function newCode() {
  const G = S.g;
  if (!G || !confirm("Neuen Code erzeugen? Der alte Code funktioniert danach nicht mehr.")) return;
  const old = G.group.code;
  try {
    let code = makeCode();
    for (let i = 0; ; i++) {
      try { await setDoc(doc(db, "groupCodes", code), { groupId: G.id }); break; }
      catch (err) { if (i >= 5) throw err; code = makeCode(); }
    }
    await updateDoc(doc(db, "groups", G.id), { code });
    try { await deleteDoc(doc(db, "groupCodes", old)); } catch (e) {}
    flash("Neuer Code: " + code, "ok");
  } catch (err) {
    flash("Der Code konnte nicht erneuert werden.", "err");
  }
}

async function saveSettings(e) {
  e.preventDefault();
  const G = S.g;
  const msg = $("editMsg");
  if (!G) return;
  const v = readSettings("edit");
  if (v.error) return setMsg(msg, v.error);
  try {
    await updateDoc(doc(db, "groups", G.id), { name: v.name, situps: v.situps, pushups: v.pushups, penalty: v.penalty });
    setMsg(msg, "Gespeichert ✓", true);
  } catch (err) {
    setMsg(msg, "Speichern hat nicht geklappt.");
  }
}

/* ---------- boot ---------- */

function wire() {
  $("tabLogin").addEventListener("click", () => setAuthMode("login"));
  $("tabRegister").addEventListener("click", () => setAuthMode("register"));
  $("authForm").addEventListener("submit", submitAuth);
  $("forgotBtn").addEventListener("click", forgotPassword);
  $("logoutBtn").addEventListener("click", () => { location.hash = ""; signOut(auth); });
  $("joinForm").addEventListener("submit", joinGroup);
  $("createForm").addEventListener("submit", createGroup);
  $("adminBtn").addEventListener("click", () => { location.hash = "admin"; });
  window.addEventListener("hashchange", route);

  $("dateInput").addEventListener("change", () => {
    const G = S.g;
    if (!G) return;
    G.selectedDate = $("dateInput").value || todayStr();
    loadForm();
    updateSkip();
  });
  document.querySelectorAll(".stepper button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const inp = btn.dataset.target === "situps" ? $("situpsInput") : $("pushupsInput");
      inp.value = cleanReps(cleanReps(inp.value) + parseInt(btn.dataset.delta, 10));
      updateBars();
    });
  });
  $("situpsInput").addEventListener("input", updateBars);
  $("pushupsInput").addEventListener("input", updateBars);
  $("saveBtn").addEventListener("click", saveEntry);
  document.querySelectorAll(".tabbar button").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
  document.querySelectorAll("#metricSeg button").forEach((b) => b.addEventListener("click", () => {
    if (!S.g) return;
    S.g.metric = b.dataset.metric;
    renderBoard();
  }));

  $("copyCode").addEventListener("click", async () => {
    if (!S.g) return;
    flash((await copyText(S.g.group.code)) ? "Code kopiert." : "Code: " + S.g.group.code, "ok");
  });
  $("shareCode").addEventListener("click", () => {
    const G = S.g;
    if (!G) return;
    navigator.share({
      title: "Sweat or Pay",
      text: "Tritt meiner Sweat-or-Pay-Gruppe \"" + G.group.name + "\" bei. Gruppencode: " + G.group.code,
      url: location.origin + location.pathname,
    }).catch(() => {});
  });
  $("editForm").addEventListener("submit", saveSettings);
  $("newCodeBtn").addEventListener("click", newCode);
  $("deleteGroupBtn").addEventListener("click", deleteGroup);
  $("leaveBtn").addEventListener("click", leaveGroup);
}

function boot() {
  wire();
  setAuthMode("login");
  if (!configured) {
    show("viewAuth");
    setMsg($("authMsg"), "Firebase ist noch nicht eingerichtet. Trage die Konfiguration in config.js ein.");
    $("authSubmit").disabled = true;
    return;
  }
  const app = initializeApp(CONFIG.firebase);
  auth = getAuth(app);
  if (CONFIG.emulator) {
    db = initializeFirestore(app, { experimentalForceLongPolling: true });
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  } else {
    try {
      db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
    } catch (e) {
      db = getFirestore(app);
    }
  }
  onAuthStateChanged(auth, onAuth);
}

boot();

if ("serviceWorker" in navigator && location.protocol.startsWith("http") && !CONFIG.emulator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
