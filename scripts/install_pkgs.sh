#!/usr/bin/env bash
# SessionStart dependency install for Claude Code on the web.
#
# Contract (deliberate):
#   - No-op outside a remote session, so local/CI checkouts are never touched.
#   - No-op when node_modules already exists (the container image is cached
#     after a successful hook run; re-installing every resume wastes startup).
#   - ALWAYS exits 0. A dependency install must never block a session from
#     starting; a failed install is reported on stderr and the session
#     continues so the agent can diagnose it.
set -uo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/..}" || exit 0

if [ -d node_modules ]; then
  echo "install_pkgs: node_modules present, skipping install." >&2
  exit 0
fi

# npm output goes to stderr: SessionStart stdout is injected into the session
# context, and install logs are noise there.
if [ -f package-lock.json ]; then
  echo "install_pkgs: package-lock.json found, running npm ci." >&2
  npm ci >&2
else
  echo "install_pkgs: no package-lock.json, running npm install." >&2
  npm install >&2
fi

status=$?
[ "$status" -eq 0 ] || echo "install_pkgs: dependency install failed (exit $status); continuing." >&2

exit 0
