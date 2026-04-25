# Privacy Notice

Last updated: 2026-04-25

Quoth is a YouTube transcript viewer that runs entirely inside your
browser. This page describes what data the extension touches and what it
does with it.

## What Quoth does

When you open a YouTube watch page, Quoth requests the captions for that
video from YouTube's own caption API, formats them locally, and displays
them next to the player. Clicking a word seeks the video to that moment.

## What Quoth collects

Nothing. Quoth does not have a server, an account system, or analytics.
No usage data, telemetry, IP addresses, identifiers, or content of any
kind is sent to a server operated by the developer or any third party.

## What Quoth stores

A copy of the parsed transcript for each video you view is cached in the
browser's local extension storage, keyed by YouTube video ID. This is so
that revisiting a video loads instantly instead of re-fetching the
captions. The cache lives only on your device. You can clear it at any
time by removing the extension or by clearing extension storage in your
browser's developer tools.

## What Quoth accesses

| Access | Why |
|---|---|
| YouTube watch pages (`*://*.youtube.com/*`) | Content scripts read the video's playback position and fetch captions from YouTube's caption API. |
| Active tab | Identifies which YouTube tab the side panel should connect to. |
| Local extension storage | Caches transcripts on your device. |

Quoth does not access any site other than youtube.com. It does not read
your browsing history, your bookmarks, or content from other tabs.

## Third parties

Quoth's only network request is to YouTube, to fetch the captions for the
video you are watching. Use of YouTube is governed by Google's own
privacy policy (https://policies.google.com/privacy).

There are no analytics SDKs, advertising networks, error reporting
services, or any other third-party services in the extension.

## Children

Quoth is not directed at children. It does not knowingly collect
information from anyone, including children.

## Changes

If this notice changes, the updated version will appear at this URL and
the "Last updated" date at the top will change. Substantive changes will
be called out in the next release notes.

## Contact

Questions or concerns: open an issue at
https://github.com/tednaleid/quoth/issues.
