// What the welcome email says, read off the board's ONE schedule (§11): the running contract, the crew whose contract on
// the same hull ended nearest this sign-on (the person handing over, ±RELIEF_WINDOW_DAYS), the next payday. Pure. Never a
// guess: no predecessor on record = null; no running contract = null (nothing to welcome). Pinned by
// test/welcome_email.test.js.
import { nextPayday } from "./payroll.js";
import { shipCode, shipWord } from "./ship_codes.js";
import { mdParts, mdShort } from "./span_md.js";
import { RELIEF_WINDOW_DAYS } from "./signoff_context.js";
import { isVisit, visitMap, trainerSet } from "./visits.js";

// A trainer's trip that only Rita's card holds (no TDG file has it yet) is a training visit like a file trip (visits.js:
// the trainer tag, unless Rita marked the trip a full contract) — never welcomed, never "your contract" on the Hub.
// The file path marks its own legs (legsFromRegistry); this marks the card legs, for the Hub and the welcome only.
export function markCardVisits(legs, visitRows, trainerRows) {
  const vm = visitMap(visitRows || []), ts = trainerSet(trainerRows || []);
  return (Array.isArray(legs) ? legs : []).map((l) => (l && l.source === "assignment" && !l.visit && isVisit(vm, l.sc, l.on, { agency_id: l.sc, trainer: ts.has(l.sc) }) ? { ...l, visit: true } : l));
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const iso = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const day = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
export const dmy = (s) => (iso(s) ? `${+s.slice(8, 10)} ${MON[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}` : "");
const firstWord = (s) => String(s || "").trim().split(/\s+/)[0] || "";
const cap = (w) => (w ? w[0].toUpperCase() + w.slice(1) : "");
// The running contract of one crew from the board's schedule: the current leg with the latest sign-on, never a visit, and
// never Rita's card that a TDG file dated AFTER its sign-on contradicts — the file has them On board another hull (23 Oct
// 2026 review: Gayda's Allure card beat her real Jewel contract on the Hub) or ASHORE (27 Oct 2026 review: a card whose
// sign-on passed while the later file still has the crew On Vacation, debarked from the last ship, is a relief that did
// not happen; the board draws it off, §10d, and the Hub told him he was aboard). The file keeps one row per crew, so a
// registry leg that is not current is the file saying "ashore". A crew the file lists with no embark date has no leg here.
const hull = (s) => String(s == null ? "" : s).trim().toLowerCase();
export function currentLeg(legs, sc) {
  const all = Array.isArray(legs) ? legs : [];
  const fileLegs = all.filter((r) => r && r.sc === sc && r.source === "registry" && iso(r.fileAt));
  const contradicted = (l) => l.source === "assignment" && fileLegs.some((r) => r.fileAt > l.on && !(r.is_current && hull(r.ship) === hull(l.ship)));
  const mine = all.filter((l) => l && l.sc === sc && l.is_current && l.ours !== false && !l.visit && iso(l.on) && !contradicted(l));
  mine.sort((a, b) => (a.on < b.on ? 1 : a.on > b.on ? -1 : 0));
  return mine[0] || null;
}

const same = (a, b) => shipWord(a) && shipWord(a) === shipWord(b);

// The crew handing the seat over: another crew's leg on the same hull whose end is nearest this sign-on, within the window.
export function predecessorOf(legs, leg) {
  if (!leg || !iso(leg.on)) return null;
  let best = null, gap = Infinity;
  for (const l of Array.isArray(legs) ? legs : []) {
    if (!l || l.sc === leg.sc || l.ours === false || l.visit || !iso(l.on) || !iso(l.off) || !same(l.ship, leg.ship) || l.on >= leg.on) continue;
    const g = Math.abs(day(l.off) - day(leg.on)) / 864e5;
    if (g <= RELIEF_WINDOW_DAYS && g < gap) { gap = g; best = l; }
  }
  return best ? { sc: best.sc, name: best.name || null, first: firstWord(best.name), since: dmy(best.on) } : null;
}

export function welcomeContext({ crew, legs, today, links }) {
  const sc = crew && crew.agency_id;
  const leg = currentLeg(legs, sc);
  if (!leg || !iso(leg.off)) return null;
  const p = mdParts(leg.on, leg.off);
  const np = nextPayday(today);
  const prev = predecessorOf(legs, leg);
  return {
    sc, first: firstWord(crew.first_name), name: [crew.first_name, crew.last_name].filter(Boolean).join(" ").trim(),
    position: crew.rank_observed || "Printer Specialist", brand: leg.brand || null, ship: leg.ship, shipShort: cap(shipWord(leg.ship)), code: shipCode(leg.ship),
    port: leg.embark || null, on: dmy(leg.on), off: dmy(leg.off), offSource: leg.offSource || "projected",
    months: p ? (p.d ? mdShort(leg.on, leg.off) : `${p.m} months`) : "",
    prev: prev && prev.name ? prev : null, today: dmy(today),
    // "from today" only when read on the sign-on day; a catch-up send says "since", a preview before it "from".
    yours: !iso(today) || today === leg.on ? "from today" : today > leg.on ? `since ${dmy(leg.on)}` : `from ${dmy(leg.on)}`,
    nextPay: np ? `${WD[new Date(day(np.paid)).getUTCDay()]} ${+np.paid.slice(8, 10)} ${MON[+np.paid.slice(5, 7) - 1]}` : null,
    links: links || {},
  };
}
