// THE OPERATIONAL DASHBOARD (Miguel, 13 Oct 2026: "redesign this dashboard .. items that would allow Rita to monitor
// and make decisions"; mock-up B v4 "each fact once", approved with "deploy"). Pure: it reads the Keyman board the
// console already computes (rotationSections) plus a few small reads, and returns what the page draws. It decides
// nothing about a contract: every date, status and verdict is the board's (§10d, §11); this module only sorts them
// into the questions Rita asks — which seat is past its sign-off, who has no reliever, whose reliever cannot sail,
// what happens in the next 14 days, what TDG has to correct. Each fact is said ONCE on the page; the top tiles are
// the headline and point at the one place that holds the detail. Nothing here is money (§1) or billing (§10b).
import { shipCode } from "./ship_codes.js";

const DAY = 864e5;
const t = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const daysBetween = (a, b) => Math.round((t(b) - t(a)) / DAY);
export const addDays = (iso, n) => new Date(t(iso) + n * DAY).toISOString().slice(0, 10);
const iso = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
const surname = (name) => { const p = String(name || "").trim().split(/\s+/); return p.length ? p[p.length - 1] : ""; };

export const WINDOW_CHANGES = 90;  // the crew-change list (Miguel: "the crew change is the next 90 days")
export const WINDOW_DUE = 30;      // travel and the sign-off kit are due in the last 30 days
export const WINDOW_AGENDA = 14;   // the calendar strip
export const BENCH_MIN = 42, BENCH_MAX = 183; // home six weeks to six months (the earmark bench, §10d)
const REQUIRED_DOCS = [["med", "Medical"], ["sirb", "Seaman's book"], ["pp", "Passport"], ["usv", "US visa"]]; // Schengen is optional
const DOC_NAMES = { "seaman's book": "Seaman's book", "us c1/d visa": "US visa", "us visa": "US visa", medical: "Medical", passport: "Passport", schengen: "Schengen" };
const docName = (d) => DOC_NAMES[String(d || "").toLowerCase()] || String(d || "");

// A reliever's documents read against THEIR contract (the board's contractDocBadge): expired or required and missing
// = cannot sail; lapsing before the sign-off = sails but must renew. Null = nothing to say.
export function relieverDocs(docs) {
  if (!docs || !docs.worst || docs.worst === "ok") return null;
  const bad = (docs.items || []).map((i) => docName(i.doc));
  const due = (docs.expiringItems || []).map((i) => docName(i.doc));
  if (bad.length) return { kind: "bad", label: bad[0] + (bad.length > 1 ? " +" + (bad.length - 1) : ""), docs: bad };
  if (docs.missing) return { kind: "bad", label: docs.missing + " missing", docs: [] };
  if (due.length) return { kind: "warn", label: due[0] + " lapses", docs: due };
  return null;
}

// The cards on a hull that are not its seat: Rita's earmarks (projections) and a card whose sign-on has passed while
// the file does not have that crew aboard (drawn yellow on the board, kept in `crew` as non-current).
function earmarksOf(sec) {
  const extra = (sec.crew || []).filter((c) => !c.current && (c.assignment_id || c.status === "Earmarked"));
  return (sec.projections || []).concat(extra);
}

function relieverFor(seat, earmarks) {
  let e = null;
  if (seat.reliever && seat.reliever.sc) e = earmarks.find((x) => x.agency_id === seat.reliever.sc) || null;
  if (!e) {
    const after = earmarks.filter((x) => x.agency_id !== seat.agency_id && (!x.signOn || !seat.signOn || x.signOn >= seat.signOn))
      .sort((a, b) => String(a.signOn || "9999").localeCompare(String(b.signOn || "9999")));
    e = after[0] || null;
  }
  return e;
}

const tdgHas = (e, ship) => !!(e && ((e.registry && e.registry.verdict === "earmarked") || (e.file && e.file.status === "Earmarked" && e.file.ship === ship)));

export function buildOps(input) {
  const { today, sections = [], pool = [], sources = {}, issues = [], dash = {}, queue = {}, crew = [], kit = {} } = input || {};
  const crewBy = {}; for (const c of crew) crewBy[c.sc] = c;
  // The surname as the roster keeps it ("Dela Rosa"), never the last word of the full name.
  const sn = (name, sc) => (sc && crewBy[sc] && crewBy[sc].last) || surname(name);
  const sentAfter = (rows, sc, from) => (rows || []).some((r) => r.sc === sc && (!from || String(r.requested_at || "").slice(0, 10) >= from));

  // ---- the seats, their relievers, and the crew-change rows
  const rows = [], fixes = [], coverage = {}, docsAboard = { expired: [], lapses: [] };
  const people = {}; // sc -> code, for the birthdays (the rotation: aboard, earmarked, ashore)
  let aboard = 0, earmarkTotal = 0, earmarkInTdg = 0; const doubled = [];
  for (const sec of sections) {
    const code = shipCode(sec.ship), seats = (sec.crew || []).filter((c) => c.current), ems = earmarksOf(sec);
    aboard += seats.length;
    if (seats.length > 1) doubled.push(code);
    for (const e of ems) { earmarkTotal++; if (tdgHas(e, sec.ship)) earmarkInTdg++; if (e.agency_id) people[e.agency_id] = people[e.agency_id] || code; }
    let past = false; const ends = [];
    for (const s of seats) {
      if (s.agency_id) people[s.agency_id] = code;
      // TDG still has them On board past a sign-off the board knows (held, §10d), or aboard with no embark date:
      // both are TDG's to correct, listed once in the TDG card and never as a crew change.
      if (s.heldByFile) {
        const other = seats.find((o) => o !== s && o.signOn);
        fixes.push({ code, ship: sec.ship, sc: s.agency_id, name: s.name, surname: sn(s.name, s.agency_id), kind: "held", off: s.signOff || null, by: other ? sn(other.name, other.agency_id) : null, byOn: other ? other.signOn : null });
        continue;
      }
      if (!s.signOn) fixes.push({ code, ship: sec.ship, sc: s.agency_id, name: s.name, surname: sn(s.name, s.agency_id), kind: "undated" });
      if (s.signOff) ends.push(s.signOff);
      // documents of the crew at sea, read against this contract (Schengen optional)
      const cr = crewBy[s.agency_id];
      if (cr && cr.docs) for (const [k, label] of REQUIRED_DOCS) {
        const exp = iso(cr.docs[k]); if (!exp) continue;
        const item = { code, ship: sec.ship, sc: s.agency_id, name: s.name, surname: sn(s.name, s.agency_id), doc: label, exp, off: s.signOff || null };
        if (exp < today) docsAboard.expired.push(item);
        else if (s.signOff && exp < s.signOff) docsAboard.lapses.push(item);
      }
      if (!s.signOff) continue;
      const overdue = s.signOff < today;
      if (overdue) past = true;
      const d = daysBetween(today, s.signOff);
      if (!overdue && d > WINDOW_CHANGES) continue;
      const e = relieverFor(s, ems);
      const soon = !overdue && d <= WINDOW_DUE;
      const rel = e ? {
        name: e.name, surname: sn(e.name, e.agency_id), sc: e.agency_id || null, signOn: e.signOn || null,
        tdg: tdgHas(e, sec.ship), told: !!e.deployedAt,
        passed: !!(e.signOn && e.signOn < today),
        docs: relieverDocs(e.docs),
      } : null;
      const travel = soon ? { eccr: !!s.eccr, air: !!s.air, hotel: !!s.hotel } : null;
      const kitSent = soon ? { instructions: sentAfter(kit.instr, s.agency_id, s.signOn), link: sentAfter(kit.link, s.agency_id, s.signOn) } : null;
      const mark = (s.offConfirmed || s.offSource === "tdg" || s.offSource === "rita") ? "ok" : (s.offSource === "projected" ? "proj" : "");
      let next = "";
      if (!rel) next = "Pick from bench";
      else if (overdue) next = rel.passed ? "Confirm " + rel.surname + "'s sign-on" : "Check the dates";
      else if (!rel.tdg) next = rel.told ? "Waiting on TDG" : "Not in TDG yet";
      else if (rel.docs) next = "Chase " + (rel.docs.docs[0] || "documents").toLowerCase().replace(/^us /, "US ");
      else if (travel && !(travel.eccr && travel.air && travel.hotel)) next = "Book " + ["ECCR", "flight", "hotel"].filter((x, i) => ![travel.eccr, travel.air, travel.hotel][i]).join(", ");
      else if (kitSent && !(kitSent.instructions && kitSent.link)) next = "Send sign-off kit";
      rows.push({
        code, ship: sec.ship, brand: sec.brand, sc: s.agency_id, name: s.name, surname: sn(s.name, s.agency_id),
        off: s.signOff, days: d, overdue, mark, reliever: rel, travel, kit: kitSent, soon, next,
        group: overdue ? "overdue" : s.signOff.slice(0, 7),
      });
    }
    for (const e of ems) if (e.signOff) ends.push(e.signOff);
    const until = ends.length ? ends.sort().pop() : null;
    const dd = until ? daysBetween(today, until) : null;
    const tier = (past || dd == null || dd < 0) ? "past" : dd < 60 ? "lt2" : dd < 120 ? "lt4" : "ok";
    (coverage[sec.brand] = coverage[sec.brand] || []).push({ code, ship: sec.ship, tier, until: past ? (seats.find((s) => s.signOff && s.signOff < today) || {}).signOff || until : until });
  }
  rows.sort((a, b) => (a.overdue !== b.overdue ? (a.overdue ? -1 : 1) : (a.overdue ? a.off.localeCompare(b.off) : a.off.localeCompare(b.off))));

  // ---- the bench: crew ashore and when each is ready for a seat (home 6 weeks to 6 months, the bench rule)
  const homeBy = {};
  for (const sec of sections) for (const r of ((sec.bench && sec.bench.rows) || [])) {
    if (r.aboardShip || !r.homeFrom || !r.sc) continue;
    if (!homeBy[r.sc] || r.homeFrom > homeBy[r.sc].homeFrom) homeBy[r.sc] = { sc: r.sc, name: r.name, surname: sn(r.name, r.sc), code: shipCode(r.lastShip), homeFrom: r.homeFrom };
  }
  for (const p of pool) if (p.agency_id && !people[p.agency_id]) people[p.agency_id] = homeBy[p.agency_id] ? homeBy[p.agency_id].code : shipCode((crewBy[p.agency_id] || {}).vessel);
  for (const sc of Object.keys(homeBy)) people[sc] = people[sc] || homeBy[sc].code;
  const benchList = Object.values(homeBy).map((h) => Object.assign({}, h, { ready: addDays(h.homeFrom, BENCH_MIN), until: addDays(h.homeFrom, BENCH_MAX) }));
  const readyNow = benchList.filter((b) => b.ready <= today && today <= b.until).sort((a, b) => a.ready.localeCompare(b.ready));
  const readyNext = benchList.filter((b) => b.ready > today).sort((a, b) => a.ready.localeCompare(b.ready));
  const wf = dash.workforce || {};
  const ashore = (wf.on_vacation || 0) + (wf.reserved || 0);

  // ---- the next 14 days
  const end = addDays(today, WINDOW_AGENDA - 1), inWin = (d) => d && d >= today && d <= end;
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const days = []; for (let i = 0; i < WINDOW_AGENDA; i++) { const d = addDays(today, i); days.push({ date: d, dow: DOW[new Date(t(d)).getUTCDay()], items: [] }); }
  const put = (d, item) => { const day = days.find((x) => x.date === d); if (day) day.items.push(item); };
  const summary = { change: 0, file: 0, score: 0, bench: 0, bday: 0 };
  for (const r of rows) {
    if (r.overdue) continue;
    if (inWin(r.off)) { put(r.off, { kind: "off", code: r.code, title: r.name + " signs off " + r.ship }); summary.change++; }
    if (r.reliever && inWin(r.reliever.signOn)) put(r.reliever.signOn, { kind: "on", code: r.code, title: r.reliever.name + " signs on " + r.ship });
  }
  for (const q of (queue.recent || [])) {
    const fb = q.feedback || {}; const asked = Object.values(fb).some((v) => v && v !== "none");
    if (!asked) { put(today, { kind: "score", code: shipCode(q.ship || q.vessel), title: q.name + " signed off " + (q.ship || "") + " " + (q.signOff || "") + ": feedback not asked" }); summary.score++; }
  }
  const advq = sources.registry && iso(sources.registry.at);
  if (advq) {
    const due = addDays(advq, 7);
    if (due < today) { put(today, { kind: "file", code: "", label: "TDG file late", title: "The last AdvancedQuery is from " + advq }); summary.file++; }
    else if (inWin(due)) { put(due, { kind: "file", code: "", label: "TDG file", title: "AdvancedQuery due (weekly; the last one is from " + advq + ")" }); summary.file++; }
  }
  for (const b of benchList) if (inWin(b.ready)) { put(b.ready, { kind: "bench", code: b.code, title: b.name + ": six weeks home, ready for a seat" }); summary.bench++; }
  for (const c of crew) {
    if (!c.dob || !people[c.sc]) continue;
    const md = String(c.dob).slice(5, 10); if (md.length !== 5) continue;
    const y = +today.slice(0, 4), cand = [y + "-" + md, (y + 1) + "-" + md].find(inWin);
    if (cand) { put(cand, { kind: "bday", code: people[c.sc], title: [c.first, c.last].filter(Boolean).join(" ") + " · birthday" }); summary.bday++; }
  }
  const ORDER = { off: 0, on: 1, score: 2, file: 3, bench: 4, bday: 5 };
  for (const d of days) d.items.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  const after = rows.filter((r) => !r.overdue && r.off > end).slice(0, 2).map((r) => ({ code: r.code, off: r.off }));

  // ---- the headline tiles: each points at the one place that holds the detail
  const overdueRows = rows.filter((r) => r.overdue), coming = rows.filter((r) => !r.overdue);
  const nobody = coming.filter((r) => !r.reliever);
  const withRel = coming.filter((r) => r.reliever), cantSail = withRel.filter((r) => r.reliever.docs); // relievers still to join
  const kpis = {
    overdue: { n: overdueRows.length, items: overdueRows.map((r) => ({ code: r.code, days: -r.days })) },
    noReliever: { n: nobody.length, of: coming.length, first: nobody.slice(0, 2).map((r) => ({ code: r.code, off: r.off })) },
    cantSail: { n: cantSail.length, of: withRel.length, first: cantSail[0] ? { code: cantSail[0].code, on: cantSail[0].reliever.signOn || cantSail[0].off } : null },
    aboard: { n: aboard, ships: sections.length, doubled },
    bench: { ready: readyNow.length, ashore, now: readyNow.slice(0, 2), next: readyNext.slice(0, 2) },
  };
  const counts = { all: rows.length, overdue: overdueRows.length, nobody: rows.filter((r) => !r.reliever).length, docs: cantSail.length, soon: coming.filter((r) => r.soon).length };

  // ---- fleet coverage, one tile per ship, the most urgent first
  const TIER = { past: 0, lt2: 1, lt4: 2, ok: 3 };
  const BRANDS = ["Royal", "Celebrity", "Azamara"];
  const bi = (b) => { const i = BRANDS.indexOf(b); return i < 0 ? 9 : i; };
  const brands = Object.keys(coverage).sort((a, b) => bi(a) - bi(b)).map((b) => ({
    brand: b, tiles: coverage[b].sort((x, y) => TIER[x.tier] - TIER[y.tier] || String(x.until || "").localeCompare(String(y.until || ""))),
  }));
  const tiers = { past: 0, lt2: 0, lt4: 0, ok: 0 }; for (const b of brands) for (const x of b.tiles) tiers[x.tier]++;

  // ---- TDG: the files the board reads, and what TDG has to correct
  const age = (d) => (d ? daysBetween(d, today) : null);
  const tdg = {
    advq: advq ? { at: advq, age: age(advq), every: 7, crew: (sources.registry || {}).crew || null, dated: (sources.registry || {}).dated || null } : null,
    count: sources.count && iso(sources.count.as_of) ? { asOf: iso(sources.count.as_of), age: age(iso(sources.count.as_of)), every: 30 } : null,
    counter: { stamp: (sources.counter && iso(sources.counter.stamp)) || null },
    fixes, earmarks: { agree: earmarkInTdg, total: earmarkTotal }, issues: (issues || []).length,
  };
  docsAboard.expired.sort((a, b) => a.exp.localeCompare(b.exp)); docsAboard.lapses.sort((a, b) => a.exp.localeCompare(b.exp));

  return {
    today, kpis,
    calendar: { days, summary, after },
    changes: { rows, counts },
    coverage: { brands, tiers },
    tdg, docsAboard,
    crew: wf, travel: dash.travel || null,
  };
}
