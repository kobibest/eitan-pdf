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

# NSIS (גרסת לינוקס של makensis) — מהמטמון של electron-builder, או הורדה חד-פעמית
NSISDIR="$(ls -d "$HOME"/.cache/electron-builder/nsis-3*/nsis-3*/ 2>/dev/null | grep -v state | head -1 || true)"
if [ -z "$NSISDIR" ] || [ ! -x "$NSISDIR/linux/makensis" ]; then
  NSISDIR="$HOME/.cache/eitanpdf-nsis/nsis-3.0.4.1"
  if [ ! -x "$NSISDIR/linux/makensis" ]; then
    mkdir -p "$HOME/.cache/eitanpdf-nsis"
    curl -sSfL -o "$HOME/.cache/eitanpdf-nsis/nsis.7z" \
      https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-3.0.4.1/nsis-3.0.4.1.7z
    7z x -y -o"$NSISDIR" "$HOME/.cache/eitanpdf-nsis/nsis.7z" >/dev/null
    chmod +x "$NSISDIR/linux/makensis"
  fi
fi

cd installer
NSISDIR="$NSISDIR" "$NSISDIR/linux/makensis" -V2 -INPUTCHARSET UTF8 \
  -DVERSION="$VERSION" -DARCH="$ARCH" -DSRCDIR="../$SRC" installer.nsi
ls -la "../dist/EitanPDF-Setup-$VERSION-$ARCH.exe"
