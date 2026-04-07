# Quoth

YouTube transcript viewer browser extension. Displays formatted, searchable
transcripts alongside YouTube videos. Everything runs client-side -- no server,
no accounts, no data leaves your browser.

Works in Chrome and Firefox. Two viewing modes:

- **Sidebar** -- transcript docked alongside the YouTube page
- **Watch page** -- standalone extension page with embedded video and transcript
  below, accessible via the sidebar's pop-out button or directly at
  `chrome-extension://<id>/watch.html?v=VIDEO_ID`

## Permissions

Quoth requests only the permissions it needs, all scoped to youtube.com.

| Permission | Why |
|---|---|
| `host_permissions: *://*.youtube.com/*` | Content scripts run on YouTube pages to read video playback state and fetch captions. Network requests go to YouTube's Innertube API for caption data. No other sites are accessed. |
| `activeTab` | Identifies which YouTube tab is active so the sidebar can connect to the right video. |
| `tabs` | Queries open tabs to find YouTube videos and sends messages between the sidebar/watch page and content scripts running on YouTube. |
| `storage` | Caches parsed transcripts locally (keyed by video ID) so repeat visits load instantly without re-fetching from YouTube. |
| `unlimitedStorage` | Extends the default 5 MB storage quota. A single transcript is small (~200 KB), but users who watch many videos benefit from a larger cache. |
| `declarativeNetRequestWithHostAccess` | Modifies request headers **only on youtube.com** (scoped by `host_permissions`). Two rules: (1) strips the `Origin` header on Innertube API calls so YouTube does not reject requests from the extension context, and (2) sets a `Referer` header so YouTube's embed player accepts playback. These rules do not affect YouTube requests made by your browser -- only requests made by the extension itself. |

### What Quoth does NOT do

- Does not access any site other than youtube.com
- Does not send data to any server
- Does not read browsing history
- Does not modify YouTube page content (beyond injecting the sidebar trigger)
- Does not run in the background when you are not on YouTube

## Development

See `CLAUDE.md` for build commands, architecture, and development conventions.
