#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
# Use the course Node when it is already installed, including Intel Macs and ARM Linux.
# Otherwise use the branch's pinned mise bootstrap on its supported architectures.
if [ "$(node --version 2>/dev/null || true)" = v24.21.0 ]; then
  case "$1" in
    app-setup) exec npm ci --include=dev --no-audit --no-fund ;;
    foundation-setup) exec npm --prefix foundation ci --include=dev --no-audit --no-fund ;;
    node-version) exec node --version ;;
    preview) exec npm start ;;
    check:quick)
      npm run lint
      ./node_modules/.bin/playwright test --list
      exit 0 ;;
    test)
      npm test
      node --test plugins/blossom-bookings/test/plugin.test.mjs scripts/preview-identity.test.mjs
      exit 0 ;;
    playwright)
      npm run build
      ./node_modules/.bin/playwright install --only-shell chromium
      ./node_modules/.bin/playwright test
      exit 0 ;;
    ci)
      npm run lint
      ./node_modules/.bin/playwright test --list
      npm test
      node --test plugins/blossom-bookings/test/plugin.test.mjs scripts/preview-identity.test.mjs
      npm run build
      ./node_modules/.bin/playwright install --only-shell chromium
      ./node_modules/.bin/playwright test
      exit 0 ;;
  esac
fi
case "$1" in
  app-setup|foundation-setup|node-version) exec ./bin/setup ;;
  *) exec ./bin/mise run "$1" ;;
esac
