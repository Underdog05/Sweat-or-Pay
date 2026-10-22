import { CONFIG } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, sendPasswordResetEmail, connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator,
  doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch, query, where, orderBy, limit,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const MAX_REPS = 2000;
const DEFAULTS = CONFIG.defaults;
const configured = !!(CONFIG.firebase && CONFIG.firebase.apiKey && !CONFIG.firebase.apiKey.startsWith("HIER"));
const AVATAR_PREFIX = "data:image/jpeg;base64,";

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
const nf = (n) => n.toLocaleString("de-DE");
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

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

function dayLabel(s) {
  const t = todayStr();
  if (s === t) return "Heute";
  if (s === addDays(t, -1)) return "Gestern";
  return formatDate(s);
}

function timeOf(iso) {
  try { return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; }
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

function safeAvatar(v) {
  if (typeof v !== "string" || v.length > 24000 || !v.startsWith(AVATAR_PREFIX)) return "";
  return /^[A-Za-z0-9+/=]+$/.test(v.slice(AVATAR_PREFIX.length)) ? v : "";
}

/* ---------- state ---------- */

const S = { user: null, name: "", avatar: "", isAdmin: false, memberships: [], pendingName: null, profileTried: false, view: null, g: null };
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

function avatarEl(m, size, isMe) {
  const a = el("div", "avatar" + (isMe ? " me" : ""));
  a.style.setProperty("--s", size + "px");
  const src = safeAvatar(m.avatar);
  if (src) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    a.append(img);
  } else {
    a.textContent = ((m.name || "").trim()[0] || "?").toUpperCase();
  }
  return a;
}

function updateBadge() {
  $("whoBadge").replaceChildren(
    avatarEl({ name: S.name, avatar: S.avatar }, 28, true),
    el("span", "wbName", S.name + (S.isAdmin ? " · Admin" : ""))
  );
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

/* ---------- Animationen (Explosion und Konfetti) ---------- */

const FX = { parts: [], raf: 0, ctx: null, dpr: 1 };
const FX_COLORS = ["#ffcf5c", "#ffffff", "#6d96ff", "#ff7570", "#4dd98c", "#c58bff"];
const reduceMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

function fxResize() {
  const c = $("fx");
  FX.dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.round(window.innerWidth * FX.dpr);
  c.height = Math.round(window.innerHeight * FX.dpr);
  FX.ctx = c.getContext("2d");
}

function fxLoop() {
  const ctx = FX.ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, $("fx").width, $("fx").height);
  ctx.scale(FX.dpr, FX.dpr);
  FX.parts = FX.parts.filter((p) => p.life > 0 && p.y < window.innerHeight + 40);
  FX.parts.forEach((p) => {
    p.life -= 1;
    p.vx *= p.drag;
    p.vy = p.vy * p.drag + p.g;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    ctx.globalAlpha = Math.min(1, p.life / 30);
    ctx.fillStyle = p.color;
    if (p.shape === "spark") {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.6);
      ctx.restore();
    }
  });
  ctx.globalAlpha = 1;
  if (FX.parts.length) FX.raf = requestAnimationFrame(fxLoop);
  else { FX.raf = 0; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, $("fx").width, $("fx").height); }
}

function fxAdd(list) {
  if (reduceMotion()) return;
  if (!FX.ctx) fxResize();
  FX.parts.push(...list);
  if (!FX.raf) FX.raf = requestAnimationFrame(fxLoop);
}

function explosion(x, y, n, colors) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const a = rnd(0, Math.PI * 2), s = rnd(3, 15);
    list.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, g: 0.22, drag: 0.985, life: rnd(55, 115), size: rnd(2, 5.5), color: pick(colors || FX_COLORS), shape: "spark", rot: 0, vr: 0 });
  }
  fxAdd(list);
}

function confetti(n, colors) {
  const list = [];
  for (let i = 0; i < n; i++) {
    list.push({ x: rnd(0, window.innerWidth), y: -rnd(10, 220), vx: rnd(-1.5, 1.5), vy: rnd(2, 5), g: 0.06, drag: 0.995, life: rnd(170, 270), size: rnd(7, 12), color: pick(colors || FX_COLORS), shape: "conf", rot: rnd(0, 6), vr: rnd(-0.2, 0.2) });
  }
  fxAdd(list);
}

const celQueue = [];
let celebrating = false;

function celebrateRank(kind, total, level) {
  celQueue.push({ kind, total, level });
  if (!celebrating) nextCelebration();
}

function nextCelebration() {
  const c = celQueue.shift();
  if (!c) { celebrating = false; $("celebrate").hidden = true; return; }
  celebrating = true;
  const r = rankFor(c.total);
  $("celKicker").textContent = "Neuer Rang!";
  $("celBadge").replaceChildren(rankImg(c.level, 168));
  $("celName").textContent = r.name;
  $("celSub").textContent = "Level " + c.level + " bei " + c.kind + " mit " + nf(c.total) + " Wiederholungen." +
    (r.next ? " Als Nächstes wartet " + r.next.name + " bei " + nf(r.next.need) + "." : " Höher geht es nicht. Du bist eine Legende.");
  $("celebrate").hidden = false;
  requestAnimationFrame(() => {
    const b = $("celBadge").getBoundingClientRect();
    const x = b.left + b.width / 2, y = b.top + b.height / 2;
    const mult = 1 + Math.min(1.5, c.level / 8);
    const gold = ["#ffcf5c", "#ffe9a8", "#ffffff", "#f2b807"];
    explosion(x, y, Math.round(140 * mult), FX_COLORS);
    setTimeout(() => explosion(x, y, Math.round(110 * mult), gold), 320);
    setTimeout(() => explosion(rnd(60, window.innerWidth - 60), rnd(120, window.innerHeight / 2), 80, FX_COLORS), 640);
    confetti(Math.round(90 * mult));
  });
}

/* ---------- Profil ---------- */

function openProfile() {
  $("profileAvatar").replaceChildren(avatarEl({ name: S.name, avatar: S.avatar }, 72, true));
  $("profileName").textContent = S.name;
  $("avatarRemove").hidden = !S.avatar;
  setMsg($("profileMsg"), "");
  $("profileModal").hidden = false;
}

function closeProfile() { $("profileModal").hidden = true; }

async function loadBitmap(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) { /* weiter mit Image */ }
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bild")); };
    img.src = url;
  });
}

async function fileToAvatar(file) {
  const bmp = await loadBitmap(file);
  const w = bmp.width, h = bmp.height, side = Math.min(w, h);
  const c = document.createElement("canvas");
  c.width = c.height = 160;
  c.getContext("2d").drawImage(bmp, (w - side) / 2, (h - side) / 2, side, side, 0, 0, 160, 160);
  let q = 0.85, url = "";
  do { url = c.toDataURL("image/jpeg", q); q -= 0.1; } while (url.length > 22000 && q > 0.25);
  if (url.length > 22000) throw new Error("zu gross");
  return url;
}

async function saveAvatar(url) {
  const uid = S.user.uid;
  await setDoc(doc(db, "users", uid), { name: S.name, createdAt: nowIso(), avatar: url });
  S.avatar = url;
  updateBadge();
  await Promise.all(S.memberships.map((gid) => updateDoc(doc(db, "groups", gid, "members", uid), { avatar: url }).catch(() => {})));
}

async function onAvatarPicked() {
  const file = $("avatarFile").files && $("avatarFile").files[0];
  $("avatarFile").value = "";
  if (!file) return;
  const msg = $("profileMsg");
  setMsg(msg, "Bild wird verarbeitet …", true);
  try {
    const url = await fileToAvatar(file);
    await saveAvatar(url);
    $("profileAvatar").replaceChildren(avatarEl({ name: S.name, avatar: S.avatar }, 72, true));
    $("avatarRemove").hidden = false;
    setMsg(msg, "Profilbild gespeichert ✓", true);
  } catch (err) {
    setMsg(msg, "Das Bild konnte nicht gespeichert werden. Versuche ein anderes Foto.");
  }
}

async function removeAvatar() {
  const msg = $("profileMsg");
  try {
    await saveAvatar("");
    $("profileAvatar").replaceChildren(avatarEl({ name: S.name, avatar: "" }, 72, true));
    $("avatarRemove").hidden = true;
    setMsg(msg, "Profilbild entfernt.", true);
  } catch (err) {
    setMsg(msg, "Das hat nicht geklappt. Bitte versuche es nochmal.");
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
  closeProfile();

  if (!user) {
    S.name = ""; S.avatar = ""; S.isAdmin = false; S.memberships = []; S.pendingName = null; S.profileTried = false;
    $("authPass").value = "";
    show("viewAuth");
    return;
  }

  S.name = S.pendingName || user.displayName || (user.email || "").split("@")[0] || "Spieler";
  S.avatar = "";
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
      S.avatar = safeAvatar(snap.data().avatar);
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
    await setDoc(doc(db, "groups", gid, "members", S.user.uid), { name: S.name, code, joinedAt: now, avatar: S.avatar || "" });
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
    await setDoc(doc(db, "groups", gid, "members", uid), { name: S.name, code, joinedAt: now, avatar: S.avatar || "" });
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
  const [ents, mems, msgs, reacts] = await Promise.all([
    getDocs(collection(gref, "entries")), getDocs(collection(gref, "members")),
    getDocs(collection(gref, "messages")), getDocs(collection(gref, "reactions")),
  ]);
  await deleteRefs(ents.docs.map((d) => d.ref));
  await deleteRefs(msgs.docs.map((d) => d.ref));
  await deleteRefs(reacts.docs.map((d) => d.ref));
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
    a.append(el("span", "", g.name), el("small", "", "Code " + g.code + " · " + g.situps + "/" + g.pushups + " · " + g.penalty + " €"));
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

/* ---------- Ränge ---------- */

// Ränge zählen alle jemals eingetragenen Wiederholungen, für Sit-ups und Liegestütze getrennt (max. 100.000).
const RANKS = [
  { name: "Rookie", min: 0 },
  { name: "Kämpfer", min: 500 },
  { name: "Athlet", min: 1500 },
  { name: "Krieger", min: 3500 },
  { name: "Veteran", min: 7000 },
  { name: "Elite", min: 12000 },
  { name: "Champion", min: 20000 },
  { name: "Master", min: 30000 },
  { name: "Grandmaster", min: 45000 },
  { name: "Titan", min: 62000 },
  { name: "Legende", min: 80000 },
  { name: "Mythos", min: 100000 },
];
const HIGH_LEVEL = 7;

function rankFor(total) {
  let i = 0;
  RANKS.forEach((r, k) => { if (total >= r.min) i = k; });
  const next = RANKS[i + 1];
  return {
    level: i + 1, name: RANKS[i].name, base: RANKS[i].min,
    next: next ? { name: next.name, need: next.min } : null,
  };
}

function rankChip(r) {
  return el("span", "rk" + (r.level >= HIGH_LEVEL ? " hi" : ""), "Lv " + r.level + " · " + r.name);
}

function rankImg(level, size) {
  const img = el("img", "rimg");
  img.src = "ranks/" + level + ".jpg";
  img.alt = "Rang " + level;
  img.width = size;
  img.height = size;
  img.style.setProperty("--s", size + "px");
  return img;
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
  const me = S.user.uid;
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
    const rk = metric === "situps" || metric === "pushups" ? rankFor(v) : null;
    if (rk) main.append(rankChip(rk));
    const wrap = el("div", "avWrap");
    wrap.append(avatarEl(m, 44, m.uid === me));
    if (rk) wrap.append(rankImg(rk.level, 22));
    const unit = cfg.unit ? (v === 1 ? " Tag" : " Tage") : "";
    row.append(el("div", "pos" + (pos <= 3 && v > 0 ? " p" + pos : ""), String(pos)), wrap, main, el("div", "bval num", nf(v) + unit));
    return row;
  }));
  $("boardHint").textContent = cfg.hint;
}

function renderRanks(isMember) {
  const G = S.g;
  const me = S.user.uid;
  $("myRankCard").hidden = !isMember;
  if (isMember) {
    const mine = G.stats[me] || { sit: 0, push: 0 };
    const blocks = [["Sit-ups", mine.sit], ["Liegestütze", mine.push]].map(([label, total]) => {
      const r = rankFor(total);
      const box = el("div", "myRank");
      const head = el("div", "myRankHead");
      const info = el("div", "myRankInfo");
      const top = el("div", "myRankTop");
      top.append(el("span", "exName", label), rankChip(r));
      info.append(
        top,
        el("div", "myRankTotal num", nf(total)),
        el("div", "myRankNext", r.next ? "noch " + nf(r.next.need - total) + " bis " + r.next.name : "Höchster Rang erreicht")
      );
      head.append(rankImg(r.level, 72), info);
      const bar = el("div", "bar");
      const fill = el("div", "bar-fill rankfill" + (r.level >= HIGH_LEVEL ? " hi" : ""));
      fill.style.width = (r.next ? Math.min(100, ((total - r.base) / (r.next.need - r.base)) * 100) : 100) + "%";
      bar.append(fill);
      box.append(head, bar);
      return box;
    });
    $("myRanks").replaceChildren(...blocks);
  }
  $("ladder").replaceChildren(...RANKS.map((r, i) => {
    const row = el("div", "lrow");
    const txt = el("div", "lrowText");
    txt.append(rankChip({ level: i + 1, name: r.name }), el("div", "need", r.min === 0 ? "Startrang" : "ab " + nf(r.min) + " Wiederholungen"));
    row.append(rankImg(i + 1, 48), txt);
    return row;
  }));
  renderBoard();
}

/* ---------- Reaktionen (Feed) ---------- */

const PHRASES = [
  { key: "hauen", tone: "win", text: "Du hast heute mal richtig reingehauen" },
  { key: "maschine", tone: "win", text: "Du bist 'ne Maschine" },
  { key: "bizeps", tone: "win", text: "Dein Bizeps schickt Grüße" },
  { key: "mensch", tone: "win", text: "Bist du überhaupt noch ein Mensch?" },
  { key: "respekt", tone: "win", text: "Respekt, Chef" },
  { key: "muskel", tone: "win", text: "Heute Muskelkater, morgen Legende" },
  { key: "schnecke", tone: "lose", text: "Das war wohl die Schnecken-Edition" },
  { key: "geldbeutel", tone: "lose", text: "Dein Geldbeutel weint schon" },
  { key: "couch", tone: "lose", text: "Die Couch hat gewonnen" },
  { key: "ausrede", tone: "lose", text: "Ausreden nehme ich nur in bar" },
  { key: "ueberweisung", tone: "lose", text: "Überweisung oder Bargeld?" },
  { key: "pause", tone: "lose", text: "Hat da jemand Pause gemacht?" },
  { key: "urlaub", tone: "skip", text: "Urlaub vom Schweiß, wie schön" },
  { key: "faul", tone: "skip", text: "Faulenzen mit Erlaubnis" },
  { key: "joker", tone: "skip", text: "Der Joker sitzt, gut gespielt" },
  { key: "weiter", tone: "any", text: "Weiter so" },
  { key: "lach", tone: "any", text: "Ich lach mich schlapp" },
  { key: "coach", tone: "any", text: "Dein Coach ist stolz auf dich" },
];
const PHRASE_BY_KEY = new Map(PHRASES.map((p) => [p.key, p]));

function toneFor(cls) {
  return cls === "success" ? "win" : cls === "danger" ? "lose" : "skip";
}

async function toggleReaction(entryId, date, key) {
  const G = S.g;
  if (!G) return;
  if (!isMemberOf(G)) { flash("Nur Mitglieder können reagieren.", "err"); return; }
  const uid = S.user.uid;
  const rid = entryId + "_" + uid + "_" + key;
  const has = G.reactions.some((r) => r.entryId === entryId && r.uid === uid && r.key === key);
  try {
    if (has) await deleteDoc(doc(db, "groups", G.id, "reactions", rid));
    else await setDoc(doc(db, "groups", G.id, "reactions", rid), { entryId, date, uid, key, createdAt: nowIso() });
  } catch (err) {
    flash("Die Reaktion hat nicht geklappt.", "err");
  }
}

function renderFeed() {
  const G = S.g;
  if (!G || !G.loaded.m || !G.loaded.e || !G.group) return;
  const me = S.user.uid;
  const cutoff = addDays(todayStr(), -13);
  const byUid = new Map(G.members.map((m) => [m.uid, m]));
  const items = G.entries
    .filter((e) => byUid.has(e.uid) && e.date >= cutoff)
    .sort((a, b) => b.date.localeCompare(a.date) || byUid.get(a.uid).name.localeCompare(byUid.get(b.uid).name, "de"));
  $("feedEmpty").hidden = items.length > 0;

  const byEntry = new Map();
  G.reactions.forEach((r) => {
    if (!PHRASE_BY_KEY.has(r.key)) return;
    if (!byEntry.has(r.entryId)) byEntry.set(r.entryId, []);
    byEntry.get(r.entryId).push(r);
  });

  $("feedList").replaceChildren(...items.map((e) => {
    const m = byUid.get(e.uid);
    const entryId = e.date + "_" + e.uid;
    const st = statusFor(G, e.uid, e.date);
    const card = el("div", "act");

    const head = el("div", "actHead");
    const main = el("div", "actMain");
    main.append(el("div", "actName", m.name + (e.uid === me ? " (du)" : "")), el("div", "actDate", dayLabel(e.date)));
    head.append(avatarEl(m, 40, e.uid === me), main, el("span", "pill " + st.cls, st.label));

    const body = el("div", "actBody", e.skipped ? "Hat den Skip-Tag genutzt." : nf(e.situps) + " Sit-ups und " + nf(e.pushups) + " Liegestütze");

    const reacts = el("div", "reacts");
    const mine = new Set();
    const groups = new Map();
    (byEntry.get(entryId) || []).forEach((r) => {
      if (!groups.has(r.key)) groups.set(r.key, []);
      groups.get(r.key).push(r.uid);
      if (r.uid === me) mine.add(r.key);
    });
    PHRASES.filter((p) => groups.has(p.key)).forEach((p) => {
      const uids = groups.get(p.key);
      const chip = el("button", "chip" + (mine.has(p.key) ? " mine" : ""), p.text + " ");
      chip.type = "button";
      chip.title = uids.map((u) => (byUid.get(u) ? byUid.get(u).name : "?")).join(", ");
      chip.append(el("b", "", String(uids.length)));
      chip.addEventListener("click", () => toggleReaction(entryId, e.date, p.key));
      reacts.append(chip);
    });
    const add = el("button", "chip add", G.openPicker === entryId ? "Schließen" : "Reagieren");
    add.type = "button";
    add.addEventListener("click", () => { G.openPicker = G.openPicker === entryId ? null : entryId; renderFeed(); });
    reacts.append(add);

    card.append(head, body, reacts);

    if (G.openPicker === entryId) {
      const tone = toneFor(st.cls);
      const picker = el("div", "picker");
      PHRASES.filter((p) => p.tone === tone || p.tone === "any").forEach((p) => {
        const b = el("button", "chip" + (mine.has(p.key) ? " mine" : ""), p.text);
        b.type = "button";
        b.addEventListener("click", () => { G.openPicker = null; toggleReaction(entryId, e.date, p.key); renderFeed(); });
        picker.append(b);
      });
      card.append(picker);
    }
    return card;
  }));
}

/* ---------- Chat ---------- */

const chatSeenKey = (id) => "sop_chat_seen_" + (S.user ? S.user.uid : "x") + "_" + id;
function getSeen(id) { try { return localStorage.getItem(chatSeenKey(id)) || ""; } catch (e) { return ""; } }
function setSeen(id, v) { try { localStorage.setItem(chatSeenKey(id), v); } catch (e) {} }

function updateChatBadge() {
  const G = S.g;
  if (!G) return;
  const last = G.messages.length ? G.messages[G.messages.length - 1].createdAt : "";
  if (G.tab === "chat" && last) setSeen(G.id, last);
  const seen = getSeen(G.id);
  const unread = G.tab === "chat" ? 0 : G.messages.filter((m) => m.uid !== S.user.uid && m.createdAt > seen).length;
  const b = $("chatBadge");
  b.hidden = unread === 0;
  b.textContent = unread > 9 ? "9+" : String(unread);
}

function scrollChatBottom() {
  const l = $("chatList");
  l.scrollTop = l.scrollHeight;
}

function renderChat() {
  const G = S.g;
  if (!G || !G.loaded.m) return;
  const me = S.user.uid;
  const list = $("chatList");
  const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 90;
  const byUid = new Map(G.members.map((m) => [m.uid, m]));
  const nodes = [];
  let lastDay = "";
  G.messages.forEach((m) => {
    const day = fmtYmd(new Date(m.createdAt));
    if (day !== lastDay) { nodes.push(el("div", "dayDivider", dayLabel(day))); lastDay = day; }
    const mine = m.uid === me;
    const author = byUid.get(m.uid) || { name: "Ehemaliges Mitglied", avatar: "" };
    const row = el("div", "msg" + (mine ? " mine" : ""));
    const bubble = el("div", "bubble");
    if (!mine) bubble.append(el("div", "bubbleName", author.name));
    bubble.append(el("div", "bubbleText", m.text));
    const meta = el("div", "bubbleMeta");
    meta.append(el("span", "", timeOf(m.createdAt)));
    if (mine || (G.group && G.group.adminUid === me) || S.isAdmin) {
      const del = el("button", "", "Löschen");
      del.type = "button";
      del.addEventListener("click", async () => {
        if (!confirm("Nachricht löschen?")) return;
        try { await deleteDoc(doc(db, "groups", G.id, "messages", m.id)); } catch (e) { flash("Löschen hat nicht geklappt.", "err"); }
      });
      meta.append(del);
    }
    bubble.append(meta);
    if (mine) row.append(bubble); else row.append(avatarEl(author, 32, false), bubble);
    nodes.push(row);
  });
  list.replaceChildren(...nodes);
  $("chatEmpty").hidden = G.messages.length > 0;
  $("chatList").hidden = G.messages.length === 0;
  $("chatForm").hidden = !isMemberOf(G);
  if (nearBottom || !G.chatScrolled) { scrollChatBottom(); if (G.tab === "chat") G.chatScrolled = true; }
  updateChatBadge();
}

async function sendChat(e) {
  e.preventDefault();
  const G = S.g;
  if (!G || !isMemberOf(G)) return;
  const text = $("chatInput").value.trim();
  if (!text) return;
  $("chatSend").disabled = true;
  try {
    await setDoc(doc(collection(db, "groups", G.id, "messages")), { uid: S.user.uid, text: text.slice(0, 500), createdAt: nowIso() });
    $("chatInput").value = "";
    G.chatScrolled = false;
  } catch (err) {
    flash("Die Nachricht konnte nicht gesendet werden.", "err");
  } finally {
    $("chatSend").disabled = false;
    $("chatInput").focus();
  }
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
    id, group: null, members: [], entries: [], index: new Map(), messages: [], reactions: [],
    selectedDate: todayStr(), formInit: false, stopped: false, unsubs: [], tab: "today", sec: "bilanz",
    openPicker: null, chatScrolled: false,
    loaded: { g: false, m: false, e: false },
  };
  S.g = G;
  if (!getSeen(id)) setSeen(id, nowIso());
  show("viewGroup");
  $("groupName").textContent = "Lade …";
  $("roleBadge").hidden = true;
  $("adminTools").open = false;
  $("chatBadge").hidden = true;
  setMsg($("editMsg"), "");
  $("saveFeedback").hidden = true;
  setTab("today");
  setSec("bilanz");

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
    G.members = snap.docs.map((d) => ({ uid: d.id, name: String(d.data().name || "?"), avatar: safeAvatar(d.data().avatar) }));
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
  G.unsubs.push(onSnapshot(query(collection(gref, "messages"), orderBy("createdAt", "desc"), limit(150)), (snap) => {
    if (G.stopped) return;
    G.messages = snap.docs
      .map((d) => ({ id: d.id, uid: String(d.data().uid), text: String(d.data().text || ""), createdAt: String(d.data().createdAt || "") }))
      .filter((m) => m.text && m.createdAt)
      .reverse();
    renderChat();
  }, () => {}));
  G.unsubs.push(onSnapshot(query(collection(gref, "reactions"), where("date", ">=", addDays(todayStr(), -14))), (snap) => {
    if (G.stopped) return;
    G.reactions = snap.docs.map((d) => d.data()).filter((r) => typeof r.entryId === "string" && typeof r.key === "string" && typeof r.uid === "string");
    renderFeed();
  }, () => {}));
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

const PANES = { today: "paneToday", feed: "paneFeed", rang: "paneRang", chat: "paneChat", gruppe: "paneGruppe" };
function setTab(tab) {
  if (S.g) S.g.tab = tab;
  Object.keys(PANES).forEach((t) => { $(PANES[t]).hidden = t !== tab; });
  document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  window.scrollTo(0, 0);
  if (tab === "chat" && S.g) { scrollChatBottom(); S.g.chatScrolled = true; updateChatBadge(); }
}

const SECS = { bilanz: "secBilanz", verlauf: "secVerlauf", info: "secInfo" };
function setSec(sec) {
  if (S.g) S.g.sec = sec;
  Object.keys(SECS).forEach((s) => { $(SECS[s]).hidden = s !== sec; });
  document.querySelectorAll("#groupSeg button").forEach((b) => b.classList.toggle("active", b.dataset.sec === sec));
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
    row.append(avatarEl(m, 40, m.uid === me), main, el("span", "pill " + s.cls, s.label));
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
      el("td", "r num", nf(sit[m.uid])),
      el("td", "r num", nf(push[m.uid]))
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
    const left = el("span", "memberLeft", m.name);
    if (m.uid === me) left.append(el("span", "tag", "(du)"));
    if (m.uid === grp.adminUid) left.append(el("span", "tag", "Admin"));
    row.append(avatarEl(m, 34, m.uid === me), left);
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

  renderFeed();
  renderChat();
}

/* ---------- group actions ---------- */

async function saveEntry() {
  const G = S.g;
  if (!G || !isMemberOf(G)) return;
  const uid = S.user.uid, grp = G.group;
  const date = $("dateInput").value || G.selectedDate;
  const data = {
    uid,
    date,
    situps: cleanReps($("situpsInput").value),
    pushups: cleanReps($("pushupsInput").value),
    skipped: $("skipInput").checked && !$("skipInput").disabled,
    updatedAt: nowIso(),
  };

  const old = entryFor(G, uid, date);
  const st = (G.stats && G.stats[uid]) || { sit: 0, push: 0 };
  const after = { sit: st.sit - (old ? old.situps : 0) + data.situps, push: st.push - (old ? old.pushups : 0) + data.pushups };
  const goalWas = !!(old && !old.skipped && old.situps >= grp.situps && old.pushups >= grp.pushups);
  const goalNow = !data.skipped && data.situps >= grp.situps && data.pushups >= grp.pushups;

  const fb = $("saveFeedback");
  $("saveBtn").disabled = true;
  fb.hidden = true;
  try {
    const slow = new Promise((resolve) => setTimeout(() => resolve("slow"), 8000));
    const res = await Promise.race([setDoc(doc(db, "groups", G.id, "entries", date + "_" + uid), data), slow]);
    if (res === "slow") {
      setMsg(fb, "Wird gespeichert, sobald du wieder online bist.", true);
    } else {
      setMsg(fb, goalNow && !goalWas ? "Gespeichert ✓ Tagesziel geschafft!" : "Gespeichert ✓", true);
      let ranked = false;
      [["Sit-ups", st.sit, after.sit], ["Liegestütze", st.push, after.push]].forEach(([kind, before, now]) => {
        const lv = rankFor(now).level;
        if (lv > rankFor(before).level) { celebrateRank(kind, now, lv); ranked = true; }
      });
      if (!ranked && goalNow && !goalWas) {
        const w = window.innerWidth;
        confetti(110);
        explosion(w * 0.25, window.innerHeight * 0.55, 40);
        explosion(w * 0.75, window.innerHeight * 0.55, 40);
      }
    }
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
  if (!G || !confirm("Gruppe \"" + G.group.name + "\" mit allen Einträgen und Chatnachrichten endgültig löschen? Das kann nicht rückgängig gemacht werden.")) return;
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
  window.addEventListener("resize", () => { if (FX.ctx) fxResize(); });

  $("whoBadge").addEventListener("click", openProfile);
  $("profileClose").addEventListener("click", closeProfile);
  $("profileModal").addEventListener("click", (e) => { if (e.target === $("profileModal")) closeProfile(); });
  $("avatarPick").addEventListener("click", () => $("avatarFile").click());
  $("avatarFile").addEventListener("change", onAvatarPicked);
  $("avatarRemove").addEventListener("click", removeAvatar);
  $("celClose").addEventListener("click", nextCelebration);

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
  document.querySelectorAll("#groupSeg button").forEach((b) => b.addEventListener("click", () => setSec(b.dataset.sec)));
  document.querySelectorAll("#metricSeg button").forEach((b) => b.addEventListener("click", () => {
    if (!S.g) return;
    S.g.metric = b.dataset.metric;
    renderBoard();
  }));
  $("chatForm").addEventListener("submit", sendChat);

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
