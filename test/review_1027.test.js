import { test } from "node:test";
import assert from "node:assert/strict";
import { installAutoSend } from "../src/auto_send.js";

// 27 Oct 2026 review, read off production. Two of the eight sign-off passes sent since 16 Oct are stale: Rita moved the
// sign-off AFTER the pass went (Paqueo, Reflection: pass said 6 Nov, sign-off now 13 Nov; Batadlan, Voyager: pass said
// 30 Oct, now 13 Nov). The daily run then met the new date (seq 20261113) and, finding the old pass's instr_ack row within
// 21 days, marked it "manual-preexisting" and said nothing — the crew keeps a pass with the wrong date and nobody is told.
// Now: a pass on file for the SAME date is quiet, as before; a pass on file for ANOTHER date is a digest alert
// ("date_moved"), every day until the pass is re-sent from the crew page, and nothing is marked or emailed by itself.

function gateHourInstant() {
  for (let h = 0; h < 24; h++) {
    const d = new Date(Date.UTC(2026, 10, 2, h, 0, 0));
    const hour = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Budapest", hour: "2-digit", hour12: false })
      .formatToParts(d).find((p) => p.type === "hour").value;
    if (hour === "08") return d;
  }
  throw new Error("no UTC hour maps to 08:00 Europe/Budapest");
}
const plus = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function harness({ leg, ackRows = [] }) {
  const digests = [], marked = [], sends = [];
  const env = {
    DB: {
      prepare(sql) {
        const st = { sql, args: [] };
        st.bind = (...a) => { st.args = a; return st; };
        st.run = async () => { if (/INSERT OR REPLACE INTO auto_send_log/.test(sql)) marked.push({ sc: st.args[0], seq: st.args[1], kind: st.args[2], note: st.args[4] }); return { meta: { changes: 1 } }; };
        st.first = async () => {
          if (/app_setting/.test(sql)) return /instr_since/.test(st.args[0]) ? { v: "2026-10-16" } : /instr_enabled/.test(st.args[0]) ? { v: "true" } : null;
          if (/FROM auto_send_log WHERE/.test(sql)) return null;
          if (/FROM instr_ack/.test(sql)) {
            // the nearest row to the asked date within 21 days, as the real query orders it
            const want = st.args[1];
            const near = ackRows.filter((r) => r.sc === st.args[0] && Math.abs((Date.parse(r.sign_off_date) - Date.parse(want)) / 864e5) <= 21)
              .sort((a, b) => Math.abs(Date.parse(a.sign_off_date) - Date.parse(want)) - Math.abs(Date.parse(b.sign_off_date) - Date.parse(want)));
            return near[0] || null;
          }
          return null;
        };
        st.all = async () => (/FROM crew c/.test(sql) ? { results: [{ agency_id: leg.sc, email: "crew@example.com", redacted: 0 }] } : { results: [] });
        return st;
      },
    },
  };
  const run = installAutoSend({
    sendInstructionsFor: async (_e, sc, seq) => { sends.push({ sc, seq }); return { emailed: true, to: "crew@example.com" }; },
    sendSignoffLinkFor: async () => ({ emailed: true }),
    sendViaMailer: async (_e, envelope) => { digests.push(envelope); return { ok: true }; },
    BOARD_LEGS: async () => [leg],
    ORIGIN: "https://cims.work", DIGEST_TO: ["miguel@dg3.com"], DIGEST_CC: ["rita@dg3.com"],
  });
  return { run, env, digests, marked, sends, event: { scheduledTime: gateHourInstant().getTime() } };
}

test("a pass on file for ANOTHER date is a digest alert, not a silent 'manual-preexisting' mark", async () => {
  const off = plus(10), old = plus(3);
  const h = harness({ leg: { sc: "SC-0038115", name: "Bernard Paqueo", ship: "Reflection", off, port: "Freeport" }, ackRows: [{ sc: "SC-0038115", sign_off_date: old, status: "acknowledged" }] });
  const res = await h.run(h.env, h.event);
  assert.equal(res.ran, true);
  assert.deepEqual(h.sends, [], "nothing is emailed by itself — the re-send is Rita's click");
  assert.deepEqual(h.marked, [], "not marked: it must come back tomorrow until the pass is re-sent");
  assert.equal(res.alerts, 1);
  const html = h.digests[0].html;
  assert.match(html, /sign-off moved/i);
  assert.match(html, new RegExp(old.replace(/-/g, "-")), "the digest names the date the crew's pass says");
  assert.match(html, /re-send/i);
});

test("a pass on file for the SAME date stays quiet (manual send on file), as before", async () => {
  const off = plus(10);
  const h = harness({ leg: { sc: "SC-0038115", name: "Bernard Paqueo", ship: "Reflection", off }, ackRows: [{ sc: "SC-0038115", sign_off_date: off, status: "pending" }] });
  const res = await h.run(h.env, h.event);
  assert.deepEqual(h.sends, []);
  assert.deepEqual(h.marked.map((m) => m.note), ["manual-preexisting"]);
  assert.equal(res.alerts, 0);
});

test("no pass on file at all: the instructions go, as before", async () => {
  const off = plus(10);
  const h = harness({ leg: { sc: "SC-0038115", name: "Bernard Paqueo", ship: "Reflection", off }, ackRows: [] });
  const res = await h.run(h.env, h.event);
  assert.equal(h.sends.length, 1);
  assert.equal(res.sent, 1);
});
