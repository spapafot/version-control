#!/usr/bin/env bash
# Validate and load src/quiz/bank/*.json into the live vc-quiz DynamoDB table.
# The seeder bumps the bank rev last, so a half-written bank is never picked
# up; warm Lambda containers see the new rev within ~5 minutes. No redeploy
# of anything else is needed for a reseed.
#
# All seed_quiz.py flags pass through:
#   ./deploy_quiz.sh --profile default
#   ./deploy_quiz.sh --validate-only     (no AWS calls)
#   ./deploy_quiz.sh --dry-run           (adds the diff against the table)

set -euo pipefail
cd "$(dirname "$0")/.."

python backend/tools/seed_quiz.py "$@"
