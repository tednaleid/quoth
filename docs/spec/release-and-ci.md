# Release, CI, and Extension Installation

How to build, sign, install, and release the Quoth browser extension.

For the public-store path (AMO listing + Chrome Web Store), see:

- [`store-listings.md`](./store-listings.md) -- canonical listing copy, asset
  checklist, permission justifications
- [`privacy.md`](./privacy.md) -- privacy notice both stores require
- [`store-registration-walkthrough.md`](./store-registration-walkthrough.md)
  -- step-by-step manual registration for both stores

## Quick Start: Install Locally

### Firefox (primary)

```bash
just install-firefox
```

This builds the extension, signs it via AMO, and opens the signed .xpi
in Firefox for permanent installation. Requires AMO API credentials
(see Setup below).

### Chrome (secondary)

```bash
just build chrome
```

Then one-time manual step: go to `chrome://extensions`, enable Developer
Mode, click "Load unpacked", and select `.output/chrome-mv3/`. The
extension persists across restarts. After rebuilding, click the reload
icon on the extensions page.

## Setup: AMO API Credentials

Firefox requires extensions to be signed by Mozilla for permanent
installation. To sign locally and in CI:

1. Go to https://addons.mozilla.org/developers/addon/api/key/
2. Log in (create an account if needed)
3. Generate API credentials -- you'll get a **JWT issuer** and **JWT secret**
4. Add to your shell environment (e.g., in `~/.zshrc` or `~/.zshenv`):

```bash
export WEB_EXT_API_KEY="your-jwt-issuer"       # the "JWT issuer" value from AMO
export WEB_EXT_API_SECRET="your-jwt-secret"     # the "JWT secret" value from AMO
```

5. Add the same values as GitHub repository secrets:
   - `WEB_EXT_API_KEY` = JWT issuer
   - `WEB_EXT_API_SECRET` = JWT secret

The extension's AMO ID is already set in `wxt.config.ts` as
`quoth@tednaleid.com`. This is used for self-hosted signing (not listed
on AMO).

## Setup: Chrome Web Store (optional, for public distribution)

Only needed if you want to publish on the Chrome Web Store:

1. Pay the one-time $5 developer registration fee at
   https://chrome.google.com/webstore/devconsole/register
2. Create a new extension in the developer console
3. Set up API access following
   https://developer.chrome.com/docs/webstore/using-api/ -- you'll need
   a Google Cloud project with the Chrome Web Store API enabled, and an
   OAuth2 client ID/secret
4. Add GitHub secrets: `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`,
   `CHROME_REFRESH_TOKEN`, `CHROME_EXTENSION_ID`

This is not required for local use -- Chrome loads unpacked extensions
without signing.

## CI Pipeline

### On every push/PR (`ci.yml`)

- Run `just check` (tests, lint, typecheck, format)
- Run Playwright E2E tests with the Chrome extension
- Build both browser zips as a verification step

### On version tags (`release.yml`)

Triggered by pushing a version tag (e.g., `v0.1.0`):

1. Run full checks
2. Build and zip both browsers
3. Sign the Firefox extension via AMO (`web-ext sign`)
4. Create a GitHub Release with:
   - Signed Firefox .xpi
   - Chrome .zip (for manual Chrome Web Store upload or sideloading)
   - Auto-generated release notes from commit history

## Versioning

Version lives in `package.json` and is propagated to manifests
automatically by WXT. To release:

```bash
just bump 0.1.0       # specific version
just bump              # patch increment (0.0.0 -> 0.0.1)
```

This bumps `package.json`, commits, generates release notes (via Claude
if available, git log fallback), creates an annotated tag, and pushes.
The release CI workflow triggers on the tag.

To re-trigger a failed release without changing the version:

```bash
just retag 0.1.0
```

This preserves the existing tag annotation (release notes), deletes the
GitHub release and remote tag, then recreates and pushes.

## File Locations

- `.github/workflows/ci.yml` -- test and lint checks
- `.github/workflows/release.yml` -- build, sign, publish
- `justfile` -- `install-firefox`, `bump`, `retag` recipes
- `wxt.config.ts` -- manifest config, AMO gecko ID
- `package.json` -- version source of truth
