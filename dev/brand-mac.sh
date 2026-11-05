#!/usr/bin/env bash
# A light rebrand of the prebuilt VSCodium for the Mac (stage A): the app bundle is copied to
# "MOOPI Desktop.app", named and iconed as MOOPI, and re-signed ad hoc. Only VSCodium (MIT) is
# touched; the Claude Code extension stays as published. Stage B replaces this with a source build.
#   dev/brand-mac.sh            makes vendor/MOOPI Desktop.app from vendor/VSCodium.app
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/vendor/VSCodium.app"
DST="$ROOT/vendor/MOOPI Desktop.app"
ICON_PNG="${ICON_PNG:-/Users/mnekboyev/Ai maslahatchi/app/assets/brand/moopi-mark.png}"
[ -d "$SRC" ] || { echo "no $SRC"; exit 1; }
rm -rf "$DST"; cp -R "$SRC" "$DST"
PLIST="$DST/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleName 'MOOPI Desktop'" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName 'MOOPI Desktop'" "$PLIST" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string 'MOOPI Desktop'" "$PLIST"
[ -n "${KEEP_ID:-}" ] || /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier uz.moopi.desktop" "$PLIST"
# The icon: an .icns made from MOOPI's mark.
ICNS_NAME="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIconFile' "$PLIST")"; ICNS_NAME="${ICNS_NAME%.icns}.icns"
if [ -f "$ICON_PNG" ]; then
  TMP="$(mktemp -d)"; SET="$TMP/moopi.iconset"; mkdir -p "$SET"
  for s in 16 32 128 256 512; do
    sips -z $s $s "$ICON_PNG" --out "$SET/icon_${s}x${s}.png" >/dev/null
    sips -z $((s*2)) $((s*2)) "$ICON_PNG" --out "$SET/icon_${s}x${s}@2x.png" >/dev/null
  done
  iconutil -c icns "$SET" -o "$DST/Contents/Resources/$ICNS_NAME"
  rm -rf "$TMP"
fi
# In-app names (About, window titles). applicationName (the CLI name) stays.
python3 - "$DST/Contents/Resources/app/product.json" <<'PY'
import json, sys
p = sys.argv[1]; d = json.load(open(p))
d["nameShort"] = "MOOPI Desktop"; d["nameLong"] = "MOOPI Desktop"
d["darwinBundleIdentifier"] = "uz.moopi.desktop"
d["dataFolderName"] = ".moopi-desktop"
json.dump(d, open(p, "w"), indent=2, ensure_ascii=False)
PY
# Re-sign ad hoc with the original entitlements (Electron's helpers need theirs: JIT, library validation).
if [ -z "${SKIP_SIGN:-}" ]; then
  ENT="$(mktemp -t ent).plist"; codesign -d --entitlements :- "$SRC" > "$ENT" 2>/dev/null || true
  xattr -cr "$DST" 2>/dev/null || true
  if [ -s "$ENT" ]; then
    codesign --force --deep --sign - --entitlements "$ENT" "$DST" 2>&1 | grep -v "replacing existing signature" || true
  else
    codesign --force --deep --sign - "$DST" 2>&1 | grep -v "replacing existing signature" || true
  fi
  rm -f "$ENT"
fi
echo "made: $DST"
