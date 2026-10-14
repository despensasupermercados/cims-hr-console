// PRINTSHOP AUDIT — what a read by HON means for the gate and for the crew (14 Oct 2026). Pure.
// HON measures Pattern 43 and reads the Machine Management List (cims-hon AuditReader, PR #113); this file only turns
// HON's answer into one of the upload's states and the sentence the crew sees. It never judges a machine itself.
//   ok          the file answers the question (Pattern 43 measured clean or with marks; the MACHINE management list)
//   wrong_doc   readable, but the wrong document — the crew can fix it now (the User Management List, a condition form)
//   unreadable  the file could not be measured — scan again (not 12 pages, too large a page, not clear enough)
//   failed      HON did not answer (down, timeout) — nobody aboard can fix it; the hourly sweep retries it
export const READ_STATES = ["pending", "ok", "wrong_doc", "unreadable", "failed"];

export function p43ReadState(res) {
  if (!res) return { read_state: "failed", say: "The reader did not answer. It will try again within the hour." };
  if (res.ok === false) return { read_state: "unreadable", say: "Could not measure this file: " + (res.error || "unreadable") + ". Scan the 12 pages again as one PDF." };
  const L = res.legend || {};
  if (res.state === "clean" || res.state === "findings") {
    return { read_state: "ok", say: res.state === "clean" ? "Read. Nothing found." : "Read. " + (L.items || []).length + " mark" + ((L.items || []).length === 1 ? "" : "s") + " for the team to look at.",
      summary: { state: res.state, legend: L, version: res.version || null } };
  }
  const why = (L.line || (res.read && res.read.why) || "the scan could not be measured");
  return { read_state: "unreadable", say: "Could not measure this bundle: " + why + ". Print Pattern 43 again and scan all 12 pages as one PDF.", summary: { state: res.state, legend: L } };
}

export function mmlReadState(res) {
  if (!res) return { read_state: "failed", say: "The reader did not answer. It will try again within the hour." };
  if (res.ok === false) {
    const sysErr = /not configured|took too long|unreachable|vision \d/.test(String(res.error || ""));
    return sysErr ? { read_state: "failed", say: "The reader could not read it right now. It will try again within the hour." }
      : { read_state: "unreadable", say: "Could not read this file (" + (res.error || "unreadable") + "). Scan the Machine Management List again as one PDF." };
  }
  if (res.kind === "machine-list") {
    const n = (res.lifeOver || []).length;
    return { read_state: "ok", say: "Read. " + (n ? n + " part" + (n === 1 ? "" : "s") + " past rated life, for the team." : "No part past its rated life."),
      summary: { kind: res.kind, lifeOver: res.lifeOver || [], recommendation: res.recommendation || null, version: res.version || null } };
  }
  if (res.kind === "settings-list") return { read_state: "wrong_doc", say: "This is the USER Management List (the settings). Print the MACHINE Management List, the long report with the life %, and upload that.", summary: { kind: res.kind } };
  return { read_state: "wrong_doc", say: "This file does not carry the part life. Print the MACHINE Management List, the long report with the life %, and upload that.", summary: { kind: res.kind || "unknown" } };
}

// What OBP has for a part past its rated life: on board and on order. Matched by part number only — a description match
// would be an invented attribution. "not on the OBP list" when nothing matches.
const pn = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export function coverFor(partNo, lines = [], intransit = []) {
  const k = pn(String(partNo || "").split(/\s+[\/-]\s+/)[0]);
  if (!k) return null;
  const hit = (l) => { const p = pn(l.part_number); return p && (p === k || p.startsWith(k) || k.startsWith(p)); };
  const on = (lines || []).filter(hit);
  const tr = (intransit || []).filter(hit);
  if (!on.length && !tr.length) return null;
  const onHand = on.reduce((s, l) => s + (Number(l.on_hand) || 0), 0);
  const coming = tr.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  return "on board " + onHand + " · on order " + coming;
}
