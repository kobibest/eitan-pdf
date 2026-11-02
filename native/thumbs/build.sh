#!/usr/bin/env bash
# Cross-compiles PdfIvritThumbs.dll (Windows x64 + ARM64) with zig on Linux and
# fetches the matching prebuilt pdfium.dll from bblanchon/pdfium-binaries.
#
# Usage:  ./build.sh            # x64 + arm64
#         ./build.sh x64        # only x64
# Env:    PDFIUM_TAG=chromium/7543   pin a pdfium-binaries release (default: latest)
#         ZIG="python3 -m ziglang"   override the zig command
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZIG="${ZIG:-python3 -m ziglang}"
PDFIUM_TAG="${PDFIUM_TAG:-}"
ARCHES=("${@:-x64 arm64}")
# shellcheck disable=SC2206
ARCHES=(${ARCHES[*]})

if [[ -n "$PDFIUM_TAG" ]]; then
  PDFIUM_BASE="https://github.com/bblanchon/pdfium-binaries/releases/download/${PDFIUM_TAG}"
else
  PDFIUM_BASE="https://github.com/bblanchon/pdfium-binaries/releases/latest/download"
fi

CXXFLAGS=(
  -std=c++17 -O2 -shared
  -DUNICODE -D_UNICODE -DWIN32_LEAN_AND_MEAN -DNOMINMAX
  -Wall -Wextra -Wno-unused-parameter
  -fno-rtti
)
LDFLAGS=(
  # NOTE: no -static here: with zig, -static + -shared yields a .a archive.
  # zig's windows-gnu target always links libc++/libunwind statically; the C
  # runtime comes from the Windows UCRT (api-ms-win-crt-*, built into Win10+).
  -Wl,--subsystem,windows
  -lshell32 -ladvapi32 -lgdi32 -lkernel32
)

build_one() {
  local arch="$1" triple outdir
  case "$arch" in
    x64)   triple=x86_64-windows-gnu;  outdir="$HERE/dist" ;;
    arm64) triple=aarch64-windows-gnu; outdir="$HERE/dist-arm64" ;;
    *) echo "unknown arch $arch" >&2; return 1 ;;
  esac
  mkdir -p "$outdir"

  echo "==> [$arch] compiling PdfIvritThumbs.dll"
  local work
  work="$(mktemp -d)"
  # Build in a scratch dir: lld also drops an import lib + pdb into the cwd.
  ( cd "$work" && $ZIG c++ -target "$triple" "${CXXFLAGS[@]}" \
      "$HERE/src/thumbs.cpp" "$HERE/src/thumbs.def" \
      -o "$work/PdfIvritThumbs.dll" "${LDFLAGS[@]}" )
  if ! head -c 2 "$work/PdfIvritThumbs.dll" | grep -q '^MZ'; then
    echo "error: output is not a PE image" >&2; return 1
  fi
  cp "$work/PdfIvritThumbs.dll" "$outdir/PdfIvritThumbs.dll"
  rm -rf "$work"

  echo "==> [$arch] fetching pdfium-win-$arch.tgz"
  local tmp
  tmp="$(mktemp -d)"
  # Downloaded archive is treated as data only: extract, copy two files, delete.
  curl -sSLf -o "$tmp/pdfium.tgz" "$PDFIUM_BASE/pdfium-win-$arch.tgz"
  mkdir "$tmp/x"
  tar -xzf "$tmp/pdfium.tgz" -C "$tmp/x" --no-same-owner --no-same-permissions \
    bin/pdfium.dll LICENSE VERSION
  cp "$tmp/x/bin/pdfium.dll" "$outdir/pdfium.dll"
  cp "$tmp/x/LICENSE" "$outdir/pdfium-LICENSE.txt"
  cp "$tmp/x/VERSION" "$outdir/pdfium-VERSION.txt"
  rm -rf "$tmp"
}

for a in "${ARCHES[@]}"; do build_one "$a"; done
echo "done."
