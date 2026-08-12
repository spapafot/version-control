#!/usr/bin/env bash

set -euo pipefail
cd "$(dirname "$0")/../scripts/aws"

./60-update-lambda.sh
