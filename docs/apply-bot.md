# apply-bot

Large source files (notably `src/worker.js`, ~324 KB) can't be pushed through the
GitHub file API in one piece by the automation. Instead the agent pushes a small
**spec** and CI rebuilds the real file.

## How to use
1. Add `apply/<name>.json` on a **feature branch** (never `main`), shape:
   ```json
   { "target": "src/worker.js", "blocks": [ { "o": "<base64 old>", "n": "<base64 new>" } ] }
   ```
   Each `o` (old) block must occur exactly once in the target.
2. On push of `apply/*.json`, `.github/workflows/apply-spec.yml` runs
   `scripts/apply-spec.mjs` for each spec, rebuilds the target(s), and commits the
   result back to the branch.
3. The normal `npm test` gate then runs on the rebuilt code.

## Notes
- Runs on branches only; `main` is excluded.
- Idempotent: re-running on an already-applied branch is a no-op.
- Known quirk: the bot's rebuild commit is made with the built-in `GITHUB_TOKEN`,
  which by GitHub policy does **not** trigger further workflow runs (loop
  protection). To run tests on the rebuild, push any commit to the branch as a
  user (this doc is such a trigger), or add a PAT if fully hands-off CI is wanted.
- Money rule unchanged: nothing here merges anything; `bonus.js` / `bonus_outcome`
  changes still require explicit human approval.
