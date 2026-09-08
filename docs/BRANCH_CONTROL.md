# Branch control — keeping unreviewed branches away from production

Last verified 2026-09-07.

## The exposure

Every git-connected Worker in the estate has **two** Workers Builds triggers:

| Trigger | Branch | Deploy command |
| --- | --- | --- |
| production | `main` | `wrangler deploy` |
| non-production | everything else | `wrangler versions upload` |

`wrangler versions upload` is not a sandbox. It uploads a version of the **same Worker**,
bound to the **same production resources** — D1 `cims-hr-console` (all crew, all
`bonus_outcome` history), R2 `cims-hr-exports`, the `MAILER` service binding. Historically
Cloudflare then served that version at a public
`<version>-cims-hr-console.<subdomain>.workers.dev` URL and posted the link as a comment on
the pull request.

So the pre-2026-09-07 state was: **push any branch → unreviewed code, publicly reachable,
against real crew data.** No review, no CI gate, no approval. The GitHub test gate does not
cover this — Workers Builds is a separate pipeline that does not consult it.

## Two independent switches

Closing this properly takes both. They do different things.

### 1. `preview_urls = false` in `wrangler.toml` — DONE, in this repo

Stops the preview URL from **routing**. The build still runs and a version is still
uploaded, but there is no public address to reach it at.

This is the half that matters for data exposure, and it is the half we control: it is a
committed file, it goes through CI, it is reviewable, and it is pinned by
`test/wrangler_config.test.js` so it cannot be quietly dropped.

Two things worth knowing:

- **A missing key is not a safe default.** wrangler 3.x (we pin 3.114.17) treats an absent
  `preview_urls` as *enabled*. The opt-in default only arrives in wrangler ≥ 4.34. So the
  absence of the line *was* the exposure.
- **It is a Worker-level setting, not a per-version one** — wrangler maps it to the
  subdomain API's `previews_enabled`. Once one production deploy from `main` carries it,
  preview URLs are off for the Worker, including for versions uploaded later by branch
  builds. It does not touch the production deployment, its routes, or `workers.dev`.

### 2. "Builds for non-production branches" — NOT done, needs the dashboard

Stops the build from **running at all**. Also saves the build minutes, and stops the
version records piling up. Cloudflare dashboard → the Worker → **Settings → Build → Branch
control** → untick **Builds for non-production branches**.

Still open for: `cims-hr-console`, `cims-recruitment`, `cims-travel-console`,
`dg3-internal-tracker`, `ncl-tracker`.
(`cims-housing` is excluded: its production branch is a `claude/*` branch and it has no
`main`, so its default branch needs sorting first — turning off non-production builds there
today would stop it building at all.)

## Why this is a manual click and not automated

Both automated routes were tried against the live account and both are closed:

**The Builds API.** `PATCH /accounts/{id}/builds/triggers/{uuid}` is documented and the
route exists, but every attempt to change the branch filters is refused with a bare
`12002 Invalid request body` and no field detail:

```
{"errors":[{"code":12002,"message":"Invalid request body"}],"messages":[]}
```

Four bodies, four separate runs, all refused identically, nothing changed on any Worker:

| Run | Body |
| --- | --- |
| 34170439777 | `{"branch_includes":[]}` |
| 34170696500 | `{"branch_excludes":["*"]}` |
| 34170782761 | `{"branch_includes":["*"],"branch_excludes":["*"]}` |
| 34170915344 | the complete writable config, every other field copied verbatim |

The token is not the cause — it is user-scoped with **Workers Builds Configuration: Edit**
and **Workers Scripts: Edit**, confirmed against the token's own permission screen. Reads
under the same token all succeed. The working theory is that every one of those four bodies
describes a trigger that matches *no* branch, and the API rejects that as an invalid state
rather than accepting it as "disabled" — the API's model of "off" is that the
non-production trigger does not exist, which is a different operation from patching it.

**The dashboard, driven by a browser.** Chromium is installed here, but
`dash.cloudflare.com` is refused by this session's egress policy before any page loads:

```
kind:   connect_rejected
detail: gateway answered 403 to CONNECT (policy denial or upstream failure)
host:   dash.cloudflare.com:443
```

That is a network policy denial, not a login wall. `api.cloudflare.com` is allowed;
`dash.cloudflare.com` is not. Nothing in an agent session can drive that dashboard.

Do not spend more time on either route without new information.

## What IS automated, and is worth keeping

`.github/workflows/workers-builds-config.yml` (Actions tab, defaults to a dry run that
changes nothing) audits branch control across every Worker in the estate in one pass and
prints each trigger with secrets redacted. The dashboard cannot do that — it is one Worker
per five clicks. Use it to **verify** the state after the manual change, and to catch a
non-production trigger reappearing later.
