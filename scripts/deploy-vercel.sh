#!/usr/bin/env bash
# Deploy one app to Vercel production with the commit passed in, so Help's version reads the build (W9).
# Usage: scripts/deploy-vercel.sh api|web   (DRY_RUN=1 prints the vercel command instead of running it)
set -euo pipefail

app="${1:-}"
if [ "$app" != "api" ] && [ "$app" != "web" ]; then
  echo "usage: scripts/deploy-vercel.sh api|web" >&2
  exit 1
fi

# 2: a Vercel CLI deploy from a git worktree gets no commit, so only a full clone may deploy.
git_dir="$(git rev-parse --path-format=absolute --git-dir)"
common_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
if [ "$git_dir" != "$common_dir" ]; then
  echo "run from a full clone, not a worktree" >&2
  exit 2
fi
cd "$(git rev-parse --show-toplevel)"

# 3: what is deployed must be what is committed.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "the working tree has uncommitted changes: commit them first" >&2
  exit 3
fi

# 4: the deployed commit must exist on the remote, read fresh (a stale origin/* ref would say otherwise).
# 6: an unreachable origin is its own failure, not set -e's bare exit.
if ! git fetch -q origin; then
  echo "cannot reach origin: check the network and the remote, then retry" >&2
  exit 6
fi
if [ -z "$(git branch -r --contains HEAD)" ]; then
  echo "HEAD is not on any remote branch: push first" >&2
  exit 4
fi

# 5: the app must be linked to its Vercel project.
if [ ! -f "apps/$app/.vercel/project.json" ]; then
  echo "apps/$app/.vercel/project.json is missing: link the project with vercel link" >&2
  exit 5
fi
mkdir -p .vercel
cp "apps/$app/.vercel/project.json" .vercel/project.json

sha="$(git rev-parse HEAD)"
cmd=(vercel --prod --yes --archive=tgz --build-env "GITHUB_SHA=$sha")
if [ "${DRY_RUN:-}" = "1" ]; then
  echo "${cmd[*]}"
else
  "${cmd[@]}"
fi
echo "Expect Help to show: Version ${sha:0:7}"
