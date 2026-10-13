-- 13 Oct 2026: the board's itinerary reads (src/port_days.js) seek by ship + date, and the fleet turnaround read
-- by date among turnaround days. Neither could use the primary key (brand, ship_short, berth_date, stop_seq):
-- each board load read ~190,000 rows (~70ms in D1) twice, plus a 40,553-row scan for the turnarounds.
CREATE INDEX IF NOT EXISTS idx_vpd_ship_date ON vessel_port_day (ship_short, berth_date);
CREATE INDEX IF NOT EXISTS idx_vpd_turn_date ON vessel_port_day (berth_date) WHERE is_turnaround = 1;
