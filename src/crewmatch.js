// Crew name matcher — pure, testable. Given the free text of an email and the crew roster, work
// out which crew member it is about, WITH a confidence level. The whole point of the confidence is
// safety: a wrong match files a (possibly negative) note against the wrong seafarer, so anything
// less than a clean single full-name hit must NOT auto-file — it goes to a human review queue.

export function norm(s) {
  return String(s == null ? "" : s).toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

// roster row -> {agency_id, first, last, full}
export function buildRoster(crewRows) {
  return (crewRows || [])
    .map(c => ({
      agency_id: c.agency_id,
      first: norm(c.first_name),
      last: norm(c.last_name),
      full: norm((c.first_name || "") + " " + (c.last_name || "")),
      status: c.status || "",
    }))
    .filter(r => r.agency_id && r.full);
}

// Returns { agency_id, confidence: 'high'|'med'|'low'|'none', matchedName, candidates:[agency_id] }.
//   high  -> exactly one crew whose first AND last name both appear -> safe to auto-file
//   med   -> exactly one crew matched by last name only             -> auto-file allowed, flag as med
//   low   -> more than one plausible match (ambiguous)              -> REVIEW, never auto-file
//   none  -> no name found                                          -> REVIEW
export function matchCrew(text, roster) {
  const t = " " + norm(text) + " ";
  const has = (w) => w && t.indexOf(" " + w + " ") >= 0;

  // 1) full-name: first and last both present (adjacent in either order, or both anywhere)
  const full = (roster || []).filter(r => {
    if (!r.first || !r.last) return false;
    return t.indexOf(" " + r.first + " " + r.last + " ") >= 0
        || t.indexOf(" " + r.last + " " + r.first + " ") >= 0
        || (has(r.first) && has(r.last));
  });
  if (full.length === 1) return { agency_id: full[0].agency_id, confidence: "high", matchedName: full[0].full, candidates: [full[0].agency_id] };
  if (full.length > 1) return { agency_id: null, confidence: "low", matchedName: null, candidates: full.map(r => r.agency_id) };

  // 2) last-name only
  const last = (roster || []).filter(r => has(r.last));
  if (last.length === 1) return { agency_id: last[0].agency_id, confidence: "med", matchedName: last[0].full, candidates: [last[0].agency_id] };
  if (last.length > 1) return { agency_id: null, confidence: "low", matchedName: null, candidates: last.map(r => r.agency_id) };

  return { agency_id: null, confidence: "none", matchedName: null, candidates: [] };
}
