// EVERY EMAIL THIS CONSOLE SENDS IS READ ON A PHONE FIRST.
//
// Miguel, 23 Sep 2026, after two rounds of screenshots from Outlook on iOS: fix the rest of them.
// The failure mode is always the same and always invisible in code review — a 600px table that a
// phone cannot shrink, and iOS turning every date into a blue link. This is a static guard over
// every source that builds an email, so a NEW template cannot ship with the old shell either.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Each entry: the source, and what it sends. Add a row when a new email is written.
const SENDERS = [
  ["src/seafarer_movements.js", "the weekly Movements report"],
  ["src/doc_radar.js", "the weekly Fleet Document Radar"],
  ["src/signoff_ack.js", "the seafarer sign-off confirm + acknowledgement"],
  ["src/signoff_instructions.js", "the seafarer sign-off instructions"],
  ["src/emails/hr.magiclink.v2.js", "the console sign-in link"],
];
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf-8");

for (const [path, what] of SENDERS) {
  test(`${what} is fluid, not a fixed-width desktop table (${path})`, () => {
    const src = read(path);
    // Escaped (\") and plain (") forms both, since these templates are written both ways.
    assert.doesNotMatch(src, /style=\\?"width:600px/, "a fixed 600px table cannot shrink to a phone");
    assert.match(src, /max-width:600px/, "600px stays a ceiling");
  });

  test(`${what} has a phone breakpoint (${path})`, () => {
    assert.match(read(path), /@media only screen and \(max-width:6\d\dpx\)/, "no phone rules at all");
  });

  test(`${what} stops iOS relinking its dates (${path})`, () => {
    const src = read(path);
    assert.match(src, /format-detection/, "the meta that stops date/phone detection");
    assert.match(src, /x-apple-data-detectors/, "and the CSS that neutralises what slips through");
  });
}
