#!/usr/bin/env bash
# בניית תוכנת ההתקנה של איתןPDF (Windows) — עובד גם מלינוקס, בלי wine.
# שימוש: installer/build.sh [x64|arm64]
set -euo pipefail
cd "$(dirname "$0")/.."
ARCH="${1:-x64}"
VERSION="$(node -p "require('./package.json').version")"

npx electron-builder --win dir --"$ARCH"
SRC="dist/win-unpacked"
[ "$ARCH" = "arm64" ] && SRC="dist/win-arm64-unpacked"
[ -f "$SRC/EitanPDF.exe" ] || { echo "לא נמצא $SRC/EitanPDF.exe" >&2; exit 1; }

NSISDIR="$(ls -d "$HOME"/.cache/electron-builder/nsis-3*/nsis-3*/ | grep -v state | head -1)"
[ -x "$NSISDIR/linux/makensis" ] || { echo "makensis לא נמצא — הריצו פעם אחת: npx electron-builder --win nsis" >&2; exit 1; }

cd installer
NSISDIR="$NSISDIR" "$NSISDIR/linux/makensis" -V2 -INPUTCHARSET UTF8 \
  -DVERSION="$VERSION" -DARCH="$ARCH" -DSRCDIR="../$SRC" installer.nsi
ls -la "../dist/EitanPDF-Setup-$VERSION-$ARCH.exe"
