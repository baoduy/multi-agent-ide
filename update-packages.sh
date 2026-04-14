#!/usr/bin/env bash

set -u

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGES_DIR="$ROOT_DIR/packages"

if [[ ! -d "$PACKAGES_DIR" ]]; then
  echo "packages directory not found: $PACKAGES_DIR"
  exit 1
fi

exit_code=0

for dir in "$PACKAGES_DIR"/*/; do
  [[ -d "$dir" ]] || continue

  package_name="$(basename "$dir")"
  echo ""
  echo "==> Running update in packages/$package_name"

  if [[ -f "${dir}package.json" ]]; then
    (
      cd "$dir" || exit 1
      pnpm run update
    ) || exit_code=1
  else
    echo "Skipping packages/$package_name (no package.json)"
  fi
done

exit "$exit_code"
