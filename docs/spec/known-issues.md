# Known Issues

Transient issues and workarounds. Remove entries once fixed.

---

## Chrome dev-mode seeking: YouTube shows "Something went wrong"

**Environment:** `just dev chrome` only. Does NOT affect Firefox or production builds.

**Symptoms:** When seeking past ~1-2 minutes in a YouTube video via either
the YouTube player controls or Quoth's click-to-seek, the video shows
"Something went wrong" and refuses to play.

**Root cause:** YouTube's player in WXT's dev-mode Chrome profile cannot seek
to unbuffered regions. This is a YouTube/profile issue, not a Quoth bug.
Reproduces even with YouTube's own seek bar (nothing to do with our code).

**Workarounds (any of):**
- Use Firefox dev mode: `just dev` (defaults to Firefox)
- Use the automated smoke test: `just smoke-test` (Playwright's Chromium
  profile doesn't have this issue; seeking verified to 25+ minutes)
- Load production build in a regular Chrome profile:
  1. `just build chrome`
  2. `chrome://extensions` -> enable Developer mode -> Load unpacked
  3. Select `.output/chrome-mv3/`

**Why we haven't fixed it:** It's a browser-profile issue external to Quoth
code. WXT's dev mode provides a fresh Chrome profile each session; that
profile lacks some state (likely cookies or cached media ranges) that
YouTube needs for seeking. Switching away from WXT dev mode would lose HMR.

**Status:** Not blocking development (Firefox is the primary target).
Revisit if/when we want Chrome dev mode to be seamless.

---

## YouTube embed player has different controls from the watch page

**Environment:** All builds (watch page).

**Symptoms:** The embedded YouTube player shows a minimal control layout
(volume button at top right, settings gear, no progress bar scrubber at
top). This looks different from the regular youtube.com/watch player.

**Root cause:** YouTube's embed player (`youtube.com/embed/...`) is a
different player UI from the watch page player. It renders inside a
cross-origin iframe, so we cannot style or modify it.

**Possible improvements:** YouTube embed URL parameters (`rel=0`,
`modestbranding=1`, `iv_load_policy=3`) can reduce visual clutter but
cannot change the fundamental control layout.

**Status:** Cosmetic. Polish item for a future pass.
