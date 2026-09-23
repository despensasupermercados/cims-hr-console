// The Movements email is read on a phone first. Miguel, 23 Sep 2026, on the Outlook-iOS rendering:
// "the mobile version of this email looks horrible ... not cramped like that".
//
// These pin the four things that made it cramped, because every one of them is a single character
// away from coming back: a fixed width, a fat gutter, small type, and two columns fighting for room.
import { test } from "node:test";
import assert from "node:assert/strict";
import { shapeMovements, buildSeafarerMovementEmail } from "../src/seafarer_movements.js";

const RUN = "2026-09-21";
const CREW = [
  { agency_id: "A", name: "Maria Cristina Dela Cruz-Manzanares", ship: "Symphony of the Seas",
    disembark: "Port Canaveral, Florida", signOn: "2026-03-01", signOff: "2026-09-24", offConfirmed: true, contracts: 2 },
  { agency_id: "B", name: "Jonathan De Torres", ship: "Navigator", embark: "TBA",
    signOn: "2026-09-25", signOff: "2027-03-25", contracts: 0 },
];
const render = () => {
  const { signOns, signOffs } = shapeMovements(CREW, RUN);
  signOffs[0].relief = { state: "none" };
  return buildSeafarerMovementEmail({ runDate: RUN, signOns, signOffs });
};

test("the layout is fluid — a fixed pixel width is what squeezed it on a phone", () => {
  const html = render();
  assert.match(html, /max-width:600px/, "600px is a ceiling");
  assert.match(html, /width:100%;max-width:600px/, "...not a fixed width");
});

test("the phone rules exist: narrower gutters, bigger type, one column", () => {
  const html = render();
  assert.match(html, /@media only screen and \(max-width:620px\)/, "a phone breakpoint");
  assert.match(html, /\.stack\s*\{[^}]*display:block\s*!important/, "two columns become two rows");
  assert.match(html, /\.px\s*\{[^}]*padding-left:14px\s*!important/, "the side gutter shrinks");
  assert.match(html, /\.nm\s*\{[^}]*font-size:16px\s*!important/, "names are legible at arm's length");
  assert.match(html, /\.sub, \.dt, \.note\s*\{[^}]*font-size:14px\s*!important/, "so is the body copy");
});

test("iOS does not get to turn our dates into blue links", () => {
  const html = render();
  assert.match(html, /<meta name="format-detection" content="telephone=no,date=no,address=no,email=no">/);
  assert.match(html, /a\[x-apple-data-detectors\][\s\S]{0,200}text-decoration: none !important/);
});

test("a card reads as lines, not as a grid: who, where, when", () => {
  const html = render();
  const at = html.indexOf("Maria Cristina");
  const card = html.slice(at - 400, at + 1200);
  const nm = card.indexOf("class=\"nm\""), where = card.indexOf("Symphony of the Seas"), when = card.indexOf("off Thu 24 Sep");
  assert.ok(nm >= 0 && where > nm && when > where, "name, then ship and port, then the date");
  assert.match(card, /class="dt nolink"/, "the date has a line of its own");
});

test("no body copy below 10.5px — the old 12.5px was already too small on a phone", () => {
  // The wordmark is masthead typography (letter-spaced small caps) and is scanned separately; this
  // is about everything a reader actually has to READ.
  const html = render();
  const body = html.slice(html.indexOf("Weekly crew movements"));
  const sizes = [...body.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
  assert.ok(sizes.length > 10, "sizes are declared inline, as email requires");
  assert.equal(sizes.filter((n) => n < 10.5).length, 0, "nothing smaller than 10.5px in the body");
  // ...and the lines that carry the answer are the biggest things on the card.
  assert.match(body, /class="nm"[^>]*font-size:15\.5px/, "the name leads");
  assert.match(body, /class="dt nolink"[^>]*font-size:13\.5px[^>]*font-weight:600/, "the date is set in bold body size");
});
