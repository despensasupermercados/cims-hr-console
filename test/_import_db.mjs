// A real SQLite database built from the repo's migrations, behind a D1-shaped shim (the 16 Nov 2026 imports review's harness).
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const REPO = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
export function makeDb({ quiet = true } = {}) {
  const d = new DatabaseSync(":memory:");
  const skipped = [];
  for (const f of readdirSync(REPO + "/migrations").sort()) {
    const sql = readFileSync(REPO + "/migrations/" + f, "utf-8");
    try { d.exec(sql); } catch (e) {
      // statement by statement, so one that SQLite refuses (an ALTER already applied by an earlier file) does not lose the rest
      for (const st of sql.split(/;\s*\n/)) { const s = st.trim(); if (!s) continue; try { d.exec(s); } catch (e2) { skipped.push(f + ": " + String(e2.message).slice(0, 90)); } }
    }
  }
  if (!quiet) console.log("migration statements skipped:", skipped.length, skipped.slice(0, 8));
  // production shape the migrations do not carry (added at runtime / by hand in prod; the repo's tests declare them the same way)
  for (const c of ["role TEXT", "on_port_seed TEXT", "off_port_seed TEXT", "override_on_city TEXT", "override_off_city TEXT", "succeeds_assignment_id TEXT", "eccr INTEGER NOT NULL DEFAULT 0", "air INTEGER NOT NULL DEFAULT 0", "hotel INTEGER NOT NULL DEFAULT 0", "on_date_conf INTEGER NOT NULL DEFAULT 0", "off_date_conf INTEGER NOT NULL DEFAULT 0", "instructions_sent_at TEXT", "signoff_link_sent_at TEXT", "review_invite_sent_at TEXT", "deployed_at TEXT", "deploy_log_id TEXT"]) { try { d.exec("ALTER TABLE assignment ADD COLUMN " + c); } catch {} }
  d.exec("CREATE TABLE IF NOT EXISTS ship_leg (id INTEGER PRIMARY KEY AUTOINCREMENT, brand TEXT, ship_short TEXT, sc TEXT, crew_id TEXT, ours INTEGER NOT NULL DEFAULT 1, on_date TEXT, off_date TEXT, embark TEXT, disembark TEXT, is_current INTEGER NOT NULL DEFAULT 0, source TEXT)");
  d.exec("CREATE TABLE IF NOT EXISTS vessel_port_day (ship_short TEXT, berth_date TEXT, port TEXT, is_turnaround INTEGER DEFAULT 0)");
  d.exec("CREATE TABLE IF NOT EXISTS relief_comment (id TEXT PRIMARY KEY, assignment_id TEXT, text TEXT, created_at TEXT)");
  try { d.exec("ALTER TABLE crew ADD COLUMN gender TEXT"); } catch {}
  d.prepare("INSERT INTO app_config (key, value, updated_at) VALUES ('board_source','ship_leg','2026-09-14T00:00:00Z') ON CONFLICT(key) DO UPDATE SET value='ship_leg'").run();
  return d;
}
const norm = (v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);
export function d1(d, log = []) {
  const mk = (sql, args = []) => ({
    sql, args,
    bind: (...a) => { if (a.some((x) => x === undefined)) throw new Error("D1_TYPE_ERROR: undefined bound in: " + sql.slice(0, 80)); return mk(sql, a); },
    first: async () => { const r = d.prepare(sql).get(...args.map(norm)); return r === undefined ? null : r; },
    all: async () => ({ results: d.prepare(sql).all(...args.map(norm)) }),
    run: async () => { const r = d.prepare(sql).run(...args.map(norm)); log.push(sql); return { success: true, meta: { changes: Number(r.changes) } }; },
  });
  return {
    prepare: (sql) => mk(sql),
    batch: async (stmts) => {
      d.exec("BEGIN");
      try {
        const out = [];
        for (const s of stmts) {
          if (/^\s*(SELECT|WITH)/i.test(s.sql)) out.push({ success: true, results: d.prepare(s.sql).all(...s.args.map(norm)) });
          else { const r = d.prepare(s.sql).run(...s.args.map(norm)); log.push(s.sql); out.push({ success: true, meta: { changes: Number(r.changes) } }); }
        }
        d.exec("COMMIT"); return out;
      } catch (e) { d.exec("ROLLBACK"); throw e; }
    },
  };
}
