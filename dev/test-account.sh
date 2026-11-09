#!/usr/bin/env bash
# MOOPI Desktop on this Mac with another MOOPI account and another Claude subscription, fully apart from the owner's:
# its own home folder (so its own ~/MOOPI and memory), its own Claude Code sign-in, its own editor data.
#   dev/test-account.sh            start
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T="$HOME/moopi-test-account"
mkdir -p "$T/Library"
# The Mac's keychain stays reachable (Claude Code keeps this directory's sign-in as its own separate entry).
ln -sfn "$HOME/Library/Keychains" "$T/Library/Keychains"
[ -e "$T/Library/Preferences" ] || ln -s "$HOME/Library/Preferences" "$T/Library/Preferences"
export HOME="$T"
export CLAUDE_CONFIG_DIR="$T/.claude"
export MOOPI_RUN="$T/.run"
exec bash "$ROOT/dev/run.sh" "$@"
