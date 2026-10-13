// THE CREW PROFILE (Miguel, 12 Oct 2026: "lets start by showing the right data from the crew .. is where all the
// data should be collected from the crew .. coz is the crew tab"; then "I like A .. but add few things missing
// from the other 2 versions", mock-up A+). PURE: apiCrewOne reads every table that holds something on one
// seafarer in ONE wave (§12) and this module turns the rows into what the profile draws. Every value carries
// where it came from (`src`): the TDG file, TDG's count file, a date Rita typed, field intel, feedback, the
// Contract Counter (history only, §10d), the travel ledger. Nothing here writes, and nothing picks between two
// sources that disagree — a disagreement is a `checks` row for a person (§6).
//
// Until this, the profile read the Contract Counter for its contracts: James Agbada read "OFF in 39 d · Nov 21"
// while TDG's file and Rita's recorded edit both had him off Silhouette on Sep 5; sea-days counted 163 instead
// of 126; Ray's feedback, the intel card and the "Resigned." comment were nowhere on the page.
import { VESSEL_REF } from "./vessel_ref.js";
import { buildShipKeys, canonShipWith, normShip, AZAMARA_SHORT } from "./shipname.js";

const SHIP_KEYS = buildShipKeys(VESSEL_REF);
const key = (s) => normShip(canonShipWith(s, SHIP_KEYS) || s || "");
const isAz = (s) => AZAMARA_SHORT.includes(key(s));
const day = (v) => (v ? String(v).slice(0, 10) : null);
const iso = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
const toN = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000;
export function daysBetween(a, b) { const x = iso(a), y = iso(b); return x && y ? Math.round(toN(y) - toN(x)) : null; }
// Calendar months, clamped to the month's end (§11c: Jan 31 + 1 month = Feb 28, never Mar 3).
export function plusMonths(d, n) {
  const x = iso(d); if (!x) return null;
  let y = +x.slice(0, 4), m = +x.slice(5, 7) - 1 + n; const dd = +x.slice(8, 10);
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return y + "-" + String(m + 1).padStart(2, "0") + "-" + String(Math.min(dd, last)).padStart(2, "0");
}
const NEAR = 21; // the absorb window: TDG books the real port day, the Counter the nearest turnaround
const near = (a, b) => { const g = daysBetween(a, b); return g != null && Math.abs(g) <= NEAR; };
// An end more than three weeks before the plan is "early" — a projected end lands on a turnaround a few days
// either side (§10d), so a smaller gap is the rota, not the seafarer leaving.
export const EARLY_DAYS = 21;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtD(v) { const d = iso(v); return d ? MON[+d.slice(5, 7) - 1] + " " + (+d.slice(8, 10)) + ", " + d.slice(0, 4) : ""; }
// The intel summary comes as "• Summary: … • What happened: …" — split into its labelled parts.
export function intelParts(text) {
  const t = String(text || "").trim();
  const bits = t.split(/\s*•\s*/).map((x) => x.trim()).filter(Boolean);
  return bits.map((b) => { const m = b.match(/^([A-Z][\w ]{2,30}):\s*([\s\S]*)$/); return m ? { label: m[1], text: m[2].trim() } : { label: null, text: b }; });
}

// Who did it, in the words the page uses: a person's first name, the AI, TDG's file.
export function whoOf(u) {
  const s = String(u || "").trim();
  if (!s) return "—";
  if (s.toLowerCase() === "ai") return "AI";
  const local = s.split("@")[0].split(/[._-]/)[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1).toLowerCase() : s;
}
const ACTIONS = {
  crew_note_log: "Note added", crew_note: "Comment saved", crew_note_delete: "Note deleted", crew_note_archive: "Note archived", crew_note_restore: "Note restored",
  contract_edit: "Contract edited", crew_edit: "Crew record edited", crew_add: "Crew added",
  intel_auto: "Field intel filed", intel_file: "Field intel filed", intel_edit: "Field intel edited",
  feedback_score: "Feedback entered", feedback_request: "Feedback requested",
  rotation_assign: "Board placement", projection_create: "Earmark created", projection_move: "Earmark moved",
  projection_remove: "Earmark removed", relief_remove: "Earmark removed", earmark_dismiss: "TDG earmark removed",
  keyman_deploy: "Sent to TDG", signoff_link: "Sign-off link sent", signoff_instructions: "Sign-off instructions sent",
  crew_hide: "Card hidden", crew_restore: "Card restored", bonus_commit: "Bonus committed", baseline_set: "Baseline set",
};
const FB = [
  { role: "ray", label: "Ray · Orders" },
  { role: "rolando", label: "Rolando · Technical" },
  { role: "dexter", label: "Dexter · Field" },
];
const MANUAL_LABEL = {
  first_name: "First name", middle_name: "Middle name", last_name: "Last name", status: "Status", rank_override: "Rank",
  vessel_observed: "Ship", dob: "Date of birth", province: "Province", phone: "Phone", email: "Email", pp_no: "Passport no.",
  med_exp: "Medical expiry", sirb_exp: "Seaman book expiry", pp_exp: "Passport expiry", usv_exp: "US visa expiry",
  sch_exp: "Schengen expiry", retired: "Inactive tag", emergency_name: "Emergency contact", emergency_relation: "Emergency relationship", emergency_phone: "Emergency phone",
};
// WHO HE RELIEVED AND WHO RELIEVES HIM (Miguel, 12 Oct 2026: "show who was before he took over and who is coming after
// .. in the timeline"). Same hull, another seafarer, read off the ONE schedule + Rita's open cards + TDG's undated
// Earmarked rows. Before: the contract on the hull whose sign-off is nearest this sign-on (within HANDOVER_DAYS either
// side). After: the first contract or earmark on the hull that starts after this one did; TDG's Earmarked word (no
// dates) only when nothing dated follows. Nothing is inferred beyond that — the names are the board's own.
export const HANDOVER_DAYS = 45;
export function handovers(c, { legs, cards, tdgEarmarks, names, sc } = {}) {
  if (!c || !c.ship || !c.on) return { before: null, after: null };
  const k = key(c.ship), nm = (x, fallback) => (names && names[x]) || fallback || x;
  let before = null;
  for (const l of (legs || [])) {
    if (!l || l.sc === sc || !l.sc || key(l.ship) !== k || !iso(l.on) || l.on >= c.on || !iso(l.off)) continue;
    const g = Math.abs(daysBetween(l.off, c.on));
    if (g > HANDOVER_DAYS) continue;
    if (!before || g < before.gap) before = { sc: l.sc, name: nm(l.sc, l.name), off: l.off, src: legSrc(l), gap: g };
  }
  const after = [];
  for (const l of (legs || [])) if (l && l.sc && l.sc !== sc && key(l.ship) === k && iso(l.on) && l.on > c.on && daysBetween(c.on, l.on) > 14)
    after.push({ sc: l.sc, name: nm(l.sc, l.name), on: l.on, off: iso(l.off) || null, src: legSrc(l) });
  for (const a of (cards || [])) if (a && a.sc && a.sc !== sc && a.ship && key(a.ship) === k && iso(a.sign_on) && a.sign_on > c.on && daysBetween(c.on, a.sign_on) > 14 && !after.some((x) => x.sc === a.sc))
    after.push({ sc: a.sc, name: nm(a.sc, a.crew_name), on: iso(a.sign_on), off: iso(a.planned_sign_off) || null, src: "earmark", told: !!a.deployed_at,
      // TDG's file earmarks the same crew for this hull too: "EARMARK · TDG" on the board, so "in TDG" here (13 Oct 2026)
      tdg: (tdgEarmarks || []).some((r) => r && r.agency_id === a.sc && r.vessel && key(r.vessel) === k) });
  after.sort((a, b) => (a.on < b.on ? -1 : 1));
  let next = after[0] || null;
  if (!next) { const t = (tdgEarmarks || []).find((r) => r && r.agency_id !== sc && r.vessel && key(r.vessel) === k); if (t) next = { sc: t.agency_id, name: nm(t.agency_id, t.name), on: null, src: "tdg_earmark" }; }
  if (before) delete before.gap;
  return { before, after: next };
}
const legSrc = (l) => (l.source === "registry" ? "tdg" : String(l.source || "").startsWith("assignment") ? "card" : "counter");

// The whole profile. `input` carries the raw rows of the one wave; every list may be missing (an older
// database without the table reads as empty, never as an error).
export function buildCrewProfile(input) {
  const I = input || {};
  const today = iso(I.today) || new Date().toISOString().slice(0, 10);
  const crew = I.crew || {}, ov = I.override || {}, snap = I.snap || null, cnt = I.count || null;
  const sc = crew.agency_id;
  const A = (x) => (Array.isArray(x) ? x : []);

  // ---- the TDG file row (the header's box) and the count file
  const file = snap ? {
    at: day(snap.run_at), status: snap.raw_status || snap.status || null, ship: snap.vessel || null,
    embarked: iso(snap.embarked_at), debarked: iso(snap.debarked_at),
    ageDays: snap.run_at ? daysBetween(day(snap.run_at), today) : null,
  } : null;
  const count = cnt ? {
    completed: cnt.completed != null ? Number(cnt.completed) : null, added: Number(I.countAdded || 0),
    asOf: iso(cnt.as_of), position: cnt.position || null, tab: cnt.tab || null, km: cnt.km || null,
  } : null;
  if (count && count.completed != null) count.n = count.completed + count.added;

  // ---- identity: which fields a person typed over TDG's row
  const manual = [];
  for (const f of Object.keys(MANUAL_LABEL)) {
    const v = ov[f];
    if (f === "retired" ? !!v : (v != null && String(v).trim() !== "")) manual.push({ field: f, label: MANUAL_LABEL[f], value: f === "retired" ? "Inactive (manual)" : String(v) });
  }
  const identity = { km: (count && count.km) || null, shipCrewId: crew.ship_crew_id || null, manual };

  // ---- status history: each AdvancedQuery that moved the word (sync_conflict, field status), newest first
  // An upload re-run on the same day writes the same transition twice: kept once.
  const sRows = A(I.statusRows).filter((r) => r && r.field === "status").sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .filter((r, i, arr) => !arr.slice(0, i).some((q) => q.old_value === r.old_value && q.new_value === r.new_value && day(q.created_at) === day(r.created_at)));
  const history = [];
  sRows.forEach((r, i) => {
    const nxt = sRows[i + 1];
    history.push({ word: r.new_value, from: day(r.created_at), to: nxt ? day(nxt.created_at) : null, held: !Number(r.resolved), src: "tdg" });
  });
  if (sRows.length && sRows[0].old_value) history.unshift({ word: sRows[0].old_value, from: sRows[0].old_value === "On board" && file && file.embarked && file.embarked < day(sRows[0].created_at) ? file.embarked : null, to: day(sRows[0].created_at), src: "tdg" });
  // The same word from upload after upload is ONE span (13 Oct 2026: Ian Alega read "On Vacation" six rows running —
  // a held change re-flagged by every weekly file). Held only while every row of the span was held.
  for (let i = history.length - 1; i > 0; i--) if (history[i].word === history[i - 1].word) { history[i - 1].to = history[i].to; history[i - 1].held = !!(history[i - 1].held && history[i].held); history.splice(i, 1); }
  history.reverse();

  // ---- contracts: the ONE schedule (boardLegs) for this crew, newest first, every date with its source
  const counter = A(I.counter), edits = A(I.edits);
  const instr = A(I.instr), links = A(I.links), sbmReq = A(I.sbmRequests), travel = A(I.travel);
  const legs = A(I.legs).filter((l) => l && l.sc === sc && l.ours !== false && iso(l.on)).sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
  const editFor = (l) => edits.find((e) => e.on_key && near(e.on_key, l.on)) ||
    edits.find((e) => !e.on_key && counter.some((k) => near(k.sign_on, l.on) && Number(k.seq) === Number(e.seq))) || null;
  const counterFor = (l) => counter.find((k) => near(k.sign_on, l.on) && key(k.ship) === key(l.ship)) || null;
  const travelFor = (l, off) => travel.filter((t) => {
    const ym = (d) => (d ? d.slice(0, 7) : null);
    const tym = t.year && t.month ? t.year + "-" + String(t.month).padStart(2, "0") : null;
    return tym && ((t.leg === "on" && tym === ym(l.on)) || (t.leg === "off" && tym === ym(off)));
  }).map((t) => ({ leg: t.leg, air: +t.air || 0, hotel: +t.hotel || 0, medical: +t.medical || 0, visa: +t.visa || 0, other: (+t.food || 0) + (+t.transport || 0) + (+t.other || 0), total: +t.total || 0 }));
  const sentFor = (rows, off, shipName) => {
    const hit = rows.filter((r) => (iso(r.sign_off_date) && off && near(r.sign_off_date, off)) && (!r.vessel || !shipName || key(r.vessel) === key(shipName)))
      .sort((a, b) => String(b.requested_at).localeCompare(String(a.requested_at)))[0];
    return hit ? { sent: day(hit.requested_at), acked: day(hit.ack_at), status: hit.status || null } : null;
  };
  const contracts = legs.map((l, i) => {
    const off = iso(l.off), src = legSrc(l), e = editFor(l), k = counterFor(l);
    const offSource = src === "tdg" ? (l.offSource || "projected") : src === "card" ? "card" : "counter";
    const dates = [{ what: "Sign-on", value: l.on, src: src === "tdg" ? "tdg_embark" : src, at: src === "tdg" ? (l.fileAt || null) : null, used: true }];
    if (off) dates.push({ what: "Sign-off", value: off, src: offSource, at: l.offAt || (offSource === "tdg" ? l.fileAt || null : null), used: true, held: !!l.heldByFile, snapped: l.offSnapped || 0 });
    if (e && iso(e.sign_off) && !(offSource === "rita" && iso(e.sign_off) === off)) dates.push({ what: "Sign-off", value: iso(e.sign_off), src: "rita", at: day(e.updated_at), used: false, agrees: iso(e.sign_off) === off });
    if (k && src !== "counter") {
      const kOff = iso(k.act_off) || iso(k.proj_off);
      if (kOff) dates.push({ what: "Sign-off", value: kOff, src: "counter", at: day(k.imported_at), used: false, agrees: kOff === off, history: true });
    }
    // The plan the contract was measured against: the Counter's projection, else the standard length.
    const planned = (k && iso(k.proj_off)) || plusMonths(l.on, isAz(l.ship) ? 5 : 7);
    const ended = !l.is_current && !!off && off <= today;
    const earlyBy = ended && planned && offSource !== "projected" ? daysBetween(off, planned) : null;
    const lastDay = off && off < today ? off : today;
    const r = e ? { eccr: !!e.eccr, air: !!e.air, hotel: !!e.hotel, on: !!e.on_conf, off: !!e.off_conf, src: "rita" }
      : (l.is_current && I.ready ? { eccr: !!I.ready.eccr, air: !!I.ready.air, hotel: !!I.ready.hotel, on: false, off: false, src: "board" } : null);
    const review = sbmReq.filter((q) => (iso(q.contract_signoff) && off && near(q.contract_signoff, off)) || (iso(q.contract_signon) && near(q.contract_signon, l.on)))
      .sort((a, b) => String(b.sent_at || b.created_at).localeCompare(String(a.sent_at || a.created_at)))[0];
    return {
      n: i + 1, ship: l.ship, brand: l.brand || null, on: l.on, off, current: !!l.is_current, src, offSource,
      held: !!l.heldByFile, confirmed: !!l.offConfirmed, reliever: l.reliever || null,
      embark: (e && e.embark) || l.embark || null, disembark: (e && e.disembark) || l.disembark || null,
      planned, earlyDays: earlyBy != null && earlyBy > EARLY_DAYS ? earlyBy : 0,
      days: l.on <= lastDay ? daysBetween(l.on, lastDay) : 0, plannedDays: daysBetween(l.on, planned),
      dates, readiness: r,
      emails: { instructions: sentFor(instr, off, l.ship), link: sentFor(links, off, l.ship), review: review ? { sent: day(review.sent_at || review.created_at), status: review.status || null } : null },
      travel: travelFor(l, off),
      handover: handovers(l, { legs: I.fleetLegs, cards: I.openCards, tdgEarmarks: I.tdgEarmarks, names: I.names, sc }),
      // why it ended, Rita's word (contract_end, 13 Oct 2026) — HR only, never the bonus
      end: (() => { const r = A(I.ends).find((x) => x && iso(x.on_key) && near(x.on_key, l.on)); return r ? { reason: r.reason, note: r.note || null, by: whoOf(r.set_by), at: day(r.set_at), onKey: iso(r.on_key) } : null; })(),
    };
  }).reverse();

  // ---- numbers
  const seaDays = contracts.reduce((s, c) => s + (c.on <= today ? c.days : 0), 0);
  const cur = contracts.find((c) => c.current && c.on <= today) || null;
  const last = contracts.find((c) => !c.current && c.off && c.off <= today) || null;
  const ashoreDays = !cur && last ? daysBetween(last.off, today) : null;

  // ---- what people said: notes, the comment, field intel, feedback, shipboard reviews — newest first
  const feed = [];
  // Who wrote a note: crew_note_log has no author, so the activity row written in the same second names them.
  const authorAt = (ts) => {
    const t = Date.parse(ts || ""); if (isNaN(t)) return null;
    const a = A(I.activity).find((x) => (x.action === "crew_note_log" || x.action === "crew_note") && Math.abs(Date.parse(x.at) - t) <= 5000);
    return a ? whoOf(a.user_id) : null;
  };
  // An archived note leaves the feed (it stays in the Notes window, struck through, with Restore — 12 Oct 2026).
  const liveNotes = A(I.notes).filter((n) => n && !n.archived_at);
  for (const n of liveNotes) if (String(n.text || "").trim()) feed.push({ at: n.ts, kind: "note", src: "typed", text: String(n.text), who: n.created_by ? whoOf(n.created_by) : authorAt(n.ts) });
  const comment = I.ready && String(I.ready.note || "").trim();
  if (comment && !A(I.notes).some((n) => String(n.text || "").trim() === comment)) feed.push({ at: I.ready.updated_at, kind: "comment", src: "typed", text: comment, who: authorAt(I.ready.updated_at) });
  for (const x of A(I.intel)) feed.push({ at: x.ts, kind: "intel", src: "intel", text: String(x.summary || ""), parts: intelParts(x.summary), who: x.reporter || null, via: x.source || "email", confidence: x.confidence || null, contractNo: x.contract_no != null ? Number(x.contract_no) : null });
  const reqs = A(I.fbReqs), resp = A(I.fbResp);
  for (const r of resp) {
    let ans = {}; try { ans = JSON.parse(r.answers_json || "{}"); } catch (e) {}
    feed.push({ at: r.submitted_at, kind: "feedback", src: "feedback", role: r.role, who: (FB.find((f) => f.role === r.role) || {}).label || r.role, answers: ans, superseded: !!r.superseded_at });
  }
  for (const s of A(I.sbm)) feed.push({ at: s.submitted_at, kind: "review", src: "feedback", who: "Shipboard review", rating: s.rating != null ? Number(s.rating) : null, ship: s.ship || null, text: s.q_final || "" });
  feed.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  const slots = FB.map((f) => {
    const live = resp.filter((r) => r.role === f.role && !r.superseded_at).sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)))[0];
    const q = reqs.find((r) => r.role === f.role);
    return { role: f.role, label: f.label, state: live ? "answered" : q ? (q.status === "na" ? "na" : "pending") : "never", at: day(live ? live.submitted_at : q ? q.requested_at : null) };
  });
  const lastReview = sbmReq.slice().sort((a, b) => String(b.sent_at || b.created_at).localeCompare(String(a.sent_at || a.created_at)))[0];
  const reviewAnswered = A(I.sbm).length > 0;
  slots.push({ role: "sbm", label: "Shipboard review", state: reviewAnswered ? "answered" : lastReview ? "pending" : "never", at: day(reviewAnswered ? A(I.sbm)[0].submitted_at : lastReview ? (lastReview.sent_at || lastReview.created_at) : null) });

  // ---- rotation: earmarks still to come, TDG earmarks removed, what went to Joy
  const earmarks = A(I.cards).filter((c) => c && !c.actual_sign_off && iso(c.sign_on) && c.sign_on > today)
    .map((c) => ({ id: c.id, ship: c.vessel_name, on: iso(c.sign_on), off: iso(c.planned_sign_off), told: day(c.deployed_at) }))
    .sort((a, b) => (a.on < b.on ? -1 : 1));
  const dismissed = A(I.dismissals).map((d) => ({ ship: d.ship_key, at: day(d.dismissed_at), by: whoOf(d.dismissed_by) }));
  const joy = A(I.deploys).map((d) => ({ ship: d.ship, on: iso(d.sign_on), off: iso(d.sign_off), at: day(d.sent_at), by: whoOf(d.sent_by) }));

  // ---- to check: where two sources disagree or something is missing. The console never picks.
  const checks = [];
  const latest = contracts[0] || null;
  if (latest && latest.earlyDays && !latest.end && !A(I.cards).some((c) => c.end_reason && iso(c.sign_on) && near(c.sign_on, latest.on)))
    checks.push({ key: "end_reason", text: "Why the " + latest.ship + " contract ended " + latest.earlyDays + " days early is not recorded." + (comment ? " The comment says “" + comment.replace(/[.\s]+$/, "") + "”." : "") });
  if (I.grade && count && count.position && normGrade(I.grade) !== normGrade(count.position))
    checks.push({ key: "grade", text: "The console grades " + I.grade + " (" + count.n + " completed contract" + (count.n === 1 ? "" : "s") + "); TDG’s count file says " + count.position + "." });
  if (latest && !latest.current && latest.off && daysBetween(latest.off, today) >= 0) {
    const missing = slots.filter((s) => s.state === "never").map((s) => s.label.split(" · ")[0]);
    if (missing.length) checks.push({ key: "feedback", text: "Contract ended " + fmtD(latest.off) + " — never asked: " + missing.join(", ") + "." });
  }
  if (identity.km && !identity.shipCrewId) checks.push({ key: "identity", text: "TDG id " + identity.km + " is matched to " + sc + " by name; the ship crew id is not stored." });
  if (file && file.status && crew.status && normStatusWord(file.status) !== normStatusWord(crew.status) && !(ov.status || ov.retired))
    checks.push({ key: "status", text: "TDG’s file says " + file.status + "; the crew record says " + crew.status + "." });
  for (const m of manual) if (m.field === "status" || m.field === "retired") checks.push({ key: "manual_status", text: "A manual " + m.label.toLowerCase() + " (" + m.value + ") sits over TDG’s word." });

  // ---- activity: who did what, newest first (the activity log + every TDG file that moved the status)
  const activity = A(I.activity).map((a) => ({ at: a.at, who: whoOf(a.user_id), text: (ACTIONS[a.action] || String(a.action || "").replace(/_/g, " ")) + activityDetail(a, sc) }));
  for (const r of sRows) activity.push({ at: r.created_at, who: "TDG file", text: "Status " + (r.old_value || "—") + " → " + r.new_value + (Number(r.resolved) ? "" : " (held)") });
  if (file && file.embarked) activity.push({ at: file.embarked, who: "TDG file", text: "Embarked " + (canonShipWith(file.ship, SHIP_KEYS) || file.ship || "") });
  activity.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));

  return {
    file, count, identity, status: { history }, contracts,
    numbers: { seaDays, ashoreDays, aboardDays: cur ? daysBetween(cur.on, today) : null },
    people: { slots, feed }, rotation: { earmarks, dismissed, joy }, checks, activity,
  };
}
function activityDetail(a, sc) {
  const d = String(a.detail || "").replace(sc, "").trim();
  if (!d) return "";
  if (a.action === "feedback_score") { const f = FB.find((x) => x.role === d.toLowerCase()); return " · " + (f ? f.label : d); }
  if (a.action === "intel_auto" || a.action === "intel_file") return d ? " · " + d + " match" : "";
  if (a.action === "contract_edit") return " · contract " + d.replace(/^#/, "");
  return " · " + d.replace(/^->\s*/, "→ ");
}
function normGrade(s) {
  const t = String(s || "").toLowerCase();
  if (/senior|sr\b/.test(t)) return "senior";
  if (/junior|jr\b/.test(t)) return "junior";
  return t.includes("printer") || /\bps\b/.test(t) ? "ps" : t;
}
function normStatusWord(s) {
  const t = String(s || "").toLowerCase();
  if (t.startsWith("reserved")) return "on vacation";
  if (t.startsWith("not for rehire")) return "inactive";
  return t;
}

// The statement PDF's contract table and sea-days, from the SAME schedule as the profile (12 Oct 2026: the PDF
// read the Counter and printed James Agbada "projected Nov 21" and 163 sea-days while the page said Sep 5 and
// 126). Oldest first, numbered in order; a sign-off TDG, Rita or a reliever card gave is "actual" once it has
// passed, a projected one stays "projected".
export function statementContracts(legs, sc, today) {
  const t = iso(today) || new Date().toISOString().slice(0, 10);
  const rows = (Array.isArray(legs) ? legs : []).filter((l) => l && l.sc === sc && l.ours !== false && iso(l.on))
    .sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
  let seaDays = 0;
  const contracts = rows.map((l, i) => {
    const off = iso(l.off), projected = l.source === "registry" ? (l.offSource || "projected") === "projected" : !!l.is_current;
    const actual = off && !projected && off <= t;
    const end = off && off < t ? off : t;
    if (l.on <= end) seaDays += daysBetween(l.on, end);
    const row = { seq: i + 1, ship: l.ship, on: l.on, act: actual ? off : null, proj: actual ? null : off || null };
    if (l.embark || l.disembark) Object.assign(row, { from: l.embark || null, to: l.disembark || null }); // the route, for the PDF (13 Oct 2026)
    return row;
  });
  return { contracts, seaDays };
}

// CONTRACT FEEDBACK for the internal crew file PDF (Miguel, 13 Oct 2026: "the PDF should include this also in a clean
// page .. as Contract feedback .. should display the entire historical data .. not just the contract that just ended").
// Everything said about the seafarer — notes, field intel (the full report), feedback answers (every role, superseded
// ones kept and marked), shipboard reviews — grouped under the contract it falls in (newest contract first, items newest
// first), the rest under "Between contracts". Archived notes are already out of the feed. Pure: (profile, today) => file.
export const FB_LABEL = {
  order: "Rush order", rushcause: "Rush cause", rushcost: "Rush cost (USD)", ontime: "Orders on time", acc: "Order accuracy",
  par: "Par at handover", audit: "Failed end-of-contract audit", clean: "PROD service", pm: "MFD service",
  unres: "Information / database knowledge", assessed: "Assessed this contract", mono: "Mono click %", inv: "Inventory",
  tech: "Technical", overall: "Overall impression",
};
export function feedbackFile(profile, today) {
  const P = profile || {}, t = iso(today) || new Date().toISOString().slice(0, 10);
  const K = (Array.isArray(P.contracts) ? P.contracts : []).filter((k) => k && iso(k.on));
  const feed = (P.people && Array.isArray(P.people.feed)) ? P.people.feed : [];
  const KIND = { note: "Note", comment: "Comment", intel: "Field intel", feedback: "Feedback", review: "Shipboard review" };
  const groupOf = (d) => K.find((k) => d >= k.on && d <= (k.off && k.off < t ? k.off : t)) || null;
  const groups = K.map((k) => ({ key: k.on, contract: { n: k.n, ship: k.ship, on: k.on, off: k.off || null, current: !!k.current, earlyDays: k.earlyDays || 0, end: k.end || null }, items: [] }));
  const between = { key: "between", contract: null, items: [] };
  for (const f of feed) {
    const d = day(f.at); if (!d) continue;
    const k = groupOf(d);
    const item = { at: d, kind: f.kind, label: KIND[f.kind] || f.kind, who: f.who || null, lines: [], tags: [], superseded: !!f.superseded };
    if (f.kind === "intel") {
      item.lines = (Array.isArray(f.parts) && f.parts.length ? f.parts : [{ label: null, text: f.text }]).map((p) => ({ label: p.label || null, text: String(p.text || "") }));
      item.meta = [f.via ? "by " + f.via : "", f.confidence ? f.confidence + " match" : ""].filter(Boolean).join(" · ");
    } else if (f.kind === "feedback") {
      const a = f.answers || {};
      item.tags = Object.keys(a).filter((x) => x !== "note" && a[x] !== "" && a[x] != null).map((x) => [FB_LABEL[x] || x, String(a[x])]);
      if (a.note) item.lines = [{ label: null, text: String(a.note) }];
    } else if (f.kind === "review") {
      item.tags = f.rating != null ? [["Rating", f.rating + "/5"]] : [];
      if (f.ship) item.tags.push(["Ship", f.ship]);
      if (f.text) item.lines = [{ label: null, text: String(f.text) }];
    } else item.lines = [{ label: null, text: String(f.text || "") }];
    (k ? groups.find((g) => g.key === k.on) : between).items.push(item);
  }
  for (const g of groups.concat([between])) g.items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const out = groups.filter((g) => g.items.length || g.contract.current);
  if (between.items.length) out.push(between);
  const slots = (P.people && Array.isArray(P.people.slots)) ? P.people.slots.map((s) => ({ label: String(s.label || "").split(" · ")[0], state: s.state, at: day(s.at) })) : [];
  return { groups: out, slots, total: feed.length };
}
