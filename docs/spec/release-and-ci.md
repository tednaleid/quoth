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

The extension's AMO ID is set in `wxt.config.ts` as `quoth@tednaleid.com`.

## Public store distribution

Both stores are wired up. See
[`store-registration-walkthrough.md`](./store-registration-walkthrough.md)
for the one-time setup history and re-run instructions.

- **AMO**: signed `--channel listed`, auto-publishes once the listing is
  approved. Uses `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET`.
- **Chrome Web Store**: uploaded and published via the Chrome Web Store
  API. Uses `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`,
  `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`. The release.yml step
  is gated on `CHROME_EXTENSION_ID` being set, so first releases without
  Chrome creds skip the upload cleanly.

`just setup-github-secrets` pushes the AMO pair from local env;
`just setup-chrome-secrets` pushes the four Chrome ones.

## CI Pipeline

### On every push/PR (`ci.yml`)

- Run `just check` (tests, lint, typecheck, format)
- Run Playwright E2E tests with the Chrome extension
- Build both browser zips as a verification step

### On version tags (`release.yml`)

Triggered by pushing a version tag (e.g., `v0.2.2`):

1. Build and zip both browsers
2. Build a `git archive` source zip (for AMO source-code requests)
3. Sign Firefox `--channel listed` via `web-ext sign` -> uploads to AMO
4. Create GitHub Release with chrome.zip, firefox.zip, signed `.xpi`
5. Detect Chrome Web Store secrets; if present, upload the chrome.zip
   to the Chrome Web Store via `curl` against the CWS API and call
   `/publish`

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
