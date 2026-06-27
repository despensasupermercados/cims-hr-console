# cims-parts-mailer

A small Cloudflare Worker that sends the CIMS parts-request emails for `order.cims.work`.
It reuses the **same Resend account + verified `cims.work` sender** as `cims-hr-console`,
so emails come from `parts@cims.work` (not despensa) and clear corporate spam filters.

The parts form already POSTs to this Worker (`https://parts-api.cims.work/order`) with a
graceful fallback — once this is deployed and the key is set, the form's "Send" button
starts delivering real email automatically. No form change needed.

## What it does
- `POST /order` — validates the order, renders the branded HTML email, sends via Resend to
  Ray's team + the vessel, returns `{ok:true, orderRef}`.
- CORS is open to exactly `https://order.cims.work` and nothing else.

## Deploy (same pipeline as your other CIMS workers)
From this folder, with wrangler authorized to the account:

```bash
npx wrangler deploy                       # creates the worker + parts-api.cims.work
npx wrangler secret put RESEND_API_KEY    # paste the Resend key when prompted
```

That's it. `MAIL_FROM` is already set in `wrangler.toml`. The custom domain
`parts-api.cims.work` is provisioned automatically on first deploy.

> The `RESEND_API_KEY` is the one secret that must be entered by a human — reuse the same
> value the HR console uses, or create a new key at resend.com (it has full send rights on
> the already-verified `cims.work` domain).

## Verify
1. Open `order.cims.work`, build a real order, hit **Send** — it should say "Request sent ✓".
2. Check the recipient inbox. For a first test, point recipients at yourself only.

## Files
- `src/worker.js` — the worker (validation + Resend send + branded HTML email)
- `wrangler.toml` — name, MAIL_FROM, custom domain route
