#!/usr/bin/env bash
# Build the Chrome Web Store zip from an explicit list of files.
# The file times are the commit time, so the zip is the same for a given commit.
set -euo pipefail
cd "$(dirname "$0")/.."

version=$(node -p "require('./manifest.json').version")
out="dist/cookiejab-${version}.zip"
files=(
  manifest.json
  background.js
  match-pattern.js
  curl-import.js
  popup.css
  popup.html
  popup.js
  icons/icon16.png
  icons/icon32.png
  icons/icon48.png
  icons/icon128.png
)

for f in "${files[@]}"; do
  [[ -f "$f" ]] || { echo "missing file: $f" >&2; exit 1; }
done

epoch=$(git log -1 --format=%ct 2>/dev/null || date +%s)
stamp=$(date -u -r "$epoch" +%Y%m%d%H%M.%S 2>/dev/null || date -u -d "@$epoch" +%Y%m%d%H%M.%S)

stage="dist/stage"
rm -rf "$stage" "$out"
mkdir -p "$stage/icons"
for f in "${files[@]}"; do
  cp "$f" "$stage/$f"
  TZ=UTC touch -t "$stamp" "$stage/$f"
done
TZ=UTC touch -t "$stamp" "$stage" "$stage/icons"

(cd "$stage" && TZ=UTC zip -X -D -q "../../$out" "${files[@]}")
rm -rf "$stage"

echo "built $out"
unzip -l "$out"
shasum -a 256 "$out"
