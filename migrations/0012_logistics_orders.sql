-- 0012_logistics_orders.sql
-- Connect the parts / logistics domain to the spine (Ship Plan Stage 4).
-- Brings the cims-parts-orders tables INTO the main cims-hr-console DB as the
-- logistics domain, with a REAL foreign key to vessel — so a parts order can
-- never reference a ship that isn't in the canonical fleet. Additive & safe.
-- Proven on cims-hr-console-staging: a valid order joined to vessel "Silhouette";
-- a bogus vessel_id was rejected by the FK.
--
-- WHY NOW: the parts DB currently holds 1 order + 34 shipping invoices. Linking it
-- at 1 row is trivial; linking it at 10,000 is a project. This is the moment.
--
-- GO-LIVE NOTE (not part of this migration): the separate cims-parts-mailer worker
-- must be repointed to write here and resolve vessel_id + brand from ship/company
-- on write (Silhouette -> ves_silhouette, "Celebrity Cruises" -> 'Celebrity').
-- The one existing order backfills cleanly (see bottom).

CREATE TABLE IF NOT EXISTS orders (
  order_ref       TEXT PRIMARY KEY,
  vessel_id       TEXT REFERENCES vessel(id),        -- the spine link (FK enforced)
  brand           TEXT CHECK (brand IN ('Royal Caribbean','Celebrity','Azamara','NCL')),
  idempotency_key TEXT, submitted_at TEXT, created_at TEXT DEFAULT (datetime('now')),
  order_type TEXT, miss_reason TEXT, miss_label TEXT, miss_note TEXT, requester TEXT,
  company TEXT, ship TEXT,                            -- original free-text kept for reference/audit
  machine_serial TEXT, needed_by TEXT,
  dest_port TEXT, dest_country TEXT, dest_zone TEXT, dest_agent TEXT, dest_city TEXT,
  dest_zip TEXT, dest_phone TEXT, dest_email TEXT,
  item_count INTEGER, unit_count INTEGER,
  subtotal REAL, freight REAL, clearance REAL, grand_total REAL,
  notes TEXT, send_status TEXT, send_detail TEXT, delivery_windows TEXT, items TEXT, payload TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_vessel ON orders(vessel_id);
CREATE INDEX IF NOT EXISTS idx_orders_brand ON orders(brand);

CREATE TABLE IF NOT EXISTS ups_shipment (
  invoice_no TEXT NOT NULL, ship_idx INTEGER NOT NULL,
  inv_date TEXT, dest_country TEXT, dest_city TEXT, zone TEXT, service TEXT,
  weight REAL, brokerage REAL, duty_vat REAL, total REAL, description TEXT,
  invoice_kind TEXT DEFAULT 'clearance', ingested_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (invoice_no, ship_idx)
);

-- Backfill the single existing order (from cims-parts-orders) once its data is
-- copied over. Example (the current row):
--   UPDATE orders SET vessel_id='ves_silhouette', brand='Celebrity'
--     WHERE ship='Silhouette' AND company='Celebrity Cruises';
