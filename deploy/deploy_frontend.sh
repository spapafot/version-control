#!/usr/bin/env bash

set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Building static export (next build -> out/)"
pnpm build

echo "==> Deploying to Cloudflare (versioncontrol.gr + www)"
npx wrangler deploy

echo "Done. Live at https://versioncontrol.gr"
