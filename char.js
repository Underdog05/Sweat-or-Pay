/* Sweat or Pay: Charaktere. Alles wird als SVG gezeichnet (keine Bilddateien, keine Kosten).
   Ein Charakter wird als kurzer Text gespeichert, z. B. "s=2.e=0.m=1.h=3.c=1.o=2.k=4.b=0.a=cap-glasses". */

export const SKIN = [["#ffe3cf", "#eebb98"], ["#f7cba3", "#d79f73"], ["#e2ac7e", "#b87f52"], ["#c88d5e", "#97643b"], ["#9b6b46", "#6c4528"], ["#704b31", "#452818"]];
export const HAIR_COL = ["#2a2018", "#5b3a22", "#a8672f", "#dcb65c", "#c9cbcd", "#d4492f", "#3b6fd8", "#7b4fd5"];
export const HAIR_COL_NAMES = ["Schwarz", "Braun", "Kupfer", "Blond", "Grau", "Rot", "Blau", "Violett"];
export const OUT_COL = ["#e9e5da", "#1f2635", "#e0572b", "#2f9e8f", "#c9a45c", "#6f63b8", "#3a7bd5", "#2f4a3a"];
export const OUT_COL_NAMES = ["Weiß", "Nachtblau", "Glut", "Türkis", "Gold", "Violett", "Blau", "Waldgrün"];
export const EYES = ["Rund", "Fokus", "Fröhlich", "Groß"];
export const MOUTHS = ["Lächeln", "Grinsen", "Schmunzeln", "Ernst"];
export const HAIRS = ["Kurz", "Raspelkurz", "Lang", "Dutt", "Irokese", "Locken", "Glatze", "Zopf"];
export const SKIN_NAMES = ["Sehr hell", "Hell", "Mittel", "Gebräunt", "Dunkel", "Sehr dunkel"];

// Freischalt-Bedingungen: best = beste Serie, done = geschaffte Tage, total = alle Wiederholungen, top = höchste Summe in einer Übung
export const OUTFITS = [
  { name: "Tank-Top" },
  { name: "T-Shirt" },
  { name: "Hoodie" },
  { name: "Trikot" },
  { name: "Team-Jacke", unlock: { k: "top", v: 3500, t: "Rang Krieger: 3.500 in einer Übung" } },
  { name: "Gold-Trikot", unlock: { k: "best", v: 14, t: "14 Tage in Folge geschafft" } },
];
export const BGS = [
  { name: "Ohne" },
  { name: "Ring" },
  { name: "Scheinwerfer" },
  { name: "Flammen", unlock: { k: "best", v: 7, t: "7 Tage in Folge geschafft" } },
  { name: "Blitze", unlock: { k: "total", v: 10000, t: "10.000 Wiederholungen insgesamt" } },
  { name: "Goldglanz", unlock: { k: "done", v: 50, t: "50 Tage das Ziel geschafft" } },
];
export const ACCS = [
  { id: "headband", name: "Stirnband", slot: "head" },
  { id: "cap", name: "Kappe", slot: "head" },
  { id: "beanie", name: "Mütze", slot: "head" },
  { id: "bandana", name: "Bandana", slot: "head" },
  { id: "headphones", name: "Kopfhörer", slot: "head" },
  { id: "fire_band", name: "Flammenband", slot: "head", unlock: { k: "best", v: 3, t: "3 Tage in Folge geschafft" } },
  { id: "laurel", name: "Lorbeerkranz", slot: "head", unlock: { k: "done", v: 20, t: "20 Tage das Ziel geschafft" } },
  { id: "crown", name: "Krone", slot: "head", unlock: { k: "top", v: 12000, t: "Rang Elite: 12.000 in einer Übung" } },
  { id: "halo", name: "Heiligenschein", slot: "head", unlock: { k: "best", v: 30, t: "30 Tage in Folge geschafft" } },
  { id: "glasses", name: "Brille", slot: "eyes" },
  { id: "shades", name: "Sonnenbrille", slot: "eyes" },
  { id: "visor", name: "Cyber-Visier", slot: "eyes", unlock: { k: "total", v: 5000, t: "5.000 Wiederholungen insgesamt" } },
  { id: "beard", name: "Vollbart", slot: "beard" },
  { id: "stache", name: "Schnauzer", slot: "beard" },
  { id: "earring", name: "Ohrring", slot: "ear" },
  { id: "chain", name: "Goldkette", slot: "neck", unlock: { k: "done", v: 10, t: "10 Tage das Ziel geschafft" } },
  { id: "medal", name: "Medaille", slot: "neck", unlock: { k: "done", v: 30, t: "30 Tage das Ziel geschafft" } },
];
const ACC_BY_ID = new Map(ACCS.map((a) => [a.id, a]));
export const METRIC_NAMES = { best: "Beste Serie", done: "Geschaffte Tage", total: "Wiederholungen", top: "Beste Übung" };

export const isUnlocked = (item, m) => !item.unlock || ((m && m[item.unlock.k]) || 0) >= item.unlock.v;

/* ---------- Speichern und Lesen ---------- */

const RANGE = { s: SKIN.length, e: EYES.length, m: MOUTHS.length, h: HAIRS.length, c: HAIR_COL.length, o: OUTFITS.length, k: OUT_COL.length, b: BGS.length };

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function defaultChar(uid) {
  const h = hash(String(uid || "x"));
  const pick = (n, shift) => ((h >>> shift) ^ (h >>> (shift + 7))) % n;
  return { s: pick(RANGE.s, 0), e: pick(RANGE.e, 3), m: pick(RANGE.m, 5), h: pick(RANGE.h - 1, 8) , c: pick(RANGE.c, 11), o: pick(4, 14), k: pick(RANGE.k, 17), b: 0, a: [] };
}

export function parseChar(str, uid) {
  const c = defaultChar(uid);
  if (typeof str !== "string" || !str) return c;
  str.split(".").forEach((pair) => {
    const [k, v] = pair.split("=");
    if (k === "a") {
      const seen = new Set();
      c.a = [];
      (v || "").split("-").forEach((id) => {
        const a = ACC_BY_ID.get(id);
        if (a && !seen.has(a.slot)) { seen.add(a.slot); c.a.push(id); }
      });
    } else if (k in RANGE) {
      const n = parseInt(v, 10);
      if (Number.isInteger(n) && n >= 0 && n < RANGE[k]) c[k] = n;
    }
  });
  return c;
}

export function serializeChar(c) {
  return ["s", "e", "m", "h", "c", "o", "k", "b"].map((k) => k + "=" + c[k]).join(".") + ".a=" + c.a.join("-");
}

export function safeChar(v) {
  return typeof v === "string" && v.length <= 120 && /^[a-z0-9=._-]*$/.test(v) ? v : "";
}

export function randomChar() {
  const r = (n) => Math.floor(Math.random() * n);
  const free = ACCS.filter((a) => !a.unlock);
  const slots = {};
  free.forEach((a) => { if (Math.random() < 0.28) slots[a.slot] = a.id; });
  return { s: r(RANGE.s), e: r(RANGE.e), m: r(RANGE.m), h: r(RANGE.h), c: r(RANGE.c), o: r(4), k: r(RANGE.k), b: r(3), a: Object.values(slots) };
}

export function withAcc(c, id) {
  const a = ACC_BY_ID.get(id);
  const list = c.a.filter((x) => ACC_BY_ID.get(x).slot !== a.slot);
  if (!c.a.includes(id)) list.push(id);
  return { ...c, a: list };
}

/* ---------- Zeichnen ---------- */

function mix(hex, to, t) {
  const n = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = n(hex), b = n(to);
  return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
const dark = (h, t) => mix(h, "#000000", t);
const light = (h, t) => mix(h, "#ffffff", t);

let counter = 0;

function bgMarkup(b, u) {
  switch (b) {
    case 1:
      return `<circle cx="60" cy="72" r="54" fill="url(#${u}ring)" opacity=".18"/><circle cx="60" cy="72" r="54" fill="none" stroke="url(#${u}gold)" stroke-width="2.6" opacity=".95"/><circle cx="60" cy="72" r="47" fill="none" stroke="url(#${u}gold)" stroke-width=".9" opacity=".6"/>`;
    case 2:
      return `<path d="M60 0 L102 150 L18 150 Z" fill="url(#${u}spot)" opacity=".9"/><ellipse cx="60" cy="146" rx="46" ry="6" fill="#fff" opacity=".12"/>`;
    case 3: {
      const fl = (x, y, s, o) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 0 C-14 -16 -6 -30 0 -48 C6 -30 14 -16 0 0Z" fill="url(#${u}fire)" opacity="${o}"/>`;
      return fl(24, 142, 1.5, ".9") + fl(96, 142, 1.5, ".9") + fl(10, 150, 1.1, ".8") + fl(110, 150, 1.1, ".8") + fl(40, 126, 1.0, ".7") + fl(80, 126, 1.0, ".7") + `<circle cx="60" cy="70" r="50" fill="#ff7a45" opacity=".1"/>`;
    }
    case 4:
      return `<circle cx="60" cy="72" r="50" fill="#36d6c4" opacity=".1"/><path d="M70 4 L36 60 L56 60 L44 112 L86 50 L66 50 Z" fill="url(#${u}bolt)" opacity=".85"/><path d="M104 40 L90 66 L100 66 L92 90 L112 60 L102 60 Z" fill="#36d6c4" opacity=".5"/><path d="M12 56 L24 78 L16 78 L22 96 L6 72 L14 72 Z" fill="#9a8cff" opacity=".5"/>`;
    case 5: {
      const star = (x, y, s) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -6 L1.6 -1.6 L6 0 L1.6 1.6 L0 6 L-1.6 1.6 L-6 0 L-1.6 -1.6Z" fill="#fff3c4"/>`;
      return `<circle cx="60" cy="72" r="56" fill="url(#${u}ring)" opacity=".5"/>` + star(22, 30, 1.3) + star(100, 44, 1) + star(14, 92, .9) + star(104, 100, 1.2) + star(84, 14, .8);
    }
    default:
      return "";
  }
}

function torsoMarkup(o, oc, sl, sd, u) {
  const T = "M8 150 C8 122 28 108 48 104 L72 104 C92 108 112 122 112 150 Z";
  const skinBody = `<path d="${T}" fill="url(#${u}body)"/>`;
  const vol = `<path d="${T}" fill="url(#${u}vol)"/>`;
  const rim = `<path d="M8 150 C8 122 28 108 48 104" fill="none" stroke="#fff" stroke-width="1.2" opacity=".22"/><path d="M112 150 C112 122 92 108 72 104" fill="none" stroke="#fff" stroke-width="1.2" opacity=".12"/>`;
  const tee = "M10 136 C12 120 30 108 48 104 L72 104 C90 108 108 120 110 136 L98 142 L93 126 L93 150 L27 150 L27 126 L22 142 Z";
  const fold = (d) => `<path d="${d}" fill="none" stroke="${dark(oc, 0.28)}" stroke-width="1.1" opacity=".55"/>`;
  switch (o) {
    case 0: // Tank-Top
      return skinBody + `<path d="M30 150 C31 132 39 115 49 106 C54 118 66 118 71 106 C81 115 89 132 90 150 Z" fill="${oc}"/><path d="M49 106 C54 118 66 118 71 106" fill="none" stroke="${dark(oc, 0.35)}" stroke-width="1.6"/>${fold("M44 150 C46 140 47 132 48 124")}${fold("M76 150 C74 140 73 132 72 124")}` + vol + rim;
    case 1: // T-Shirt
      return skinBody + `<path d="${tee}" fill="${oc}"/><path d="M48 104 C53 115 67 115 72 104" fill="none" stroke="${dark(oc, 0.4)}" stroke-width="2.2"/>${fold("M30 136 C34 130 38 128 42 128")}${fold("M90 136 C86 130 82 128 78 128")}` + vol + rim;
    case 2: // Hoodie
      return `<path d="M30 118 C32 96 46 88 60 88 C74 88 88 96 90 118 C80 112 70 110 60 114 C50 110 40 112 30 118 Z" fill="${dark(oc, 0.3)}"/>` +
        `<path d="${T}" fill="${oc}"/><path d="M46 104 C52 118 68 118 74 104" fill="${dark(oc, 0.5)}" opacity=".5"/><path d="M52 112 L50 130 M68 112 L70 130" stroke="${light(oc, 0.5)}" stroke-width="1.6" stroke-linecap="round"/><circle cx="50" cy="131" r="1.8" fill="${light(oc, 0.5)}"/><circle cx="70" cy="131" r="1.8" fill="${light(oc, 0.5)}"/>` +
        `<path d="M40 150 C42 142 46 138 52 138 L68 138 C74 138 78 142 80 150" fill="none" stroke="${dark(oc, 0.3)}" stroke-width="1.2" opacity=".6"/>` + vol + rim;
    case 3: // Trikot
      return skinBody + `<path d="${tee}" fill="${oc}"/><path d="M48 104 L60 120 L72 104" fill="none" stroke="${light(oc, 0.85)}" stroke-width="2.6" stroke-linejoin="round"/><path d="M11 132 L22 142 M109 132 L98 142" stroke="${light(oc, 0.85)}" stroke-width="2.4" stroke-linecap="round"/><path d="M28 128 L28 150 M92 128 L92 150" stroke="${light(oc, 0.85)}" stroke-width="2" opacity=".8"/>` + vol + rim;
    case 4: // Team-Jacke
      return `<path d="${T}" fill="#1d2433"/><path d="M13 150 C14 130 26 114 44 106 M107 150 C106 130 94 114 76 106" fill="none" stroke="${oc}" stroke-width="3.2" stroke-linecap="round"/><path d="M60 114 L60 150" stroke="#9aa3b2" stroke-width="1.6"/><path d="M45 104 L51 98 C56 104 64 104 69 98 L75 104 C68 112 52 112 45 104 Z" fill="#161c29" stroke="#2b3447" stroke-width="1"/><circle cx="60" cy="122" r="2" fill="#c9a45c"/>` + vol + rim;
    default: // Gold-Trikot
      return skinBody + `<path d="${tee}" fill="url(#${u}gold)"/><path d="M48 104 C53 115 67 115 72 104" fill="none" stroke="#6b4c12" stroke-width="2.4"/><path d="M26 126 L26 150 M94 126 L94 150" stroke="#6b4c12" stroke-width="2.6"/><path d="M56 124 H66 L58 142" fill="none" stroke="#6b4c12" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>` + vol + rim;
  }
}

function hairBack(h, hc) {
  const hd = dark(hc, 0.3);
  switch (h) {
    case 2: return `<path d="M34 54 C26 82 28 104 36 118 L47 104 L47 64 Z" fill="${hd}"/><path d="M86 54 C94 82 92 104 84 118 L73 104 L73 64 Z" fill="${hd}"/>`;
    case 3: return `<circle cx="60" cy="15" r="11" fill="${hc}"/><ellipse cx="56" cy="11" rx="5" ry="3.2" fill="#fff" opacity=".16"/>`;
    case 7: return `<path d="M82 36 C100 36 108 62 98 86 C95 72 91 62 84 56 Z" fill="${hd}"/>`;
    default: return "";
  }
}

function hairFront(h, hc) {
  const hd = dark(hc, 0.25), hl = light(hc, 0.35);
  const fringe = `<path d="M35 54 C32 30 46 19 60 19 C75 19 88 30 85 54 C82 41 74 34 62 34 C46 34 40 42 35 54 Z" fill="${hc}"/><path d="M42 30 C48 24 58 22 66 23" fill="none" stroke="${hl}" stroke-width="2.4" stroke-linecap="round" opacity=".55"/>`;
  switch (h) {
    case 0: return fringe + `<path d="M35 54 C34 46 37 40 41 36 C40 44 40 50 38 58 Z" fill="${hd}" opacity=".6"/>`;
    case 1: return `<path d="M37 50 C36 32 47 22 60 22 C73 22 84 32 83 50 C79 38 71 32 60 32 C49 32 41 38 37 50 Z" fill="${hc}" opacity=".78"/>`;
    case 2: return fringe;
    case 3: return fringe;
    case 4: return `<path d="M36 52 C36 40 39 34 43 30 C42 40 42 46 40 54 Z M84 52 C84 40 81 34 77 30 C78 40 78 46 80 54 Z" fill="${hc}" opacity=".45"/><path d="M51 34 C48 16 53 6 60 3 C67 6 72 16 69 34 C65 28 55 28 51 34 Z" fill="${hc}"/><path d="M57 8 C55 16 55 22 56 27" fill="none" stroke="${hl}" stroke-width="1.8" stroke-linecap="round" opacity=".6"/>`;
    case 5: return `<g fill="${hc}"><circle cx="38" cy="42" r="10"/><circle cx="46" cy="30" r="11"/><circle cx="60" cy="25" r="12"/><circle cx="74" cy="30" r="11"/><circle cx="82" cy="42" r="10"/><circle cx="35" cy="54" r="6.5"/><circle cx="85" cy="54" r="6.5"/></g><g fill="${hl}" opacity=".3"><circle cx="52" cy="26" r="4"/><circle cx="68" cy="27" r="3"/></g>`;
    case 6: return `<ellipse cx="51" cy="36" rx="9" ry="5.5" fill="#fff" opacity=".16" transform="rotate(-24 51 36)"/>`;
    case 7: return fringe + `<rect x="80" y="36" width="9" height="5" rx="2.2" fill="#d4492f" transform="rotate(30 84 38)"/>`;
    default: return fringe;
  }
}

function faceMarkup(c, mood, u, sl, sd) {
  const hc = HAIR_COL[c.c];
  const ink = "#1b1713";
  const eye = (x) => {
    switch (c.e) {
      case 1: return `<ellipse cx="${x}" cy="54" rx="4.4" ry="2.7" fill="#fff"/><circle cx="${x}" cy="54" r="2.2" fill="${ink}"/><circle cx="${x + 0.8}" cy="53.2" r=".7" fill="#fff"/>`;
      case 2: return `<path d="M${x - 5} 55.5 Q${x} 48.5 ${x + 5} 55.5" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/>`;
      case 3: return `<ellipse cx="${x}" cy="54" rx="5.2" ry="5.8" fill="#fff"/><circle cx="${x}" cy="54.4" r="3.2" fill="${ink}"/><circle cx="${x + 1.2}" cy="52.8" r="1.1" fill="#fff"/>`;
      default: return `<ellipse cx="${x}" cy="54" rx="4.2" ry="4.7" fill="#fff"/><circle cx="${x}" cy="54.4" r="2.7" fill="${ink}"/><circle cx="${x + 0.9}" cy="53.2" r=".9" fill="#fff"/>`;
    }
  };
  const browLift = c.e === 1 ? 1.6 : 0;
  const brows = `<path d="M43.5 ${45.5 + browLift} L55.5 ${44 - browLift}" stroke="${dark(hc, 0.1)}" stroke-width="2.4" stroke-linecap="round"/><path d="M76.5 ${45.5 + browLift} L64.5 ${44 - browLift}" stroke="${dark(hc, 0.1)}" stroke-width="2.4" stroke-linecap="round"/>`;
  const m = mood === "joy" ? 1 : c.m;
  let mouth;
  switch (m) {
    case 1: mouth = `<path d="M50.5 66 Q60 79 69.5 66 Z" fill="#fff" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/><path d="M52 69.5 Q60 72 68 69.5" fill="none" stroke="#d9d4cb" stroke-width=".8"/>`; break;
    case 2: mouth = `<path d="M52.5 69.5 Q60.5 73 68.5 66.5" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round"/>`; break;
    case 3: mouth = `<path d="M53 69.5 H67" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/>`; break;
    default: mouth = `<path d="M51.5 66.5 Q60 75 68.5 66.5" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/>`;
  }
  return `<g class="eyes">${eye(50)}${eye(70)}</g>${brows}<path d="M60.5 56 Q57 62.5 60.5 63.5" fill="none" stroke="${sd}" stroke-width="1.4" stroke-linecap="round" opacity=".8"/>${mouth}` +
    `<ellipse cx="44" cy="62" rx="5" ry="3" fill="#e0573b" opacity=".13"/><ellipse cx="76" cy="62" rx="5" ry="3" fill="#e0573b" opacity=".13"/>`;
}

function accMarkup(id, oc, hc, u) {
  const base = oc;
  switch (id) {
    case "headband": return `<path d="M35.5 39 C46 33 74 33 84.5 39 L84.5 45.5 C74 40 46 40 35.5 45.5 Z" fill="${base}"/><path d="M38 40 C48 35.5 72 35.5 82 40" fill="none" stroke="#fff" stroke-width="1" opacity=".35"/>`;
    case "fire_band": return `<path d="M35.5 39 C46 33 74 33 84.5 39 L84.5 46 C74 40.5 46 40.5 35.5 46 Z" fill="url(#${u}fire)"/><path d="M52 38 C54 33 56 34 55 30 C59 33 59 36 58 38 Z M66 38 C68 34 70 35 69 31 C72 34 72 36 71 38 Z" fill="#ffd27a"/>`;
    case "cap": return `<path d="M34 46 C33 24 46 16 60 16 C75 16 87 25 86 46 C74 40 46 40 34 46 Z" fill="${base}"/><path d="M60 41 C72 38 94 40 100 47 C90 52 72 49 60 46 Z" fill="${dark(base, 0.25)}"/><path d="M42 26 C48 21 56 19 62 19" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".3"/><circle cx="60" cy="31" r="3.2" fill="#c9a45c"/>`;
    case "beanie": return `<path d="M34 47 C32 22 46 12 60 12 C75 12 88 22 86 47 C74 41 46 41 34 47 Z" fill="${base}"/><path d="M34 41 C46 35 74 35 86 41 L86 47 C74 41 46 41 34 47 Z" fill="${dark(base, 0.22)}"/><path d="M40 40 L40 46 M46 38.5 L46 44 M52 37.5 L52 43 M58 37 L58 43 M64 37 L64 43 M70 37.5 L70 43 M76 38.5 L76 44 M82 40 L82 46" stroke="${dark(base, 0.4)}" stroke-width=".9" opacity=".5"/><circle cx="60" cy="10" r="5.5" fill="${light(base, 0.25)}"/>`;
    case "bandana": return `<path d="M34.5 40 C46 31 74 31 85.5 40 L85.5 47 C74 40 46 40 34.5 47 Z" fill="${base}"/><circle cx="46" cy="39" r="1.1" fill="#fff" opacity=".6"/><circle cx="60" cy="36.5" r="1.1" fill="#fff" opacity=".6"/><circle cx="74" cy="39" r="1.1" fill="#fff" opacity=".6"/><path d="M85 42 L98 36 L96 48 Z" fill="${dark(base, 0.15)}"/>`;
    case "headphones": return `<path d="M35 52 C32 12 88 12 85 52" fill="none" stroke="#242a36" stroke-width="4.2" stroke-linecap="round"/><rect x="29" y="46" width="9" height="19" rx="4.2" fill="${base}"/><rect x="82" y="46" width="9" height="19" rx="4.2" fill="${base}"/><rect x="29" y="46" width="9" height="19" rx="4.2" fill="none" stroke="#242a36" stroke-width="1.2"/><rect x="82" y="46" width="9" height="19" rx="4.2" fill="none" stroke="#242a36" stroke-width="1.2"/>`;
    case "laurel": {
      let s = "";
      for (let i = 0; i < 6; i++) {
        const t = i / 5, a = Math.PI * (0.98 - t * 0.5);
        const lx = 60 - Math.cos(a) * 27 - 1, ly = 52 - Math.sin(a) * 30;
        const rx = 60 + Math.cos(a) * 27 + 1;
        const rot = -70 + t * 70;
        s += `<ellipse cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" rx="3.2" ry="6.4" fill="${i % 2 ? "#6ea05a" : "#8ac06e"}" transform="rotate(${(rot - 14).toFixed(0)} ${lx.toFixed(1)} ${ly.toFixed(1)})"/>`;
        s += `<ellipse cx="${rx.toFixed(1)}" cy="${ly.toFixed(1)}" rx="3.2" ry="6.4" fill="${i % 2 ? "#6ea05a" : "#8ac06e"}" transform="rotate(${(-rot + 14).toFixed(0)} ${rx.toFixed(1)} ${ly.toFixed(1)})"/>`;
      }
      return s;
    }
    case "crown": return `<path d="M40 30 L43 11 L52 22 L60 6 L68 22 L77 11 L80 30 Z" fill="url(#${u}gold)" stroke="#7a5a18" stroke-width="1"/><rect x="40" y="28" width="40" height="5.5" rx="2" fill="url(#${u}gold)" stroke="#7a5a18" stroke-width="1"/><circle cx="60" cy="16" r="2.6" fill="#e0402f"/><circle cx="48.5" cy="24" r="1.8" fill="#3a8bd8"/><circle cx="71.5" cy="24" r="1.8" fill="#3a8bd8"/>`;
    case "halo": return `<ellipse cx="60" cy="11" rx="20" ry="5.6" fill="none" stroke="#7a5a18" stroke-width="5" opacity=".35"/><ellipse cx="60" cy="10" rx="20" ry="5.6" fill="none" stroke="url(#${u}gold)" stroke-width="3.6"/><ellipse cx="60" cy="10" rx="20" ry="5.6" fill="none" stroke="#fff3c4" stroke-width="1" opacity=".7"/>`;
    case "glasses": return `<circle cx="50" cy="54" r="9" fill="#cfe9ff" fill-opacity=".14" stroke="#1d222c" stroke-width="2"/><circle cx="70" cy="54" r="9" fill="#cfe9ff" fill-opacity=".14" stroke="#1d222c" stroke-width="2"/><path d="M59 53 Q60 51.5 61 53 M41 52 L36 50 M79 52 L84 50" stroke="#1d222c" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M44 49 L48 46" stroke="#fff" stroke-width="1.4" opacity=".5" stroke-linecap="round"/>`;
    case "shades": return `<path d="M40 49 H59 V57 C59 62 54 64 50 64 C44 64 40 60 40 55 Z M61 49 H80 V55 C80 60 76 64 70 64 C66 64 61 62 61 57 Z" fill="url(#${u}lens)" stroke="#0f1218" stroke-width="1.6" stroke-linejoin="round"/><path d="M59 52 H61 M40 51 L35 49 M80 51 L85 49" stroke="#0f1218" stroke-width="2" stroke-linecap="round"/><path d="M43 52 L50 52 M64 52 L71 52" stroke="#fff" stroke-width="1.2" opacity=".35" stroke-linecap="round"/>`;
    case "visor": return `<path d="M36 49 C48 45 72 45 84 49 L84 59 C72 63 48 63 36 59 Z" fill="url(#${u}visor)" stroke="#0c2a2c" stroke-width="1.4"/><path d="M42 53 H78" stroke="#c8fff6" stroke-width="1.3" opacity=".8" stroke-linecap="round"/><path d="M38 51 L58 49.6" stroke="#fff" stroke-width="1" opacity=".5"/>`;
    case "beard": return `<path d="M36.5 56 C35 78 46 88 60 88 C74 88 85 78 83.5 56 C81 69 73 73.5 60 73.5 C47 73.5 39 69 36.5 56 Z" fill="${dark(hc, 0.08)}"/><path d="M49 70 Q60 66 71 70" fill="none" stroke="${dark(hc, 0.35)}" stroke-width="1" opacity=".5"/>`;
    case "stache": return `<path d="M47 67 C51 61.5 57.5 63.5 60 66.5 C62.5 63.5 69 61.5 73 67 C69 71.5 62.5 69 60 69 C57.5 69 51 71.5 47 67 Z" fill="${dark(hc, 0.08)}"/>`;
    case "earring": return `<circle cx="36.8" cy="62.5" r="2.5" fill="none" stroke="#e5c36a" stroke-width="1.5"/>`;
    case "chain": return `<path d="M43 105 C47 122 73 122 77 105" fill="none" stroke="#7a5a18" stroke-width="3.2" stroke-linecap="round" opacity=".5"/><path d="M43 104 C47 121 73 121 77 104" fill="none" stroke="url(#${u}gold)" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="3 1.2"/><circle cx="60" cy="118" r="4.4" fill="url(#${u}gold)" stroke="#7a5a18" stroke-width=".8"/><path d="M60 115 V121 M57 118 H63" stroke="#7a5a18" stroke-width=".9"/>`;
    case "medal": return `<path d="M50 104 L58 132 M70 104 L62 132" stroke="#d9552b" stroke-width="5" stroke-linecap="round"/><path d="M50 104 L58 132" stroke="#fff" stroke-width="1.4" opacity=".5"/><circle cx="60" cy="136" r="9" fill="url(#${u}gold)" stroke="#7a5a18" stroke-width="1.1"/><circle cx="60" cy="136" r="5.8" fill="none" stroke="#7a5a18" stroke-width=".9" opacity=".7"/><path d="M60 131.8 L61.3 134.6 L64.3 135 L62.1 137 L62.7 140 L60 138.5 L57.3 140 L57.9 137 L55.7 135 L58.7 134.6 Z" fill="#fff3c4"/>`;
    default: return "";
  }
}

/** Zeichnet einen Charakter als SVG-Element. opt: size (Pixel), head (nur Kopf), mood ("joy"), plain (ohne Hintergrund). */
export function charSVG(cfg, opt = {}) {
  const u = "ch" + (++counter);
  const [sl, sd] = SKIN[cfg.s];
  const hc = HAIR_COL[cfg.c], oc = OUT_COL[cfg.k];
  const acc = new Set(cfg.a);
  const size = opt.size || 96;
  const head = !!opt.head;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", head ? "24 12 72 78" : "0 0 120 150");
  svg.setAttribute("class", "chr" + (head ? " chrHead" : ""));
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-hidden", "true");
  if (head) { svg.setAttribute("width", size); svg.setAttribute("height", size); }
  else { svg.setAttribute("width", Math.round(size * 0.8)); svg.setAttribute("height", size); }

  const headAcc = ACCS.filter((a) => acc.has(a.id));
  const behind = headAcc.filter((a) => a.id === "headphones").map((a) => accMarkup(a.id, oc, hc, u)).join("");
  const front = headAcc.filter((a) => a.id !== "headphones" && a.slot !== "neck").map((a) => accMarkup(a.id, oc, hc, u)).join("");
  const neckAcc = headAcc.filter((a) => a.slot === "neck").map((a) => accMarkup(a.id, oc, hc, u)).join("");
  const hatCovers = acc.has("cap") || acc.has("beanie");

  const defs =
    `<defs>` +
    `<radialGradient id="${u}hg" cx=".36" cy=".3" r=".9"><stop offset="0" stop-color="${sl}"/><stop offset=".62" stop-color="${mix(sl, sd, 0.55)}"/><stop offset="1" stop-color="${sd}"/></radialGradient>` +
    `<linearGradient id="${u}body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(sl, sd, 0.45)}"/><stop offset="1" stop-color="${sd}"/></linearGradient>` +
    `<linearGradient id="${u}neck" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${dark(sd, 0.38)}"/><stop offset="1" stop-color="${sd}"/></linearGradient>` +
    `<linearGradient id="${u}vol" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".38"/><stop offset=".28" stop-color="#000" stop-opacity="0"/><stop offset=".72" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></linearGradient>` +
    `<linearGradient id="${u}gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b0"/><stop offset=".45" stop-color="#e5b94f"/><stop offset="1" stop-color="#a87a1c"/></linearGradient>` +
    `<radialGradient id="${u}ring" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd98a" stop-opacity=".1"/><stop offset="1" stop-color="#ffd98a" stop-opacity=".9"/></radialGradient>` +
    `<linearGradient id="${u}spot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d8" stop-opacity=".55"/><stop offset="1" stop-color="#fff6d8" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="${u}fire" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#e0402f"/><stop offset=".55" stop-color="#ff8a3c"/><stop offset="1" stop-color="#ffd27a"/></linearGradient>` +
    `<linearGradient id="${u}bolt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7ff3e3"/><stop offset="1" stop-color="#36a6d6"/></linearGradient>` +
    `<linearGradient id="${u}lens" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a4254"/><stop offset=".5" stop-color="#14181f"/><stop offset="1" stop-color="#0a0c10"/></linearGradient>` +
    `<linearGradient id="${u}visor" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1c8d86"/><stop offset=".5" stop-color="#36d6c4"/><stop offset="1" stop-color="#1c8d86"/></linearGradient>` +
    `</defs>`;

  const headShape =
    `<ellipse cx="36.4" cy="56" rx="3.8" ry="6" fill="${mix(sl, sd, 0.5)}"/><ellipse cx="83.6" cy="56" rx="3.8" ry="6" fill="${mix(sl, sd, 0.6)}"/>` +
    `<path d="M60 26 C75 26 84 38 84 54 C84 70 75 82 60 82 C45 82 36 70 36 54 C36 38 45 26 60 26 Z" fill="url(#${u}hg)"/>` +
    `<path d="M40 64 C44 80 76 80 80 64 C76 74 66 78 60 78 C54 78 44 74 40 64 Z" fill="${sd}" opacity=".35"/>` +
    `<ellipse cx="49" cy="38" rx="9" ry="5.5" fill="#fff" opacity=".13" transform="rotate(-22 49 38)"/>`;

  const body = head ? "" :
    `<ellipse cx="60" cy="149" rx="46" ry="4" fill="#000" opacity=".22"/>` +
    `<path d="M52 72 L52 100 C52 108 68 108 68 100 L68 72 Z" fill="url(#${u}neck)"/>` + torsoMarkup(cfg.o, oc, sl, sd, u) +
    `<ellipse cx="60" cy="91" rx="8.4" ry="5" fill="#000" opacity=".24"/>`;

  const bg = head || opt.plain ? "" : bgMarkup(cfg.b, u);
  const hairLayer = hatCovers ? "" : hairFront(cfg.h, hc);
  const hairBehind = hatCovers && cfg.h === 3 ? "" : hairBack(cfg.h, hc);

  svg.innerHTML = defs + `<g class="chrBody">` + bg + `<g class="chrFig">` + body + `<g transform="translate(0 6)">` + hairBehind + behind + headShape + faceMarkup(cfg, opt.mood || "", u, sl, sd) + hairLayer + front + `</g>` + neckAcc + `</g></g>`;
  return svg;
}
