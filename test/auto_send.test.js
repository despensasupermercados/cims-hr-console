import { test } from "node:test";
import assert from "node:assert/strict";
import { installAutoSend } from "../src/auto_send.js";

// AUTO-TIMING RUN GUARD (2026-09-10). runAutoSend was the ONE task in the Worker's scheduled()
// handler that could reject unhandled — every other cron either wraps its own body or carries a
// .catch at the call site. A throw inside processKind aborted BEFORE both sendDigest and logRun,
// so a failed run left NO digest and NO run row: exactly the "dead cron vs nothing qualified"
// distinction logRun was built to make, silently erased. These pin the guard.

// The run is gated to 08:00 Europe/Budapest. Find the UTC instant that satisfies it rather than
// hardcoding an offset, so the test does not break twice a year on DST.
function gateHourInstant() {
  for (let h = 0; h < 24; h++) {
    const d = new Date(Date.UTC(2026, 8, 10, h, 0, 0));
    const hour = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Budapest", hour: "2-digit", hour12: false })
      .formatToParts(d).find((p) => p.type === "hour").value;
    if (hour === "08") return d;
  }
  throw new Error("no UTC hour maps to 08:00 Europe/Budapest");
}

function harness({ boardLegsThrows = false } = {}) {
  const runRows = [];
  const digests = [];
  const env = {
    DB: {
      prepare(sql) {
        const st = { sql, args: [] };
        st.bind = (...a) => { st.args = a; return st; };
        st.run = async () => {
          if (/INSERT INTO auto_send_run/.test(sql)) runRows.push({ outcome: st.args[1], sent: st.args[3], alerts: st.args[4] });
          return { meta: { changes: 1 } };
        };
        st.first = async () => (/app_setting/.test(sql) ? { v: "true" } : null);
        st.all = async () => ({ results: [] });
        return st;
      },
    },
  };
  const run = installAutoSend({
    sendInstructionsFor: async () => ({ emailed: true }),
    sendSignoffLinkFor: async () => ({ emailed: true }),
    sendViaMailer: async (_e, envelope) => { digests.push(envelope); return { ok: true }; },
    BOARD_LEGS: async () => { if (boardLegsThrows) throw new Error("board read blew up"); return []; },
    ORIGIN: "https://cims.work",
    DIGEST_TO: ["miguel@dg3.com"],
    DIGEST_CC: ["rita@dg3.com"],
  });
  return { run, env, runRows, digests, event: { scheduledTime: gateHourInstant().getTime() } };
}

test("a healthy run records outcome 'ran' and sends one digest", async () => {
  const h = harness();
  const res = await h.run(h.env, h.event);
  assert.equal(res.ran, true);
  assert.deepEqual(h.runRows.map((r) => r.outcome), ["ran"]);
  assert.equal(h.digests.length, 1);
});

test("a THROW inside the run does not reject — it is caught", async () => {
  const h = harness({ boardLegsThrows: true });
  // The whole point: this must resolve, not reject. An unhandled rejection in ctx.waitUntil is
  // invisible in the app's own audit trail.
  const res = await h.run(h.env, h.event);
  assert.equal(res.failed, true);
  assert.match(res.error, /board read blew up/);
});

test("a failed run still records a run row — 'dead cron' stays distinguishable from 'nothing qualified'", async () => {
  const h = harness({ boardLegsThrows: true });
  await h.run(h.env, h.event);
  assert.deepEqual(h.runRows.map((r) => r.outcome), ["failed"],
    "without a row, a dead cron and a quiet day look identical in auto_send_run");
});

test("a failed run still tries to raise it in the digest", async () => {
  const h = harness({ boardLegsThrows: true });
  await h.run(h.env, h.event);
  assert.equal(h.digests.length, 1, "the failure must still reach a human");
  assert.match(JSON.stringify(h.digests[0]), /AUTO-TIMING RUN FAILED/);
  assert.match(JSON.stringify(h.digests[0]), /board read blew up/);
});

test("outside the gate hour it does nothing at all", async () => {
  const h = harness();
  const off = new Date(gateHourInstant().getTime() + 3 * 3600 * 1000);
  const res = await h.run(h.env, { scheduledTime: off.getTime() });
  assert.equal(res.skipped, "not_gate_hour");
  assert.equal(h.runRows.length, 0);
  assert.equal(h.digests.length, 0);
});
