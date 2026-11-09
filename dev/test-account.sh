#!/usr/bin/env bash
# MOOPI Desktop on this Mac with another MOOPI account and another Claude subscription, fully apart from the owner's:
# its own home folder (so its own ~/MOOPI and memory), its own Claude Code sign-in, its own editor data.
#   dev/test-account.sh            start
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T="$HOME/moopi-test-account"
mkdir -p "$T"
export HOME="$T"
export CLAUDE_CONFIG_DIR="$T/.claude"
export MOOPI_RUN="$T/.run"
exec bash "$ROOT/dev/run.sh" --password-store=basic "$@"
