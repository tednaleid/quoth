#!/usr/bin/env -S bun run
/**
 * ABOUTME: Captures YouTube video info and caption data as test fixtures.
 * ABOUTME: Uses YouTube Innertube API. Caption fetch may fail server-side due to auth requirements.
 */

const url = process.argv[2];
if (!url) {
  console.error('Usage: bun run tools/fixture-capture.ts <youtube-url> [output-name]');
  process.exit(1);
}

const videoIdMatch = url.match(/[?&]v=([^&]+)/);
if (!videoIdMatch) {
  console.error('Could not extract video ID from URL');
  process.exit(1);
}

const videoId = videoIdMatch[1];
const outputName = process.argv[3] ?? videoId;

// Use the Innertube player API to get video info and caption tracks
// This avoids needing cookies/session state from a page load
const innertubeResponse = await fetch('https://www.youtube.com/youtubei/v1/player', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
  body: JSON.stringify({
    videoId,
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: '19.09.37',
        androidSdkVersion: 30,
        hl: 'en',
      },
    },
  }),
});

const playerResponse = await innertubeResponse.json();
if (!playerResponse?.videoDetails) {
  console.error('Failed to get player response from Innertube API');
  process.exit(1);
}

// Save player response
const playerPath = `tests/fixtures/youtube-pages/${outputName}-player-response.json`;
await Bun.write(playerPath, JSON.stringify(playerResponse, null, 2));
console.log(`Saved player response to ${playerPath}`);

// Extract caption tracks
const tracks =
  playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const englishTrack = tracks.find((t: any) => t.languageCode === 'en');

if (!englishTrack) {
  console.log(
    'No English captions found. Available tracks:',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tracks.map((t: any) => t.languageCode),
  );
  process.exit(0);
}

// Fetch captions with same headers as the page request
let captionUrl = englishTrack.baseUrl;
if (!captionUrl.includes('fmt=json3')) {
  captionUrl += '&fmt=json3';
}

const captionResponse = await fetch(captionUrl, {
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Referer: 'https://www.youtube.com/',
  },
});

const captionText = await captionResponse.text();
if (!captionText || captionText === 'null') {
  console.error('Caption fetch returned empty/null. The URL signature may have expired.');
  console.error('Caption URL:', captionUrl.substring(0, 100) + '...');
  console.error(
    'Try running this script again quickly after page fetch, or use a browser to save captions manually.',
  );
  process.exit(1);
}

const captions = JSON.parse(captionText);

const captionPath = `tests/fixtures/captions/${outputName}.json`;
await Bun.write(captionPath, JSON.stringify(captions, null, 2));
console.log(`Saved captions to ${captionPath}`);
console.log(
  `Captions: ${captions.events?.length ?? 0} events, auto-generated: ${englishTrack.kind === 'asr'}`,
);
