# How we ship a change to cims-hr-console (the standard)

This is the single procedure for shipping ANY change safely. Follow it and you do not
need to ask Miguel how to deploy, and you do not need a terminal. It exists so the process
lives in the repo, not in one person's head — a new teammate or an agent can follow it as-is.

## Environments
| Env | Worker | Database | How it deploys |
|-----|--------|----------|----------------|
| **Production** | `cims-hr-console` | prod D1 `f0ac8b6a-…` | Automatically, via Cloudflare Workers Builds, **on merge/push to `main`**. |
| **Staging** | `cims-hr-console-staging` | staging D1 `84ad4352-…` | **Manually**, via the `deploy-staging` Action button (pick any branch). Never touched by a merge. |

Staging is a real, separate Worker + separate database. Nothing you do there can affect prod.

## The standard flow
1. **Branch** from `main`.
2. **Build + test locally.** `npm test` must be green. Keep decision logic in small, pure,
   tested modules; keep the Worker glue thin.
3. **Editing rules.** Modules in `src/*.js` may be pushed whole-file via the GitHub connector.
   **`src/worker.js` is edited ONLY by surgical in-editor find/replace (never a whole-file push)** —
   it is ~377 KB and a full push has corrupted it before.
4. **Open a PR.** The `tests` gate runs on every PR; it must be **green on the latest commit**
   before merge. A green run on an older commit does not count.
5. **Deploy to STAGING** — the button: Actions tab → **deploy-staging** → **Run workflow** →
   choose your branch → Run. (One-time: the repo needs the `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID` secrets; see the workflow header.)
6. **Validate on staging.** Seed the staging DB if the test needs data, exercise the real
   path end-to-end, and check the staging D1 with the D1 tooling. Confirm the change does what
   it should AND that it did not touch anything it shouldn't.
7. **Review.** Anything touching **money, auth, schema, or crew data** is a PR for Miguel
   (CODEOWNERS + branch protection). Do not weaken a test to make it pass — the tests are the SOP.
8. **Merge to `main`.** Workers Builds deploys prod on the push.
9. **Verify it is LIVE (not just committed).** Hit the live API and confirm the new behaviour.
   A green commit is not a deploy (Workers Builds is a separate pipeline from the test gate).
10. **Rollback** = revert the merge commit (prod redeploys from the reverted `main`), or remove
   the change. Additive, delegated routes can also be disabled by removing their registration line.

## The non-negotiables (from CLAUDE.md)
- Tests are law; the gate blocks red code from merging.
- Money / auth / schema / crew changes are always human-reviewed PRs, never auto-merged.
- Validate on staging before prod.
- Verify live after deploy.
- Never handle secrets in code; they live in the CI / Worker secret stores.

## Why this doc exists
So shipping is **self-serve**. The goal is a system that runs without any single person as the
bottleneck: the button removes the terminal dependency, and this runbook removes the
"ask-how-to-do-it" dependency. Update this doc whenever the process changes.
