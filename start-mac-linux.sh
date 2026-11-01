#!/bin/sh
# Starts Deadline Tracker. Needs Node.js 22.5+ (https://nodejs.org).
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Node.js is not installed. Install the LTS version from https://nodejs.org"; exit 1; }
[ -f .env ] || cp .env.example .env
node build.js && node server.js
