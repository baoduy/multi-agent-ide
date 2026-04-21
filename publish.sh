#!/bin/bash
set -e

pnpm install && pnpm typecheck && pnpm run pack

open "release/mac-arm64/Magenta IDE.app"
