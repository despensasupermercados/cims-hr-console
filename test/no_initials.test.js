// No initials circles (Miguel, 14 Oct 2026, over a "KL" circle: "i dont like this .. remove them from everywhere. there is
// no value if we dont have photos"). The name is written beside every one of them, and the status they were coloured by
// has its own chip on the same card. Guards the console page and the audit app.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL("../src/" + f, import.meta.url), "utf8");
test("no initials circles anywhere: no crav / ntav / avatar classes, no initials helper", () => {
  for (const f of ["worker.js", "audit_ui.js", "audit_upload_ui.js", "relief_ui.js", "crew_import_ui.js"]) {
    const s = read(f);
    assert.doesNotMatch(s, /class=crav|class=ntav|\.crav\{|\.ntav\{|ravatar|class="av\b|function initials\(/, f + " draws an initials circle again");
    assert.doesNotMatch(s, /\.charAt\(0\)\+\(c\.last_name/, f + " builds initials from a crew's names");
  }
});
