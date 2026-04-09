# Quoth

YouTube transcript viewer browser extension. Displays formatted, searchable
transcripts alongside YouTube videos. Everything runs client-side -- no server,
no accounts, no data leaves your browser.

Works in Chrome and Firefox. The transcript displays in a sidebar docked
alongside the YouTube page.

## Install

### Firefox

Signed builds are published to
[GitHub Releases](https://github.com/tednaleid/quoth/releases). If you have
this repo cloned with [`just`](https://github.com/casey/just) and
[`gh`](https://cli.github.com/) installed, the fastest way to install the
latest release is:

```
just install-release
```

This downloads the signed `.xpi` from the latest release and opens it in
Firefox, which prompts you to install it permanently.

Otherwise, download the `.xpi` manually from the latest release and either
double-click it or drag it into Firefox's `about:addons` page.

### Chrome

1. Download `quoth-<version>-chrome.zip` from
   [the latest release](https://github.com/tednaleid/quoth/releases) and
   extract it
2. Go to `chrome://extensions` and enable Developer Mode (top right)
3. Click "Load unpacked" and select the extracted folder

The extension persists across restarts. When a new version is released,
repeat the steps with the new zip.

## Permissions

Quoth requests only the permissions it needs, all scoped to youtube.com.

| Permission | Why |
|---|---|
| `host_permissions: *://*.youtube.com/*` | Content scripts run on YouTube pages to read video playback state and fetch captions via YouTube's Innertube API. No other sites are accessed. |
| `activeTab` | Identifies which YouTube tab is active so the sidebar can connect to the right video. |
| `tabs` | Queries open tabs to find YouTube videos and sends messages between the sidebar and content scripts running on YouTube. |
| `storage` | Caches parsed transcripts locally (keyed by video ID) so repeat visits load instantly without re-fetching from YouTube. |
| `unlimitedStorage` | Extends the default 5 MB storage quota. A single transcript is small (~200 KB), but users who watch many videos benefit from a larger cache. |

### What Quoth does NOT do

- Does not access any site other than youtube.com
- Does not send data to any server
- Does not read browsing history
- Does not modify YouTube page content (beyond injecting the sidebar trigger)
- Does not run in the background when you are not on YouTube

## Development

See `CLAUDE.md` for build commands, architecture, and development conventions.
