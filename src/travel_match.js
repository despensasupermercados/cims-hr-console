// Travel ledger → crew registry name bridge — pure.
//
// Rita's travel workbook names people by hand: "Paqueo, Bernard", "Villfranca, Dave", "Espenilla, Zandro (Orlando)",
// "Marto ryan", "Edelmar, Doctolero", "Manligas, Oscar (NCL prep.)". The registry (TDG's AdvancedQuery) carries
// "Paqueo" / "Bernard Winzon". Until 15 Oct 2026 the profile joined the two on the EXACT string
// lower(last_name || ', ' || first_name): 47% of the crew spend reached a profile, the rest went nowhere.
//
// Rules, in order (the first that gives exactly ONE crew wins; two crew = ambiguous, never a guess — §6):
//   1. surname exact (accents / case / punctuation ignored) and a first-name token agrees (exact, a 4+ letter prefix,
//      or one typo — Damerau-Levenshtein 1: Alen/Allen, Joemar/Jomar, Jedrig/Jeadrig, Queeencel/Queencel);
//   2. surname exact and the crew is the ONLY one with that surname (a missing or nicknamed first name:
//      "Dela Rosa (Tampa)", "Valderrama, Frey");
//   3. surname one typo away (5+ letters) and a first-name token agrees (Villfranca, Eginsaban, Erasmas, Murillio,
//      Tolentiono, Esenilla, Quming, Villacortez, Rezes, Bastos);
//   4. the two halves swapped ("Edelmar, Doctolero", "Vincent, Esteban", "Rondy, Emil" → JOSEPH Emil Rondy);
//   5. no comma: "Osorio Norman" / "Marto ryan" / "Imperial Raymond" — tried as "Last First" then "First Last".
// A parenthesised or trailing note never takes part in the match; a note naming NCL tags the row's client as NCL
// (Miguel, 15 Oct 2026: "we shouldn't keep them out of the NCL because it's moving forward").
//
// Nothing here is money (§1). The bridge serves the Travel tab and the profile's travel section only.

const CELEBRITY = new Set(["apex", "ascent", "beyond", "constellation", "eclipse", "edge", "equinox", "infinity", "millennium",
  "reflection", "silhouette", "solstice", "summit", "xcel"]);

export const fold = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const letters = (s) => fold(s).replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();

// "Espenilla, Zandro (Orlando)" → { last:"espenilla", first:["zandro"], note:"Orlando", ncl:false, comma:true }
export function cleanTravelName(raw) {
  let s = String(raw == null ? "" : raw).trim();
  const notes = [];
  s = s.replace(/\(([^)]*)\)?/g, (_, n) => { notes.push(n.trim()); return " "; });
  const ncl = notes.some((n) => /\bncl\b/i.test(n)) || /\bncl\b/i.test(s);
  // trailing notes outside brackets: "Ramos, Darryl (FLL) 1/11", "Vicedo, Manuel (Lima) 3 stops", "Estandian, Mark joins in Jan 2026"
  s = s.replace(/\b\d{1,2}\/\d{1,2}\b.*$/, " ").replace(/\b\d+\s+stops?\b.*$/i, " ").replace(/\bjoins?\b.*$/i, " ").replace(/\bNH\b/g, " ");
  const comma = s.includes(",");
  const [a, b] = comma ? s.split(",", 2) : [s, ""];
  const last = letters(a), first = letters(b).split(" ").filter(Boolean);
  return { last, first, note: notes.join(" · ") || null, ncl, comma, words: letters(s).split(" ").filter(Boolean) };
}

// Damerau-Levenshtein (optimal string alignment) distance, capped: enough for one typo, one swap.
export function editDistance(a, b, cap = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const m = a.length, n = b.length, d = [];
  for (let i = 0; i <= m; i++) { d[i] = [i]; }
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

const tokenAgrees = (t, crewTokens) => crewTokens.some((c) => c === t || (t.length >= 4 && c.startsWith(t)) || (t.length >= 4 && c.length >= 4 && editDistance(t, c, 1) <= 1));
const firstAgrees = (first, crewTokens) => first.length === 0 ? null : first.some((t) => tokenAgrees(t, crewTokens));

// The roster, indexed once per request: surname → crew rows (with folded name tokens).
export function buildCrewIndex(crew) {
  const rows = (crew || []).filter((c) => c && c.agency_id && c.last_name).map((c) => ({
    agency_id: c.agency_id, last: letters(c.last_name), first: letters(c.first_name).split(" ").filter(Boolean),
    name: [c.first_name, c.last_name].filter(Boolean).join(" "),
  }));
  const byLast = new Map();
  for (const r of rows) { if (!byLast.has(r.last)) byLast.set(r.last, []); byLast.get(r.last).push(r); }
  return { rows, byLast };
}

const one = (arr, how) => (arr.length === 1 ? { agency_id: arr[0].agency_id, name: arr[0].name, how } : arr.length > 1 ? { agency_id: null, how: "ambiguous", candidates: arr.map((r) => r.name) } : null);

function tryLastFirst(last, first, ix) {
  if (!last) return null;
  const same = ix.byLast.get(last) || [];
  if (same.length) {
    const agree = same.filter((r) => firstAgrees(first, r.first) === true);
    const hit = one(agree, "exact"); if (hit) return hit;
    if (first.length === 0 || !same.some((r) => firstAgrees(first, r.first) === true)) { const h = one(same, first.length ? "surname" : "surname"); if (h && h.agency_id) return h; if (h) return h; }
  }
  if (last.length >= 5) {
    const close = ix.rows.filter((r) => r.last !== last && editDistance(r.last, last, 1) <= 1 && firstAgrees(first, r.first) === true);
    const hit = one(close, "fuzzy"); if (hit) return hit;
  }
  return null;
}

// One travel name against the roster. Returns { agency_id, name, how } or { agency_id:null, how:'none'|'ambiguous', candidates? }.
export function matchTravelName(raw, ix) {
  const c = cleanTravelName(raw);
  if (!c.words.length) return { agency_id: null, how: "none" };
  const tried = [];
  if (c.comma) {
    tried.push(tryLastFirst(c.last, c.first, ix));
    if (!(tried[0] && tried[0].agency_id) && c.first.length) {
      // swapped halves: "Edelmar, Doctolero" — the surname sits after the comma
      const sw = tryLastFirst(c.first.join(" "), c.last.split(" ").filter(Boolean), ix) || tryLastFirst(c.first[c.first.length - 1], c.last.split(" ").filter(Boolean), ix);
      if (sw && sw.agency_id) return { ...sw, how: "swapped" };
      tried.push(sw);
    }
  } else {
    const w = c.words;
    // "Dela Rosa (Tampa)" / "De Leon": the whole phrase as a surname first
    if (w.length > 1) { const whole = tryLastFirst(w.join(" "), [], ix); if (whole && whole.agency_id) return whole; }
    // "Osorio Norman" (Last First) then "Lawrence Dexter" (First Last); a single word is a surname only
    tried.push(tryLastFirst(w[0], w.slice(1), ix));
    if (!(tried[0] && tried[0].agency_id) && w.length > 1) { const sw = tryLastFirst(w[w.length - 1], w.slice(0, -1), ix); if (sw && sw.agency_id) return { ...sw, how: "swapped" }; tried.push(sw); }
    if (!(tried[0] && tried[0].agency_id) && w.length > 2) { const sw = tryLastFirst(w.slice(-2).join(" "), w.slice(0, -2), ix); if (sw && sw.agency_id) return { ...sw, how: "swapped" }; }
  }
  const hit = tried.find((t) => t && t.agency_id); if (hit) return hit;
  const amb = tried.find((t) => t && t.how === "ambiguous"); if (amb) return amb;
  // "Rondy, Emil" / "Emil, Rondy": every word is a first-name token of ONE crew (JOSEPH, Emil Rondy) — the surname was never typed
  const allFirst = ix.rows.filter((r) => c.words.length >= 2 && c.words.every((t) => r.first.includes(t)));
  const af = one(allFirst, "swapped"); if (af) return af;
  return { agency_id: null, how: "none" };
}

// The cruise line a ledger row belongs to: NCL by the note, else the hull's brand, else null (shoreside, unknown).
// Not shipname.clientOf: Rita's rows read "Apex", "Summit" with no brand word, which that helper reads as Royal.
export function travelClientOf(ship, raw) {
  if (raw && cleanTravelName(raw).ncl) return "ncl";
  const s = fold(ship).trim();
  if (!s) return null;
  if (s.startsWith("azamara")) return "azamara";
  if (/\bncl\b|norwegian/.test(s)) return "ncl";
  if (CELEBRITY.has(s.replace(/^celebrity\s+/, ""))) return "celebrity";
  return "royal";
}

// Every ledger row gets agency_id (or null), match (exact / surname / fuzzy / swapped / ambiguous / none) and client.
// Names are matched once each — the ledger repeats them month after month.
export function annotateTravel(records, crew) {
  const ix = buildCrewIndex(crew);
  const memo = new Map();
  return (records || []).map((r) => {
    const k = String(r.crew_name || "");
    let m = memo.get(k);
    if (!m) { m = r.kind === "shoreside" ? { agency_id: null, how: "shoreside" } : matchTravelName(k, ix); memo.set(k, m); }
    return { ...r, agency_id: m.agency_id || null, match: m.how, crew_display: m.name || null, client: r.kind === "shoreside" ? "shoreside" : travelClientOf(r.ship, k) };
  });
}

// The cruise line of a ledger row that carries no ship (Miguel, 20 Oct 2026: "Use TDG's bill"). Every row Rita loaded
// before 15 Oct 2026 has a NULL ship, so only NCL-tagged names had a line. TDG's bill names the brand for each person
// and month: the same person on the bill that month (else the month before or after) under ONE brand gives the row
// that brand, `client_src = "bill"`. Two brands, or nobody on the bill, leaves it null ("Not placed") — never a guess.
// A ship on the row (a re-upload of Rita's workbook) always wins. `billLines`: { year, month, crew_name, brand }.
export function clientFromBill(records, billLines, crew) {
  const ix = buildCrewIndex(crew);
  const memo = new Map();
  const by = new Map(); // agency_id -> Map("y-m" -> Set(brand))
  for (const l of billLines || []) {
    if (!l || !l.brand || !l.crew_name) continue;
    let m = memo.get(l.crew_name);
    if (!m) { m = matchTravelName(l.crew_name, ix); memo.set(l.crew_name, m); }
    if (!m.agency_id) continue;
    const k = l.year + "-" + l.month;
    if (!by.has(m.agency_id)) by.set(m.agency_id, new Map());
    const mm = by.get(m.agency_id);
    if (!mm.has(k)) mm.set(k, new Set());
    mm.get(k).add(String(l.brand).toLowerCase());
  }
  const near = (y, mo, d) => { const t = y * 12 + (mo - 1) + d; return Math.floor(t / 12) + "-" + ((t % 12) + 1); };
  return (records || []).map((r) => {
    if (r.client || r.kind === "shoreside" || !r.agency_id || !by.has(r.agency_id)) return r;
    const mm = by.get(r.agency_id);
    const same = mm.get(near(r.year, r.month, 0));
    let set = same;
    if (!set) { set = new Set(); for (const d of [-1, 1]) for (const b of (mm.get(near(r.year, r.month, d)) || [])) set.add(b); }
    return set && set.size === 1 ? { ...r, client: [...set][0], client_src: "bill" } : r;
  });
}

// For the profile: every ledger row that belongs to this crew. The candidate rows are those whose folded surname
// is within one typo of the crew's (the caller pre-filters by SQL on the first letters; this is the final word).
export function travelRowsFor(records, crewRow, crew) {
  const ann = annotateTravel(records, crew);
  return ann.filter((r) => r.agency_id === crewRow.agency_id);
}

// The names the roster could not place, with how often and how much — Rita's clean-up list.
export function unmatchedTravel(annotated) {
  const out = new Map();
  for (const r of annotated) {
    if (r.kind === "shoreside" || r.agency_id) continue;
    const k = r.crew_name;
    const o = out.get(k) || { crew_name: k, rows: 0, total: 0, how: r.match, years: new Set() };
    o.rows += 1; o.total = Math.round((o.total + (+r.total || 0)) * 100) / 100; o.years.add(r.year);
    out.set(k, o);
  }
  return [...out.values()].map((o) => ({ ...o, years: [...o.years].sort() })).sort((a, b) => b.total - a.total);
}
