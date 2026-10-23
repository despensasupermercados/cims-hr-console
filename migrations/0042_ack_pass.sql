-- The 7-day sign-off email in the pass style (23 Oct 2026): the pass the email showed is kept on the request, so the
-- confirmation page shows the same ship, dates and port. The same ALTER runs in signoff_ack.js's guard (duplicate column
-- swallowed there); a row filed before it has NULL and the page reads its old fields.
ALTER TABLE ack_request ADD COLUMN pass_json TEXT;
