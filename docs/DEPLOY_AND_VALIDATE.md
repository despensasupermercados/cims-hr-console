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

## The four ways a deploy looks done when it is not

Step 9 exists because of these. All four were hit during the cims-timecard build on
11 Aug 2026, and none of them are specific to that worker — they apply to every Worker
in the estate. Each one presents as a different problem than it is, which is what makes
them expensive.

### 1. A secret added in the dashboard needs a DEPLOY before the code can see it

Add a secret under **Settings → Variables and Secrets** and it shows `Value encrypted`
immediately. The running Worker still cannot read it. It becomes visible on the next
deploy, not on save.

Symptom: code reports the secret as missing while the dashboard clearly shows it present.
Two consecutive cron runs logged `ROSTER_KEY secret missing` with the value sitting right
there on screen. About an hour went into re-entering and re-checking the value before a
no-op redeploy fixed it on the very next run.

**If a secret you can see is not visible to the code, deploy before questioning the value.**

### 2. CI has no concurrency guard — the last run to FINISH wins

Five pushes inside ninety seconds started five runs. They finished out of order, and the
last one to land had been built from an older commit, so it silently reverted a config
change made in a newer one. Nothing failed. Nothing went red. The only symptom was a cron
that stopped firing and an audit log that went quiet for thirty minutes.

**The deployed state is whichever run finishes last, not whichever commit is newest.**
Push config changes on their own, or add a `concurrency:` group to the workflow.

### 3. `wrangler` needs `account_id` in `wrangler.toml`

Without it, wrangler calls `/memberships` to work out which account to deploy to — and a
*scoped* API token cannot read that endpoint. It fails with:

```
✘ [ERROR] A request to the Cloudflare API (/memberships) failed.
Authentication error [code: 10000]
```

Which reads exactly like a bad or expired token, and is not. The token is fine; the config
is incomplete. `account_id = "7148946ab624fb49a34c77bb04c2f3a7"`.

### 4. The custom-domain modal searches ZONES, not hostnames

**Workers & Pages → the worker → Domains → Add Domain** opens on a search box that matches
apex domains in the account. Typing a full hostname like `time.cims.work` returns
*"No zones match"* and offers to onboard it as a brand-new zone — a dead end, because the
zone is `cims.work`.

Correct path: clear the box, pick the existing **cims.work** zone, then type the subdomain
into the **Subdomain** field on the second screen.

Related: routes are deliberately **not** managed from CI in this estate (see
`cims-parts-portal`). The custom domain is attached once in the dashboard and survives every
deploy, which keeps the deploy token down to `Workers Scripts: Edit` with no zone route write.

### A note on the GitHub connector

It **cannot write to `.github/workflows/`** — that path needs a permission it does not have.
A multi-file push containing a workflow file fails *entirely* with a generic
`403 Resource not accessible by integration`, which looks like a permissions problem with the
whole repository rather than with one path. Stage the file elsewhere in the repo and move it
into place using the GitHub web editor (changing the path in the filename field moves a file
with its contents intact).

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
