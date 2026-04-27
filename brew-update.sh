#!/bin/sh

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is not installed. Visit https://brew.sh to install it."
  exit 1
fi

echo "Homebrew found at: $(command -v brew)"
echo "Running brew update && brew upgrade..."
brew update && brew upgrade
