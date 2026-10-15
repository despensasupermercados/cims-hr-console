// THE SCORE CARD'S AUTOMATIC INPUTS — the reads (Miguel, 15 Oct 2026). The rules are bonus.js `autoScore` (money, §1);
// this file only fetches what they need, in ONE wave, and never writes another app's database:
//   PARTS_DB (cims-parts-orders) — orders marked "Vessel-side miss" on the crew's ship during the contract;
//   HON_DB   (cims-hon)          — the signed handover for that ship near the sign-off;
//   DB                           — Dexter's grades (audit_eval), Ray's live answers, the crew's field reports;
//   the intel engine             — whether a field report names an order-accuracy or par problem, with a QUOTE that must
//                                  be in the report word for word (otherwise no flag), kept in score_intel_flag.
// No click feed exists yet (OBP's clicks table is being added to the nightly export): mono is null = full points.
import { autoScore } from "./bonus.js";
import { buildCrewIndex, matchTravelName } from "./travel_match.js";

export const shipKey = (s) => String(s || "").toLowerCase()
  .replace(/^\s*(mv|m\/v|ms)\s+/, "").replace(/^(celebrity|azamara|royal caribbean)\s+/, "")
  .replace(/\bof the seas\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
// "Quantum, Anthem" (a transfer) is two ships: every one of them is the crew's for this contract.
export const shipKeys = (s) => [...new Set(String(s || "").split(/\s*[,;/]\s*|\s+(?:and|&)\s+/i).map(shipKey).filter(Boolean))];
const surname = (n) => String(n || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/).filter(Boolean).pop() || "";
const day = (v) => (v ? String(v).slice(0, 10) : "");
function addDays(d, n) { const t = Date.parse(day(d) + "T00:00:00Z"); return isNaN(t) ? day(d) : new Date(t + n * 86400000).toISOString().slice(0, 10); }

// The handover that closes THIS contract: same ship, signed between 30 days before the sign-off and 10 after; when HON
// names the outgoing crew, it must be this crew (surname). HON leaves the name blank on 2 of 5 signed records.
// HON's outgoing_crew_id (the SC id, on 3 of 5 signed rows on 15 Oct 2026) decides first: the same id is this crew,
// another id is not; only a row without one falls back to the surname ("Villacortes Jr." no longer fails).
export function pickHandover(rows, { ship, signOff, crewName, sc }) {
  const keys = shipKeys(ship), off = day(signOff), sn = surname(crewName);
  if (!keys.length || !off) return null;
  const lo = addDays(off, -30), hi = addDays(off, 10);
  const sameCrew = (r) => {
    if (r.outgoing_crew_id && sc) return String(r.outgoing_crew_id).trim().toUpperCase() === String(sc).trim().toUpperCase();
    if (!r.outgoing_name || !sn) return true;
    const words = String(r.outgoing_name).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[\s,]+/).filter(Boolean);
    return words.includes(sn);
  };
  const hit = (rows || []).filter((r) => keys.includes(shipKey(r.ship)) && day(r.signed_at) >= lo && day(r.signed_at) <= hi && sameCrew(r));
  hit.sort((a, b) => (a.signed_at < b.signed_at ? 1 : -1));
  return hit[0] ? { id: hit[0].id, signedAt: hit[0].signed_at } : null;
}

export const FLAG_SYSTEM = [
  "You read a short report about a ship's printer specialist and answer two questions with JSON only.",
  "accuracy: true only if the report says his ORDERS were inaccurate (wrong parts, wrong quantities, incorrect order statistics).",
  "par: true only if the report says stock or parts were NOT kept at par or not tracked / maintained.",
  "A late order, a rush shipment or poor communication on its own is neither.",
  "quote: the exact words from the report that show it, copied character for character; empty when both are false.",
  'Answer exactly: {"accuracy":false,"par":false,"quote":""}',
].join("\n");
// WHO MISSED THE ORDER (Miguel, 16 Oct 2026: "only the one who missed the order"). The Parts Portal keeps the name the
// requester typed ("Michael Resposo", "Andrea Joyce M. Calayag", "michael resposo / bernard paqueo"); the travel ledger's
// name bridge (travel_match.js, deterministic, never a guess) places each name on the roster. A miss counts against this
// crew only when one of its names is this crew (a joint order counts against each); another crew's miss on the same hull
// (the overlap of a handover) is shown and not counted; a name the roster cannot place is shown as "check who placed it"
// and not counted (§6: flag, never pick).
export function missOwner(requester, sc, ix) {
  const parts = String(requester || "").split(/\s*(?:\/|&|\band\b|;)\s*/i).map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return { mine: false, who: null, unplaced: ["(no name on the order)"], others: [] };
  const hits = parts.map((p) => ({ p, m: matchTravelName(p, ix) }));
  const mine = hits.some((h) => h.m.agency_id === sc);
  return { mine, joint: parts.length > 1, who: parts.join(" / "),
    others: hits.filter((h) => h.m.agency_id && h.m.agency_id !== sc).map((h) => h.m.name),
    unplaced: hits.filter((h) => !h.m.agency_id).map((h) => h.p) };
}
export const QUOTE_MIN = 15;
export function parseFlag(txt, source) {
  const m = String(txt || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j; try { j = JSON.parse(m[0]); } catch (e) { return null; }
  const quote = String(j.quote || "").trim();
  const acc = j.accuracy === true, par = j.par === true; // the string "false" is not a yes
  const yes = acc || par;
  // the quote is the evidence a money user reads: the report's own words, a real phrase (15+ characters, 3+ words —
  // "the" or "kept" is in every report), or nothing is flagged
  const real = quote.length >= QUOTE_MIN && quote.split(/\s+/).length >= 3;
  if (yes && (!real || String(source || "").toLowerCase().indexOf(quote.toLowerCase()) < 0)) return { accuracy: false, par: false, quote: "", refused: true };
  return { accuracy: acc, par, quote: yes ? quote : "" };
}
async function flagKey(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("flag-v1|" + String(text || "")));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
async function classify(env, text, { engine, claudeModel, workersModel }) {
  const run = (async () => {
    if (engine === "claude") {
      const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
        headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: claudeModel, max_tokens: 200, system: FLAG_SYSTEM, messages: [{ role: "user", content: String(text).slice(0, 4000) }] }) });
      if (!r.ok) return null;
      const j = await r.json(); return (j && j.content && j.content[0] && j.content[0].text) || "";
    }
    if (engine === "workersai") {
      const j = await env.AI.run(workersModel, { messages: [{ role: "system", content: FLAG_SYSTEM }, { role: "user", content: String(text).slice(0, 4000) }], max_tokens: 200 });
      return (j && (j.response || j.result || (typeof j === "string" ? j : ""))) || "";
    }
    return null;
  })().catch(() => null);
  const out = await Promise.race([run, new Promise((res) => setTimeout(() => res(null), 7000))]);
  return out == null ? null : parseFlag(out, text);
}

// WHOSE MISS IT IS (Miguel, 16 Oct 2026, the second answer: "the audit is the person who's onboard .. when u have two
// people work with the person who is currently onboard or at least the one who has been more than 4 weeks"). The board's
// ONE schedule says who was aboard the hull on the order's day; the order's typed name only breaks a tie:
//   one crew aboard                       -> theirs (whoever typed it);
//   two aboard, ONE of them 4+ weeks       -> the 4+ weeks one (a reliever typing the rescue order is not charged);
//   otherwise (both 4+ weeks — a two-printer hull — or both new) -> the one the order names, if exactly one of them;
//                                            else the longest aboard when nobody is 4+ weeks; else nobody (flagged, §6);
//   nobody aboard per the schedule (an old order, a gap in the file) -> the typed name, as before (missOwner).
export const ESTABLISHED_DAYS = 28;
const daysBetween = (a, b) => Math.round((Date.parse(day(b) + "T00:00:00Z") - Date.parse(day(a) + "T00:00:00Z")) / 86400000);
export function aboardOn(legs, ship, date) {
  const k = shipKey(ship), d = day(date), by = new Map();
  for (const l of legs || []) {
    if (!l || !l.sc || !l.on || shipKey(l.ship) !== k) continue;
    const on = day(l.on), off = day(l.off);
    if (on > d || (!l.is_current && off && off < d)) continue;
    const prev = by.get(l.sc);
    if (!prev || on < prev.on) by.set(l.sc, { sc: l.sc, name: l.name || l.sc, on });
  }
  return [...by.values()].sort((a, b) => a.on.localeCompare(b.on));
}
export function missOwnerByBoard(m, sc, ix, legs) {
  const named = missOwner(m.requester, sc, ix);
  const aboard = aboardOn(legs, m.ship, m.submitted_at || m.at);
  if (!aboard.length) return { ...named, rule: "name", why: "the schedule has nobody aboard that day; the order's name decides" };
  const d = day(m.submitted_at || m.at);
  const weeks = (a) => Math.floor(daysBetween(a.on, d) / 7);
  const est = aboard.filter((a) => daysBetween(a.on, d) >= ESTABLISHED_DAYS);
  const namedIds = new Set(String(m.requester || "").split(/\s*(?:\/|&|\band\b|;)\s*/i).map((p) => matchTravelName(p.trim(), ix).agency_id).filter(Boolean));
  let owner = null, why = "";
  if (aboard.length === 1) { owner = aboard[0]; why = "the only crew aboard"; }
  else if (est.length === 1) { owner = est[0]; why = "aboard " + weeks(est[0]) + " weeks, the other under 4"; }
  else {
    const pool = est.length ? est : aboard;
    const byName = pool.filter((a) => namedIds.has(a.sc));
    if (byName.length === 1) { owner = byName[0]; why = "named on the order, " + (est.length ? "both aboard 4+ weeks" : "both aboard under 4 weeks"); }
    else if (!est.length) { owner = aboard[0]; why = "the longest aboard, both under 4 weeks"; }
  }
  return { mine: !!owner && owner.sc === sc, who: named.who, joint: named.joint, rule: "board", why,
    owner: owner ? owner.name : null, aboard: aboard.map((a) => a.name), unplaced: owner ? [] : ["(two crew aboard 4+ weeks, the order names neither)"], others: owner && owner.sc !== sc ? [owner.name] : [] };
}
// deps: { ensure (score_intel_flag guard), engine, claudeModel, workersModel, boardLegs: async () => legs (the ONE schedule) }
// in: { sc, ship ("A" or "A, B" for a transfer), signOn, signOff, crewName, today }
export async function gatherAuto(env, { sc, ship, signOn, signOff, crewName, today }, deps = {}) {
  const on = day(signOn), offIn = day(signOff), now = day(today) || new Date().toISOString().slice(0, 10);
  const off = offIn || now; // reads stop today for a contract with no sign-off yet
  const keys = shipKeys(ship);
  const none = () => ({ results: [] });
  if (deps.ensure) await deps.ensure(env);
  // ONE wave (§12). Without a sign-on nothing dated is read; without a ship no miss or handover can be his.
  const [misses, hons, audits, intel, resp, roster, legs] = await Promise.all([
    env.PARTS_DB && on && keys.length ? env.PARTS_DB.prepare("SELECT order_ref, ship, submitted_at, grand_total, requester FROM orders WHERE order_type='missed' AND miss_reason='vessel' AND voided_at IS NULL AND submitted_at >= ? AND submitted_at <= ?").bind(on, off + "T23:59:59").all().catch(none) : none(),
    env.HON_DB && offIn && keys.length ? env.HON_DB.prepare("SELECT id, ship, outgoing_name, outgoing_crew_id, signed_at FROM handover WHERE signed_at IS NOT NULL AND signed_at >= ? AND signed_at <= ?").bind(addDays(off, -30), addDays(off, 10) + " 23:59:59").all().catch(none) : none(),
    // a TEST request's grade is a rehearsal: never a seafarer's score
    env.DB.prepare("SELECT e.visit_id, e.request_id, e.ship, e.score, e.filed_at, e.filed_by FROM audit_eval e LEFT JOIN audit_request r ON r.id = e.request_id WHERE e.agency_id=? AND COALESCE(r.test_mode, 0) = 0 ORDER BY e.filed_at DESC").bind(sc).all().catch(none),
    on ? env.DB.prepare("SELECT id, reporter, summary, ts FROM crew_intel WHERE agency_id=? AND status='filed' AND ts >= ? AND ts <= ?").bind(sc, on, off + "T23:59:59").all().catch(none) : none(),
    env.DB.prepare("SELECT r.role, r.answers_json, r.submitted_at FROM feedback_response2 r JOIN crew c ON c.id = r.crew_id WHERE c.agency_id=? AND r.superseded_at IS NULL").bind(sc).all().catch(none),
    env.PARTS_DB && on && keys.length ? env.DB.prepare("SELECT agency_id, first_name, last_name FROM crew").bind().all().catch(none) : none(),
    env.PARTS_DB && on && keys.length && deps.boardLegs ? Promise.resolve().then(deps.boardLegs).catch(() => null) : null,
  ]);
  const answers = {}; let rayAt = null;
  for (const r of resp.results || []) { try { answers[r.role] = JSON.parse(r.answers_json || "{}"); } catch (e) {} if (r.role === "ray") rayAt = r.submitted_at; }
  const ix = buildCrewIndex(roster.results || []);
  const vm = [], notMine = [];
  for (const m of (misses.results || []).filter((x) => keys.includes(shipKey(x.ship)))) {
    const o = legs ? missOwnerByBoard(m, sc, ix, legs) : missOwner(m.requester, sc, ix);
    const why = o.rule === "board" && o.why ? " (charged to " + (o.mine ? "this crew" : o.owner) + ": " + o.why + ")" : "";
    const row = { ref: m.order_ref, at: m.submitted_at, total: m.grand_total, ship: m.ship, by: (o.who || "nobody named") + why, joint: o.joint };
    if (o.mine) vm.push(row); else notMine.push({ ...row, others: o.others, unplaced: o.unplaced, rule: o.rule });
  }
  const handover = pickHandover(hons.results || [], { ship, signOff: offIn, crewName, sc });
  // field reports: classify each once (cached by the report's text), at most 4 new per open
  const reports = (intel.results || []).filter((r) => r.summary);
  const flags = [];
  let unread = 0;
  if (reports.length) {
    const keysH = await Promise.all(reports.map((r) => flagKey(r.summary)));
    const kept = new Map();
    const uniq = [...new Set(keysH)];
    for (let i = 0; i < uniq.length; i += 90) { // D1 binds at most 100 parameters per statement
      const part = uniq.slice(i, i + 90);
      const got = await env.DB.prepare("SELECT h, accuracy, par, quote FROM score_intel_flag WHERE h IN (" + part.map(() => "?").join(",") + ")").bind(...part).all().catch(none);
      for (const r of got.results || []) kept.set(r.h, r);
    }
    const miss = reports.map((r, i) => [r, keysH[i]]).filter(([, h]) => !kept.has(h)).filter(([, h], i, a) => a.findIndex(([, x]) => x === h) === i).slice(0, 4);
    await Promise.all(miss.map(async ([r, h]) => {
      if (!deps.engine || deps.engine === "none") return;
      const f = await classify(env, r.summary, deps);
      if (!f) return;
      kept.set(h, { h, accuracy: f.accuracy ? 1 : 0, par: f.par ? 1 : 0, quote: f.quote });
      await env.DB.prepare("INSERT OR IGNORE INTO score_intel_flag (h, accuracy, par, quote, engine, at) VALUES (?,?,?,?,?,?)").bind(h, f.accuracy ? 1 : 0, f.par ? 1 : 0, f.quote, deps.engine, new Date().toISOString()).run().catch(() => null);
    }));
    reports.forEach((r, i) => {
      const f = kept.get(keysH[i]);
      if (!f) { unread++; return; }
      if (f.accuracy || f.par) flags.push({ at: r.ts, accuracy: !!f.accuracy, par: !!f.par, quote: f.quote, who: r.reporter || null });
    });
  }
  // audits of THIS contract: on one of its ships (an audit of the next or previous contract on another hull is not his
  // score here); every audit of the seafarer still comes back as allAudits for the list
  const allAud = (audits.results || []).map((a) => ({ id: a.request_id, ship: a.ship, score: a.score, at: a.filed_at, open: /no sign-in/.test(String(a.filed_by || "")) }));
  const aud = keys.length ? allAud.filter((a) => keys.includes(shipKey(a.ship))) : [];
  const res = autoScore({ signOn: on, signOff: offIn, today: now, answers, rayAt, misses: vm, handover, audits: aud, flags, mono: null });
  const notes = [];
  for (const m of notMine) {
    const head = "Vessel-side miss " + m.ref + " · " + day(m.at) + " · " + (m.ship || "") + " · placed by " + m.by;
    notes.push({ factor: "sOrder", source: "Parts Portal", text: !m.unplaced.length ? head + ": another crew's miss, not counted."
      : m.rule === "board" ? head + ": not counted. Check whose miss it is." : head + ": the name is not on the roster, not counted. Check who placed it." });
  }
  if (!keys.length) notes.push({ factor: "sOrder", text: "No ship on the Score Card: the Parts Portal, HON and the audits were not checked", source: "Score Card" });
  if (!on) notes.push({ factor: "sOrder", text: "No sign-on date: misses and field reports were not checked", source: "Score Card" });
  if (unread) notes.push({ factor: "sAcc", text: unread + " field report" + (unread === 1 ? "" : "s") + " in this contract not read yet (" + (deps.engine && deps.engine !== "none" ? "read on the next open" : "no AI engine") + "): check them on the crew's Notes", source: "Field intel" });
  for (const a of res.audits || []) if (a.open) notes.push({ factor: "sComm", text: "The audit grade was filed on the open audit site, without a sign-in", source: "Audit" });
  return { ok: true, ...res, evidence: (res.evidence || []).concat(notes), unread, allAudits: allAud, sources: { parts: !!env.PARTS_DB, hon: !!env.HON_DB, clicks: false } };
}

// The seafarer's audits for the Inputs page: one light read, no Parts Portal, HON or AI.
export async function listAudits(env, sc) {
  const r = await env.DB.prepare("SELECT e.request_id, e.ship, e.score, e.filed_at FROM audit_eval e LEFT JOIN audit_request r ON r.id = e.request_id WHERE e.agency_id=? AND COALESCE(r.test_mode, 0) = 0 ORDER BY e.filed_at DESC").bind(sc).all().catch(() => ({ results: [] }));
  return (r.results || []).map((a) => ({ id: a.request_id, ship: a.ship, score: a.score, at: a.filed_at }));
}
