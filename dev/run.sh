#!/usr/bin/env bash
# MOOPI Desktop, development run on the Mac: the prebuilt VSCodium with its own user-data and
# extensions folders (nothing of the user's VS Code is touched), the Claude Code extension from
# vendor/, our extension loaded from source, the MOOPI workspace folder opened.
#   dev/run.sh            start
#   dev/run.sh --reset    forget the dev user data (settings, Claude sign-in) and start fresh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/vendor/MOOPI Desktop.app"; [ -d "$APP" ] || APP="$ROOT/vendor/VSCodium.app"
CODIUM="${CODIUM:-$APP/Contents/Resources/app/bin/codium}"
[ -x "$CODIUM" ] || { echo "VSCodium not found at $CODIUM (unzip the darwin-arm64 build into vendor/)"; exit 1; }
RUN="${MOOPI_RUN:-$ROOT/.run}"  # dev/test-account.sh keeps its own
if [ "${1:-}" = "--reset" ]; then rm -rf "$RUN/user-data"; fi
mkdir -p "$RUN/user-data/User" "$RUN/extensions" "$HOME/MOOPI/.claude"
# The workspace: MOOPI's persona for Claude Code and the MOOPI MCP server (the connector; sign-in by OAuth
# in the browser the first time, Claude Code keeps the token). Written only when missing, so the user's
# own edits stay.
sed "s/{language}/o'zbek tili (lotin)/; s#{timezone}#Asia/Tashkent#" "$ROOT/workspace/CLAUDE.md" > "$HOME/MOOPI/CLAUDE.md"  # MOOPI's own file, refreshed every start
[ -f "$HOME/MOOPI/.mcp.json" ] || cp "$ROOT/workspace/mcp.json" "$HOME/MOOPI/.mcp.json"
[ -f "$HOME/MOOPI/.claude/settings.json" ] || cp "$ROOT/workspace/settings.json" "$HOME/MOOPI/.claude/settings.json"
# Settings: ours win on every start (the user's own edits go to other keys).
python3 - "$RUN/user-data/User/settings.json" "$ROOT/dev/settings.json" <<'PY'
import json, sys, os
path, defaults = sys.argv[1], json.load(open(sys.argv[2]))
current = json.load(open(path)) if os.path.exists(path) else {}
current.update(defaults)
json.dump(current, open(path, "w"), indent=2, ensure_ascii=False)
PY
# The activity bar: MOOPI first, Claude next, the IDE's own icons (Explorer, Search, Git, Run, Extensions)
# unpinned. VS Code keeps this in its state database; seeded before every start.
python3 - "$RUN/user-data/User/globalStorage/state.vscdb" <<'PY'
import json, os, sqlite3, sys
path = sys.argv[1]
os.makedirs(os.path.dirname(path), exist_ok=True)
db = sqlite3.connect(path)
db.execute("CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)")
row = db.execute("SELECT value FROM ItemTable WHERE key='workbench.activity.pinnedViewlets2'").fetchone()
try:
    items = json.loads(row[0]) if row else []
except Exception:
    items = []
by_id = {i.get("id"): i for i in items if isinstance(i, dict)}
hide = ["workbench.view.explorer", "workbench.view.search", "workbench.view.scm", "workbench.view.debug",
        "workbench.view.remote", "workbench.view.extensions", "workbench.view.extension.test",
        "workbench.view.extension.references-view"]
front = ["workbench.view.extension.moopi", "workbench.view.extension.claude-sidebar", "workbench.view.extension.claude-sessions-sidebar"]
for i, cid in enumerate(front):
    by_id.setdefault(cid, {"id": cid})
    by_id[cid].update({"pinned": True, "visible": True, "order": i})
for n, cid in enumerate(hide):
    by_id.setdefault(cid, {"id": cid})
    by_id[cid].update({"pinned": False, "visible": False, "order": 10 + n})
db.execute("INSERT INTO ItemTable (key, value) VALUES (?, ?)", ("workbench.activity.pinnedViewlets2", json.dumps(list(by_id.values()))))
db.commit(); db.close()
PY
# Claude Code from vendor/ once.
if ! ls "$RUN/extensions" | grep -q "^anthropic.claude-code"; then
  "$CODIUM" --user-data-dir "$RUN/user-data" --extensions-dir "$RUN/extensions" --install-extension "$ROOT"/vendor/Anthropic.claude-code-*.vsix
fi
exec "$CODIUM" --user-data-dir "$RUN/user-data" --extensions-dir "$RUN/extensions" \
  --extensionDevelopmentPath="$ROOT/extension" --disable-telemetry --disable-updates \
  --new-window "$HOME/MOOPI" "$@"
