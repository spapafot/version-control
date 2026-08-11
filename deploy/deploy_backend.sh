#!/usr/bin/env bash
# Rebuild the FastAPI Lambda package from backend/ and upload the new code.
# Code only: environment variables are managed by hand in the Lambda console
# and are never touched here (see scripts/aws/README.md).
#
# The api.versioncontrol.gr proxy worker (workers/api/) is NOT deployed here;
# it rarely changes — deploy it from that directory with `npx wrangler deploy`
# when it does.
#
# Usage:  ./deploy/deploy_backend.sh
set -euo pipefail
cd "$(dirname "$0")/../scripts/aws"

./60-update-lambda.sh
