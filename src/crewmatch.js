// Crew name matcher — pure, testable. Given the free text of an email and the crew roster, work
// out which crew member it is about, WITH a confidence level. The whole point of the confidence is
// safety: a wrong match files a (possibly negative) note against the wrong seafarer, so anything
// less than a clean single hit must NOT auto-file — it goes to a human review queue.
//
// v2 (2026-07-17) — fixes the "Resposo case" (docs/DATA_PAGE_BUILD_STATUS.md sibling workstream):
//   1. FRESH-FIRST: forwarded threads are matched on the fresh note ABOVE the quoted thread first
//      (that is where the reporter names the subject). Quoted To:/Cc:/From: header lines are
//      stripped so correspondents stop masquerading as subjects.
//   2. FIRST-NAME TOKENS: compound first names ("Michael Angelo") match on any token >=3 chars
//      ("Michael Resposo" now satisfies first+last for Michael Angelo Resposo).
//   3. NO SHORT-CIRCUIT: ambiguity no longer hides lower-tier candidates — the review queue gets
//      phrase hits, first+last hits AND unique-surname hits (capped), so the right person is
//      always on the card.
// Still fully deterministic — no fuzzy auto-filing.

export function norm(s) {
  return String(s == null ? "" : s).toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

// Remove quoted-thread header lines (To:/Cc:/From:/Sent:/Date:/Subject:) — metadata, not content.
export function stripHeaderLines(text) {
  return String(text || "").split(/\r?\n/)
    .filter(l => !/^\s*>*\s*(from|to|cc|bcc|sent|date|subject)\s*:/i.test(l))
    .join("\n");
}

// The fresh part of a reply/forward: everything above the first quoted-thread marker.
// Falls back to the whole text when the fresh part is trivially short.
export function freshPart(text) {
  const s = String(text || "");
  const markers = [/^\s*>*\s*-{2,}\s*(original|forwarded) message/im, /^\s*>*\s*from\s*:/im, /^on .{0,140}wrote:/im];
  let cut = s.length;
  for (const m of markers) { const i = s.search(m); if (i >= 0 && i < cut) cut = i; }
  const f = s.slice(0, cut);
  return norm(f).length >= 12 ? f : s;
}

// roster row -> {agency_id, first, last, full, firstToks}
export function buildRoster(crewRows) {
  return (crewRows || [])
    .map(c => {
      const first = norm(c.first_name), last = norm(c.last_name);
      return {
        agency_id: c.agency_id,
        first, last,
        full: norm((c.first_name || "") + " " + (c.last_name || "")),
        firstToks: first.split(" ").filter(t => t.length >= 3),
        status: c.status || "",
      };
    })
    .filter(r => r.agency_id && r.full);
}

// Tier the roster against one padded, normalized text.
//   P: contiguous phrase "<first-variant> <last>" (either order) — strongest
//   F: first (or any first token) AND last both present anywhere
//   L: last name only
function tiers(t, roster) {
  const has = (w) => w && t.indexOf(" " + w + " ") >= 0;
  const P = [], F = [], L = [];
  for (const r of (roster || [])) {
    if (!r.last || !has(r.last)) continue;
    const variants = [r.first, ...r.firstToks].filter(Boolean);
    const phrase = variants.some(v => t.indexOf(" " + v + " " + r.last + " ") >= 0 || t.indexOf(" " + r.last + " " + v + " ") >= 0);
    const firstHit = has(r.first) || r.firstToks.some(has);
    if (phrase) P.push(r);
    else if (firstHit) F.push(r);
    else L.push(r);
  }
  return { P, F, L };
}

// Returns { agency_id, confidence: 'high'|'med'|'low'|'none', matchedName, candidates:[agency_id] }.
//   high -> exactly one crew named (phrase in the fresh note, or unique phrase / first+last overall)
//   med  -> exactly one crew matched by last name only
//   low  -> ambiguous -> REVIEW, never auto-file; candidates include ALL tiers (capped)
//   none -> no name found -> REVIEW
export function matchCrew(text, roster) {
  const pad = (s) => " " + norm(s) + " ";
  const fresh = tiers(pad(stripHeaderLines(freshPart(text))), roster);
  const whole = tiers(pad(stripHeaderLines(text)), roster);

  const hit = (r) => ({ agency_id: r.agency_id, confidence: "high", matchedName: r.full, candidates: [r.agency_id] });
  if (fresh.P.length === 1) return hit(fresh.P[0]);
  if (fresh.P.length === 0 && whole.P.length === 1) return hit(whole.P[0]);
  if (whole.P.length === 0 && whole.F.length === 1) return hit(whole.F[0]);
  if (whole.P.length === 0 && whole.F.length === 0 && whole.L.length === 1) {
    const r = whole.L[0];
    return { agency_id: r.agency_id, confidence: "med", matchedName: r.full, candidates: [r.agency_id] };
  }

  const seen = new Set(), cands = [];
  for (const r of [...fresh.P, ...whole.P, ...whole.F, ...whole.L]) {
    if (seen.has(r.agency_id)) continue;
    seen.add(r.agency_id); cands.push(r.agency_id);
    if (cands.length >= 6) break;
  }
  if (cands.length) return { agency_id: null, confidence: "low", matchedName: null, candidates: cands };
  return { agency_id: null, confidence: "none", matchedName: null, candidates: [] };
}
