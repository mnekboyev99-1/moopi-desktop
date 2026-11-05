#!/usr/bin/env bash
# MOOPI Desktop, development run on the Mac: the prebuilt VSCodium with its own user-data and
# extensions folders (nothing of the user's VS Code is touched), the Claude Code extension from
# vendor/, our extension loaded from source, the MOOPI workspace folder opened.
#   dev/run.sh            start
#   dev/run.sh --reset    forget the dev user data (settings, Claude sign-in) and start fresh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CODIUM="${CODIUM:-$ROOT/vendor/VSCodium.app/Contents/Resources/app/bin/codium}"
[ -x "$CODIUM" ] || { echo "VSCodium not found at $CODIUM (unzip the darwin-arm64 build into vendor/)"; exit 1; }
RUN="$ROOT/.run"
if [ "${1:-}" = "--reset" ]; then rm -rf "$RUN/user-data"; fi
mkdir -p "$RUN/user-data/User" "$RUN/extensions" "$HOME/MOOPI"
# Settings: ours win on every start (the user's own edits go to other keys).
python3 - "$RUN/user-data/User/settings.json" "$ROOT/dev/settings.json" <<'PY'
import json, sys, os
path, defaults = sys.argv[1], json.load(open(sys.argv[2]))
current = json.load(open(path)) if os.path.exists(path) else {}
current.update(defaults)
json.dump(current, open(path, "w"), indent=2, ensure_ascii=False)
PY
# Claude Code from vendor/ once.
if ! ls "$RUN/extensions" | grep -q "^anthropic.claude-code"; then
  "$CODIUM" --user-data-dir "$RUN/user-data" --extensions-dir "$RUN/extensions" --install-extension "$ROOT"/vendor/Anthropic.claude-code-*.vsix
fi
exec "$CODIUM" --user-data-dir "$RUN/user-data" --extensions-dir "$RUN/extensions" \
  --extensionDevelopmentPath="$ROOT/extension" --disable-telemetry --disable-updates \
  --new-window "$HOME/MOOPI" "$@"
