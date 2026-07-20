#!/usr/bin/env bash
set -euo pipefail

: "${CSK_PACKAGE_TARBALL:?CSK_PACKAGE_TARBALL must name a prebuilt npm pack artifact}"
npm run test:package
