#!/usr/bin/env bash
# Everything, in the order that cannot lose data: the Lambda whitelists course
# slugs, so if the frontend shipped new missions first, synced progress on
# them would be silently dropped until the backend caught up.
#
# Arguments pass through to the quiz seeder (e.g. ./deploy_all.sh --profile
# default); the backend step reads the usual PROFILE env var.

set -euo pipefail
cd "$(dirname "$0")"

./deploy_backend.sh
./deploy_frontend.sh
./deploy_worker.sh
./deploy_quiz.sh "$@"

echo "Done. Backend, frontend, worker and quiz bank all shipped."
