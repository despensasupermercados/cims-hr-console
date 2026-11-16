-- Every contract TDG's AdvancedQuery has shown, kept (bug hunt, 16 Nov 2026). registry_snapshot keeps ONE row per crew —
-- the latest file's — so a contract left the console the day TDG moved that row on. One row per crew and embark date;
-- written by the registry import after its own batch (src/crew_import_routes.js keepContracts). Nothing reads it yet.
-- The same CREATE runs in the worker's ensureRegistrySnapshot guard.
CREATE TABLE IF NOT EXISTS registry_contract (
  sc TEXT NOT NULL,
  embarked_at TEXT NOT NULL,
  vessel TEXT,
  debarked_at TEXT,
  name TEXT,
  first_run_at TEXT NOT NULL,
  last_run_at TEXT NOT NULL,
  closed_run_at TEXT,
  PRIMARY KEY (sc, embarked_at)
);
