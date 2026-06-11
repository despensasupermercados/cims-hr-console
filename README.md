# CIMS HR Console

Two-user (Miguel + Rita) operational console for seafarer Keyman rotation and the
contract-completion bonus. Crew never log in. Cloudflare Worker + D1.

## Layout
- `src/worker.js` — the Worker (single source of truth). Imports the money/auth logic.
- `src/bonus.js` — locked bonus SOP (scoring, ladder, gates, feedback mapping). **Money.**
- `src/auth.js` — signed-token auth primitives + allowlist.
- `test/` — the deploy gate (`npm test`). Bonus golden cases, feedback mapping, auth.
- `migrations/` — versioned D1 schema + seed (`wrangler d1 migrations apply`).
- `.github/workflows/test.yml` — runs the gate on every push/PR.
- `.github/workflows/self-maintenance.yml` — nightly review/repair agent.
- `CLAUDE.md` — rules every agent must follow (read it).

## Develop
```
npm install
npm test          # the gate — must be green
```

## Deploy
Production deploys happen automatically via Cloudflare Workers Builds on push to `main`
(it runs `npm test`, applies migrations, then `wrangler deploy`). Manual fallback:
```
npm run deploy            # test -> migrate (prod) -> deploy
npm run deploy:staging    # test -> migrate (staging) -> deploy to staging
```

## Guardrails
Changes to `src/bonus.js`, `src/auth.js`, `migrations/`, or the bonus tests require
Miguel's review (CODEOWNERS + branch protection). The nightly agent may only auto-merge
the whitelist in CLAUDE.md; money/auth/schema/crew changes are always PRs for a human.

## Secrets (set in Cloudflare Worker settings / CI — never in code)
`SESSION_SECRET`, `BOOTSTRAP_KEY`, `RESEND_API_KEY` (opt), `MAIL_FROM` (opt);
CI: `CLOUDFLARE_API_TOKEN`, `ANTHROPIC_API_KEY`.


<!-- ci: trigger Workers Build (deploy pipeline test) -->
