# Store Registration Walkthrough

Step-by-step guide for the manual parts of getting Quoth onto Firefox
Add-ons (AMO) and the Chrome Web Store. Once both stores are live, the
release pipeline (`.github/workflows/release.yml`) takes over.

Before starting, generate the assets and have these tabs open:

- `docs/spec/store-listings.md` (copy/paste source for every text field)
- `docs/spec/privacy.md` (link target for the privacy URL)
- `assets/store/screenshots/` (six 1280x800 PNGs, three per browser, captured manually with `just dev <browser>` + `Cmd-Shift-4`)
- `public/icon/128.png` (icon for both stores)

Estimated time: 90 minutes for AMO, 90 minutes for Chrome Web Store. Most
of it is filling forms; the OAuth dance for Chrome takes ~10 minutes.

---

## Part A: Firefox Add-ons (AMO)

### A1. Confirm AMO API credentials are in place

You already have `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` for unlisted
signing. Same credentials work for listed submissions.

```bash
echo "${WEB_EXT_API_KEY:?missing}" | head -c 8 && echo "..."
echo "${WEB_EXT_API_SECRET:?missing}" | head -c 8 && echo "..."
```

If either is missing, regenerate at https://addons.mozilla.org/developers/addon/api/key/
and add to `~/.zshenv`, then `just setup-github-secrets`.

### A2. Build a fresh unsigned XPI for the listed submission

The gecko ID `quoth@tednaleid.com` is already registered with AMO from
prior unlisted CI runs. AMO won't accept the existing `.xpi` files from
GitHub Releases for a listed submission because every version 0.1.0 -
0.1.10 already exists on AMO unlisted. **You need a version number
greater than the latest unlisted version.**

Bump locally without committing or pushing -- the version goes to AMO
listed via the web UI; we'll coordinate the matching git tag and CI
changes after AMO approves (Part C).

```bash
# Pick a version higher than the latest tag (`gh release list --limit 1`).
# Milestone bump to 0.2.0 makes "first store-published version" obvious in history.
jq '.version = "0.2.0"' package.json > /tmp/p.json && mv /tmp/p.json package.json

just build firefox
bunx web-ext build --source-dir .output/firefox-mv2 --artifacts-dir /tmp

ls -lh /tmp/quoth-0.2.0.zip
```

Leave `package.json` modified locally; do **not** `git add` or commit yet.

### A3. Submit through the existing add-on (not "Submit a New Add-on")

The "Submit a New Add-on" page rejects with `Duplicate add-on ID found`
because AMO already knows your gecko ID. Use the existing entry instead:

1. Go to https://addons.mozilla.org/developers/addons/ (your developer
   dashboard).
2. Click into the existing **Quoth** entry.
3. In the actions row, click **"New Version"**.
4. When AMO asks where to distribute, choose **"On this site"** (listed)
   instead of the unlisted/self-hosted option. (If a channel chooser
   doesn't appear because all prior versions were unlisted, look for a
   "Change distribution" or "Submit listed version instead" link on the
   upload page.)
5. Upload `/tmp/quoth-0.2.0.zip` from step A2.
6. AMO validates. Warnings about minified code are normal -- they mean a
   reviewer will request the source archive.

### A4. Source-code upload (when prompted)

```bash
git archive --format=zip --output=/tmp/quoth-source-0.2.0.zip HEAD
ls -lh /tmp/quoth-source-0.2.0.zip
```

Paste the build instructions from `docs/spec/store-listings.md`
("Source-code submission" section) into the build-instructions field.

### A5. Listing metadata

This is your first listed version, so AMO walks you through the listing
form once. Use `docs/spec/store-listings.md` for every field:

- Name: `Quoth`
- Summary: short description
- Description: detailed description
- Categories: **Photos, Music & Videos** (AMO has no Productivity
  category for extensions). Optional secondary: Search Tools.
- Tags: `youtube`, `transcript`, `captions`, `accessibility`
- Support email: contact@naleid.com
- Support site: https://github.com/tednaleid/quoth/issues
- Homepage: https://github.com/tednaleid/quoth
- License: match the repo (MIT if applicable)
- Privacy policy: link to
  https://github.com/tednaleid/quoth/blob/main/docs/spec/privacy.md or
  paste contents into the policy field.

**Screenshots**: upload `assets/store/screenshots/01-firefox-sidepanel.png`,
`02-firefox-settings.png`, `03-firefox-popout.png`. AMO accepts up to 10;
three is fine.

**Version notes**: a one-liner like `Initial AMO listing.` works for the
v0.2.0 milestone.

Submit. AMO emails when review starts and finishes.

Initial review window: typically **1-7 days**. Subsequent versions are
auto-approved within minutes unless permissions change.

### A6. Don't push v0.2.0 to git yet

The local `package.json` change must stay un-pushed until Part C wires CI
to `--channel listed`. If you push v0.2.0 with the current
`release.yml` (which signs `--channel unlisted`), the CI will fail
because v0.2.0 is now on AMO listed and AMO refuses to add the same
version to a different channel.

Easiest path: revert the local bump while AMO reviews:

```bash
git checkout -- package.json
```

After AMO approves, do Part C in one PR (channel flip + version bump to
v0.2.1 + commit + tag).

### A5. After approval

- Note the public listing URL: `https://addons.mozilla.org/firefox/addon/quoth/`
  (slug auto-generated; can be customized in dev hub).
- Update `README.md` to point at the AMO listing as the primary install
  method.

---

## Part B: Chrome Web Store

### B1. Pay the developer fee

1. Sign in with the Google account you want to publish under (the
   developer email is publicly visible on the listing; consider whether
   to use a personal or project-specific account).
2. Go to https://chrome.google.com/webstore/devconsole/register and pay
   the **one-time $5** registration fee.
3. Verify your email if prompted.

### B2. Create the item

1. In the Developer Dashboard, click **"New item"**.
2. Upload `quoth-<v>-chrome.zip` from the latest GitHub release:
   ```bash
   gh release download $(gh release list --limit 1 --json tagName --jq '.[0].tagName') --pattern '*-chrome.zip' --dir /tmp/quoth-cws
   ls /tmp/quoth-cws/
   ```
3. After upload, the dashboard shows the assigned **Item ID** (32
   characters). Copy this; you need it as `CHROME_EXTENSION_ID` later.

### B3. Fill in the listing

Use `docs/spec/store-listings.md` for every field.

- **Store listing tab**:
  - Description: detailed description
  - Category: Productivity
  - Language: English (United States)
  - Icon: upload `public/icon/128.png`
  - Screenshots: upload `assets/store/screenshots/01-chrome-sidepanel.png`, `02-chrome-settings.png`, `03-chrome-popout.png`
  - Small promo tile (440x280): required (TODO -- create manually)
  - Marquee promo tile (1400x560): optional
- **Privacy practices tab**:
  - Single-purpose statement: copy from `store-listings.md`
  - Permission justifications: copy each row from `store-listings.md`
  - Remote code: select **"I am not using remote code"**
  - Data usage: declare nothing collected (matches the privacy page)
  - Privacy policy URL: link to `docs/spec/privacy.md` on GitHub or a
    Pages mirror. Chrome requires a publicly hosted URL.
- **Distribution tab**:
  - Visibility: Public
  - Geographic distribution: All regions
  - Pricing: Free

### B4. Submit for review

1. Click **Submit for review**.
2. First review: typically a few days. Subsequent updates are usually
   reviewed in hours.
3. The dashboard emails when status changes.

### B5. Set up the Chrome Web Store API (after first publish)

Needed so CI can push subsequent versions automatically.

1. Go to https://console.cloud.google.com/, create a new project named
   `quoth-cws-publishing` (or reuse an existing one).
2. Enable the **Chrome Web Store API**:
   - Navigation: APIs & Services -> Library -> search "Chrome Web Store
     API" -> Enable.
3. Configure the OAuth consent screen:
   - User type: External
   - App name: `Quoth CWS publisher`
   - Support email: contact@naleid.com
   - Add `https://www.googleapis.com/auth/chromewebstore` to scopes
   - Add yourself (the Google account that owns the CWS listing) as a
     test user
   - Publishing status can stay "Testing"; a Testing-status app can mint
     refresh tokens that don't expire as long as the user is a test user
4. Create OAuth credentials:
   - APIs & Services -> Credentials -> Create credentials -> OAuth
     client ID
   - Application type: **Desktop app**
   - Name: `quoth-cws-cli`
   - After creation, copy the **Client ID** and **Client secret**.
5. Export them locally:
   ```bash
   export CHROME_CLIENT_ID="..."
   export CHROME_CLIENT_SECRET="..."
   ```
6. Get a refresh token:
   ```bash
   just chrome-store-refresh-token
   ```
   This prints an authorization URL. Open it in a browser, sign in as
   the CWS-owning Google account, approve the scope, and paste the
   resulting code back into the terminal. The script prints the
   `CHROME_REFRESH_TOKEN`.
7. Export it and add the Chrome extension ID from B2:
   ```bash
   export CHROME_REFRESH_TOKEN="..."
   export CHROME_EXTENSION_ID="..."   # from B2
   ```
8. Push all four to GitHub:
   ```bash
   just setup-chrome-secrets
   ```

After this, the next tag push will hit the new "Upload to Chrome Web
Store" step in `release.yml` (added as part of the wider plan).

---

## Part C: Flip the release pipeline to use both stores

The `release.yml` edits are already in place (committed alongside this
doc update). They activate on the next pushed tag.

**Sequencing matters.** AMO has v0.2.1 listed in review and v0.2.0 +
v0.1.x in unlisted from prior CI runs. The next tag must be a higher
version that doesn't collide. The flow:

1. Wait for AMO to approve v0.2.1.
2. Wait for Chrome Web Store first listing to be approved (Part B).
3. Confirm `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`,
   `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN` secrets are set
   (`just setup-chrome-secrets`).
4. Run `just bump 0.2.2` -- bumps version, generates notes, commits,
   tags, pushes, fires CI.

If you push v0.2.2 before Chrome Web Store secrets exist, the CI's
"Detect Chrome Web Store secrets" step skips the upload cleanly and the
rest of the release continues.

### C1. Firefox: signed `--channel listed` (DONE)

`release.yml` now signs to AMO listed:

```yaml
- name: Sign Firefox extension (AMO listed)
  run: bunx web-ext sign --source-dir .output/firefox-mv2 --artifacts-dir .output/signed --channel listed
```

A `git archive`-based source archive is also built each release at
`/tmp/quoth-source-<v>.zip` for AMO source-code requests. Note: web-ext
itself doesn't currently auto-upload source, so AMO may email asking for
source on each new version. When that happens, download the source
archive from the CI run logs (or rebuild locally with `git archive`) and
upload via the AMO submission UI for that version. After a few clean
releases AMO typically stops asking.

### C2. Chrome Web Store upload (DONE)

`release.yml` now hits the Chrome Web Store API directly via `curl` --
no third-party action, no SHA pinning needed. The step is gated on the
presence of `CHROME_EXTENSION_ID` so it skips cleanly when secrets
aren't yet configured.

### C3. Ship v0.2.2 once both stores are ready

```bash
just bump 0.2.2
```

That bumps `package.json`, generates release notes via Claude (with git
log fallback), commits, tags, pushes -- CI fires.

Verify:

- GitHub Release has all three artifacts (chrome.zip, firefox.zip,
  signed `.xpi`).
- AMO Developer Hub shows v0.2.2 queued / auto-approved (faster than
  the first listed submission).
- Chrome Web Store dashboard shows v0.2.2 in review.

If anything fails, `just retag 0.2.2` re-runs the workflow without
incrementing the version.

---

## Quick reference: GitHub secrets

| Secret | Used by | How to mint |
|---|---|---|
| `WEB_EXT_API_KEY` | `web-ext sign` (Firefox) | https://addons.mozilla.org/developers/addon/api/key/ |
| `WEB_EXT_API_SECRET` | `web-ext sign` (Firefox) | same page |
| `CHROME_EXTENSION_ID` | CWS upload step | CWS dashboard, after first item creation (B2) |
| `CHROME_CLIENT_ID` | CWS upload step | Google Cloud Console OAuth client (B5.4) |
| `CHROME_CLIENT_SECRET` | CWS upload step | same |
| `CHROME_REFRESH_TOKEN` | CWS upload step | `just chrome-store-refresh-token` (B5.6) |

`just setup-github-secrets` pushes the AMO pair.
`just setup-chrome-secrets` pushes the four Chrome ones.
