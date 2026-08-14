#!/usr/bin/env bash
# API proxy worker (workers/api -> api.versioncontrol.gr). Only needed when
# workers/api/src changes; keep_vars preserves the dashboard-set
# LAMBDA_URL / PROXY_SECRET variables. The /verify/* edge worker is NOT this:
# it ships with deploy_frontend.sh (root wrangler.jsonc bundles worker/index.ts).

set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Deploying API proxy worker (api.versioncontrol.gr)"
npx wrangler deploy --config workers/api/wrangler.jsonc

echo "Done. Live at https://api.versioncontrol.gr"
