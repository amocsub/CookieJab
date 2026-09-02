#!/usr/bin/env bash
# Render the store images and the 128 px icon with headless Chrome.
set -euo pipefail
cd "$(dirname "$0")"

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

# render <html> <width> <height> <output> [background RRGGBBAA]
render() {
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --allow-file-access-from-files --default-background-color="${5:-ffffffff}" \
    --window-size="$2,$3" --screenshot="$4" "file://$PWD/$1" >/dev/null 2>&1
  echo "rendered $4"
}

mkdir -p assets
render promo-tile.html 440 280 assets/promo-tile-440x280.png
render icon.html 128 128 ../icons/icon128.png 00000000
