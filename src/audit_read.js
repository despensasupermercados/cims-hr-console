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

// THE CREW IS TOLD WHAT THE SCAN SHOWS (R1; Miguel, 23 Oct 2026: "is not that Rolando needs to approve .. is that you the AI
// tell the crew the assessment of it"). Until then the crew read "Received" and only the team saw the marks. Built from what
// HON measured and the DG3 tech library rule each mark carries, the same lines the audit app shows Dexter (audit_ui
// p43Lines); nothing is guessed and nothing says "replace" (copy quality decides). auditor = the first name who sees the
// same reading before the visit. summary = the stored read's summary ({ state, legend }); null when it says nothing.
const sentenceCase = (t) => { t = String(t || "").trim().toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
const listWords = (a) => (a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);
export function p43Assess(summary, auditor) {
  if (!summary || (summary.state !== "clean" && summary.state !== "findings")) return null;
  const items = ((summary.legend && summary.legend.items) || []);
  if (summary.state === "clean" || !items.length) return { state: "clean", head: "No marks on any page. Nothing to do for this press.", items: [] };
  const out = items.map((i) => {
    const w = String(i.where || "").split(" · ").filter(Boolean), pg = Array.isArray(i.pages) ? i.pages : [], ink = String(i.ink || "").toLowerCase();
    const lines = [];
    if (w.length) lines.push(["Where", w.map((x, k) => sentenceCase(x) + (pg.length === w.length ? " (page " + pg[k] + ")" : "")).join(" · ") + (pg.length && pg.length !== w.length ? " · pages " + pg.join(", ") : "")]);
    // What it means, said only as far as the reading goes (27 Oct 2026 review): it named "every colour mixed with cyan" when the
    // mark showed on one mix, and read a mark shared by most colours (ink "shared", rule 6) as "the shared unit alone".
    const mixes = w.filter((x) => !/half tone|full tone/i.test(x)).map((x) => x.toLowerCase());
    if (ink === "shared") lines.push(["What it means", "The same mark shows in the same place on most colours, so it is not one colour's unit. The transfer belt carries every colour, and a scanner can leave the same mark."]);
    else if (ink && ink !== "black" && mixes.length && /half tone|full tone/i.test(w[0])) lines.push(["What it means", "The same mark shows on the " + ink + " page and on " + listWords(mixes) + (mixes.length === 1 ? ", a colour" : ", colours") + " mixed with " + ink + ", so it comes from the " + ink + " unit alone. The transfer belt or the scanner would mark every colour."]);
    if (i.part) lines.push(["Points to", "The " + String(i.part).toLowerCase() + (i.check && i.check.src ? " (" + i.check.src + ")" : "") + "."]);
    const chk = i.check && i.check.say ? i.check.say : (typeof i.check === "string" ? i.check : "");
    // "follow the line along its length" only for a line; dots and bands are looked at in the same place
    const isLine = /\bline/i.test(String(i.head || "") + " " + String(i.detail || "") + " " + String(i.mark || ""));
    if (chk) lines.push(["Check on board", (pg.length ? "Print page " + pg[0] + " of Pattern 43 again and " + (isLine ? "follow the line along its length" : "look at the same place") + ": " : "") + chk + "."]);
    return { title: sentenceCase(i.head || i.mark || "A mark") + (i.detail ? " · " + i.detail : ""), lines };
  });
  return { state: "findings", head: out.length + (out.length === 1 ? " mark" : " marks") + " on this press.", items: out,
    after: "Keep printing. Parts are changed on copy quality, not on a mark: if it shows on customer copies, open a ticket with Tech Support." + (auditor ? " " + auditor + " sees the same reading before the visit." : "") };
}

// A PART-LIFE PERCENTAGE REACHES A PERSON ONLY FROM A READ HON VERIFIED (Miguel, 6 Nov 2026, over "72 parts past rated
// life" on Independence: "is it true these numbers percetages are so high ??" — no: six parts read 6,387,753% on one press,
// "times replaced" read in the millions, "(Page)" counts were listed as percentages; then "yes. all of it"). HON's reader is
// a model transcribing 52 scanned pages, and nothing checked what it returned against the document. HON marks a read it
// checked `lifeVerified: true`; every other read — every read stored before 6 Nov 2026 included — shows no percentage,
// never "no part past its rated life": it says "part life not verified". ONE definition, read by every surface.
export const lifeTrusted = (s) => !!s && s.lifeVerified === true;
export function shownLife(s) {
  if (!s || s.kind !== "machine-list" || lifeTrusted(s)) return s;
  // read version 5: a list whose two readings were compared claimed life figures even when none agreed (lifeChecks)
  const claimed = (Array.isArray(s.lifeOver) && s.lifeOver.length > 0) || s.lifeRows > 0 || s.lifeChecks > 0;
  if (!claimed) return s; // no life row read at all: "part life not read" stays what it is
  return Object.assign({}, s, { lifeOver: [], recommendation: null, lifeUnverified: true });
}

export function mmlReadState(res) {
  if (!res) return { read_state: "failed", say: "The reader did not answer. It will try again within the hour." };
  if (res.ok === false) {
    const sysErr = /not configured|took too long|unreachable|vision \d/.test(String(res.error || ""));
    return sysErr ? { read_state: "failed", say: "The reader could not read it right now. It will try again within the hour." }
      : { read_state: "unreadable", say: "Could not read this file (" + (res.error || "unreadable") + "). Scan the Machine Management List again as one PDF." };
  }
  if (res.kind === "machine-list") {
    // A machine list whose read carries NO life row cannot say "no part past its rated life" (Miguel, 20 Oct 2026, Kevin
    // Jugao's Pursuit list: "u didnt read the files correctly"). The life % sits on two sections of the 52-page report,
    // "Developing unit count" (p5) and "Special parts counter" (p7–15); a file without them — part of the list, or a read
    // that missed them — answers nothing about part life. The crew can fix it: send the whole list.
    const rows = res.read && Array.isArray(res.read.lifeItems) ? res.read.lifeItems.length : null;
    // READ VERSION 5 / 6 (HON, 6 Nov 2026): each figure is read twice and kept only where the two reads agree (v6: the
    // life page read two ways; v5: the life page against the Special parts counter). A list whose figures were compared
    // and did not agree keeps NO row, but it is the right document: "not verified", never "no parts-life page" (the
    // crew would be told to send it again).
    const checks = Array.isArray(res.lifeCheck) ? res.lifeCheck.length : 0;
    if (rows === 0 && !checks) return { read_state: "wrong_doc", say: "No parts-life page was found in this file (the Maintenance counter page: Developer, Drum, Transfer belt, Charging corona, Toner filter and Developing unit life, pages 3 to 5 of the Machine Management List). Upload the whole list, every page, as one PDF.", summary: { kind: res.kind, lifeRows: 0, lifeOver: [], version: res.version || null } };
    const n = (res.lifeOver || []).length, ok = res.lifeVerified === true;
    // the crew is told the file is in; a count of parts is said only from a verified read
    return { read_state: "ok", say: !ok ? "Read. Thank you." : "Read. " + (n ? n + " part" + (n === 1 ? "" : "s") + " past rated life, for the team." : "No part past its rated life."),
      summary: { kind: res.kind, lifeRows: rows, lifeChecks: checks, lifeChecked: res.lifeChecked === true,
        // each figure's two sides as read (key, first read, second read, agreed) — the evidence beside its read; HON names
        // the second side `second` from v6 (the life page's rows copied as text), `counter` in v5 (the counter row)
        check: checks ? res.lifeCheck.map((p) => [p.key, p.front, p.second !== undefined ? p.second : p.counter, p.ok]) : undefined,
        lifeOver: res.lifeOver || [], lifeVerified: ok, recommendation: res.recommendation || null, version: res.version || null } };
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
