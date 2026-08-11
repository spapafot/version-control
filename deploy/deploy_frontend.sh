#!/usr/bin/env bash
# Build the static site and ship it to Cloudflare, including the /verify/*
# edge worker bundled from worker/index.ts. Code only: no AWS resources, no
# Worker variables, no infra changes.
#
# Usage:  ./deploy/deploy_frontend.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Building static export (next build -> out/)"
pnpm build

echo "==> Deploying to Cloudflare (versioncontrol.gr + www)"
npx wrangler deploy

echo "Done. Live at https://versioncontrol.gr"
