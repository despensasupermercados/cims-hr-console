// THE SCORE CARD'S AUTOMATIC INPUTS — the reads (Miguel, 15 Oct 2026). The rules are bonus.js `autoScore` (money, §1);
// this file only fetches what they need, in ONE wave, and never writes another app's database:
//   PARTS_DB (cims-parts-orders) — orders marked "Vessel-side miss" on the crew's ship during the contract;
//   HON_DB   (cims-hon)          — the signed handover for that ship near the sign-off;
//   DB                           — Dexter's grades (audit_eval), Ray's live answers, the crew's field reports;
//   the intel engine             — whether a field report names an order-accuracy or par problem, with a QUOTE that must
//                                  be in the report word for word (otherwise no flag), kept in score_intel_flag.
// No click feed exists yet (OBP's clicks table is being added to the nightly export): mono is null = full points.
import { autoScore } from "./bonus.js";

export const shipKey = (s) => String(s || "").toLowerCase()
  .replace(/^\s*(mv|m\/v|ms)\s+/, "").replace(/^(celebrity|azamara|royal caribbean)\s+/, "")
  .replace(/\bof the seas\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const surname = (n) => String(n || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/).filter(Boolean).pop() || "";
const day = (v) => (v ? String(v).slice(0, 10) : "");
function addDays(d, n) { const t = Date.parse(day(d) + "T00:00:00Z"); return isNaN(t) ? day(d) : new Date(t + n * 86400000).toISOString().slice(0, 10); }

// The handover that closes THIS contract: same ship, signed between 30 days before the sign-off and 10 after; when HON
// names the outgoing crew, it must be this crew (surname). HON leaves the name blank on 2 of 5 signed records.
export function pickHandover(rows, { ship, signOff, crewName }) {
  const k = shipKey(ship), off = day(signOff), sn = surname(crewName);
  if (!k || !off) return null;
  const lo = addDays(off, -30), hi = addDays(off, 10);
  const hit = (rows || []).filter((r) => shipKey(r.ship) === k && day(r.signed_at) >= lo && day(r.signed_at) <= hi
    && (!r.outgoing_name || !sn || surname(r.outgoing_name) === sn));
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
export function parseFlag(txt, source) {
  const m = String(txt || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j; try { j = JSON.parse(m[0]); } catch (e) { return null; }
  const quote = String(j.quote || "").trim();
  const yes = !!j.accuracy || !!j.par;
  // the quote is the evidence a money user reads: it must be the report's own words, or nothing is flagged
  if (yes && (!quote || String(source || "").toLowerCase().indexOf(quote.toLowerCase()) < 0)) return { accuracy: false, par: false, quote: "", refused: true };
  return { accuracy: !!j.accuracy, par: !!j.par, quote: yes ? quote : "" };
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

// deps: { ensure (score_intel_flag guard), engine, claudeModel, workersModel }
export async function gatherAuto(env, { sc, ship, signOn, signOff, crewName }, deps = {}) {
  const on = day(signOn), off = day(signOff) || new Date().toISOString().slice(0, 10);
  const none = () => ({ results: [] });
  if (deps.ensure) await deps.ensure(env);
  const [crewRow, misses, hons, audits, intel] = await Promise.all([
    env.DB.prepare("SELECT id FROM crew WHERE agency_id=?").bind(sc).first().catch(() => null),
    env.PARTS_DB ? env.PARTS_DB.prepare("SELECT order_ref, ship, submitted_at, grand_total FROM orders WHERE order_type='missed' AND miss_reason='vessel' AND voided_at IS NULL AND submitted_at >= ? AND submitted_at <= ?").bind(on || "0000", off + "T23:59:59").all().catch(none) : none(),
    env.HON_DB ? env.HON_DB.prepare("SELECT id, ship, outgoing_name, signed_at FROM handover WHERE signed_at IS NOT NULL AND signed_at >= ? AND signed_at <= ?").bind(addDays(off, -30), addDays(off, 10) + " 23:59:59").all().catch(none) : none(),
    env.DB.prepare("SELECT visit_id, request_id, ship, score, filed_at FROM audit_eval WHERE agency_id=? ORDER BY filed_at DESC").bind(sc).all().catch(none),
    env.DB.prepare("SELECT id, reporter, summary, ts FROM crew_intel WHERE agency_id=? AND status='filed' AND ts >= ? AND ts <= ?").bind(sc, on || "0000", off + "T23:59:59").all().catch(none),
  ]);
  const resp = crewRow ? await env.DB.prepare("SELECT role, answers_json, submitted_at FROM feedback_response2 WHERE crew_id=? AND superseded_at IS NULL").bind(crewRow.id).all().catch(none) : none();
  const answers = {}; let rayAt = null;
  for (const r of resp.results || []) { try { answers[r.role] = JSON.parse(r.answers_json || "{}"); } catch (e) {} if (r.role === "ray") rayAt = r.submitted_at; }
  const k = shipKey(ship);
  const vm = (misses.results || []).filter((m) => !k || shipKey(m.ship) === k).map((m) => ({ ref: m.order_ref, at: m.submitted_at, total: m.grand_total, ship: m.ship }));
  const handover = pickHandover(hons.results || [], { ship, signOff: off, crewName });
  // field reports: classify each once (cached by the report's text), at most 4 new per open
  const reports = (intel.results || []).filter((r) => r.summary);
  const flags = [];
  if (reports.length) {
    const keys = await Promise.all(reports.map((r) => flagKey(r.summary)));
    const got = await env.DB.prepare("SELECT h, accuracy, par, quote FROM score_intel_flag WHERE h IN (" + keys.map(() => "?").join(",") + ")").bind(...keys).all().catch(none);
    const kept = new Map((got.results || []).map((r) => [r.h, r]));
    const miss = reports.map((r, i) => [r, keys[i]]).filter(([, h]) => !kept.has(h)).slice(0, 4);
    await Promise.all(miss.map(async ([r, h]) => {
      if (!deps.engine || deps.engine === "none") return;
      const f = await classify(env, r.summary, deps);
      if (!f) return;
      kept.set(h, { h, accuracy: f.accuracy ? 1 : 0, par: f.par ? 1 : 0, quote: f.quote });
      await env.DB.prepare("INSERT OR IGNORE INTO score_intel_flag (h, accuracy, par, quote, engine, at) VALUES (?,?,?,?,?,?)").bind(h, f.accuracy ? 1 : 0, f.par ? 1 : 0, f.quote, deps.engine, new Date().toISOString()).run().catch(() => null);
    }));
    reports.forEach((r, i) => { const f = kept.get(keys[i]); if (f && (f.accuracy || f.par)) flags.push({ at: r.ts, accuracy: !!f.accuracy, par: !!f.par, quote: f.quote, who: r.reporter || null }); });
  }
  const aud = (audits.results || []).map((a) => ({ id: a.request_id, ship: a.ship, score: a.score, at: a.filed_at }));
  const res = autoScore({ signOn: on, signOff: off, answers, rayAt, misses: vm, handover, audits: aud, flags, mono: null });
  return { ok: true, ...res, allAudits: aud, sources: { parts: !!env.PARTS_DB, hon: !!env.HON_DB, clicks: false } };
}
