#!/usr/bin/env bash
# Build the Chrome Web Store zip from an explicit list of files.
# The zip is reproducible for a given commit: file times are set to the commit time.
set -euo pipefail
cd "$(dirname "$0")/.."

version=$(node -p "require('./manifest.json').version")
out="dist/cookiejab-${version}.zip"
files=(
  manifest.json
  background.js
  match-pattern.js
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
  touch -t "$stamp" "$stage/$f"
done
touch -t "$stamp" "$stage" "$stage/icons"

(cd "$stage" && TZ=UTC zip -X -D -q "../../$out" "${files[@]}")
rm -rf "$stage"

echo "built $out"
unzip -l "$out"
shasum -a 256 "$out"
