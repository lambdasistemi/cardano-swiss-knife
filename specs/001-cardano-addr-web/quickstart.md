# Quickstart: cardano-addresses-browser

## Prerequisites

- Nix with flakes enabled
- Node.js 22+ (provided by nix shell)

## Setup

```bash
cd /code/cardano-addresses-browser
nix develop
just install   # npm install + spago install
just build     # compile PureScript
just dev       # build + serve at localhost:8080
```

## Project Structure

- `lib/` — `cardano-addresses` library (no UI deps)
- `app/` — `cardano-addresses-browser` Halogen app
- `dist/` — Built artifacts (index.html + app.js)

## Common Tasks

```bash
just build        # Compile all packages
just bundle       # Build + esbuild minified bundle
just bundle-lib   # Build library-only bundle
just dev          # Dev server with hot rebuild
just format       # Format all PureScript source
just check        # Check formatting
just ci           # Build + check (CI pipeline)
```

## Using the Library Standalone

```purescript
import Cardano.Address (bech32, fromBech32)
import Cardano.Address.Inspect (inspectAddress)
import Cardano.Address.Style.Shelley (paymentAddress, shelleyMainnet)
import Cardano.Address.Hash (hashCredential)
```

Or from JavaScript (after `just bundle-lib`):

```javascript
import { paymentAddress, inspectAddress } from './dist/cardano-addresses.js';
```
