#!/usr/bin/env -S bun run
/**
 * ABOUTME: Captures YouTube video info and caption data as test fixtures.
 * ABOUTME: Uses Innertube ANDROID client API (same approach as the content script).
 */

const url = process.argv[2];
if (!url) {
  console.error('Usage: just fixture-capture <youtube-url> [output-name]');
  process.exit(1);
}

const videoIdMatch = url.match(/[?&]v=([^&]+)/);
if (!videoIdMatch) {
  console.error('Could not extract video ID from URL');
  process.exit(1);
}

const videoId = videoIdMatch[1];
const outputName = process.argv[3] ?? videoId;

const INNERTUBE_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const ANDROID_UA = 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)';

// Fetch player response via Innertube ANDROID client
const innertubeResponse = await fetch(INNERTUBE_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': ANDROID_UA,
  },
  body: JSON.stringify({
    context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } },
    videoId,
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
console.log(`  Title: ${playerResponse.videoDetails.title}`);

// Extract caption tracks
const tracks =
  playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const englishTrack = tracks.find((t: any) => t.languageCode === 'en');

if (!englishTrack) {
  console.log(
    'No English captions found. Available:',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tracks.map((t: any) => t.languageCode).join(', ') || 'none',
  );
  process.exit(0);
}

// Fetch captions (replace fmt with json3)
let captionUrl = englishTrack.baseUrl;
if (captionUrl.includes('fmt=')) {
  captionUrl = captionUrl.replace(/fmt=[^&]*/, 'fmt=json3');
} else {
  captionUrl += '&fmt=json3';
}

const captionResponse = await fetch(captionUrl, {
  headers: { 'User-Agent': ANDROID_UA },
});

const captionText = await captionResponse.text();
if (!captionText || captionText.length < 10) {
  console.error('Caption fetch returned empty response.');
  process.exit(1);
}

const captions = JSON.parse(captionText);
const captionPath = `tests/fixtures/captions/${outputName}.json`;
await Bun.write(captionPath, JSON.stringify(captions, null, 2));
console.log(`Saved captions to ${captionPath}`);
console.log(
  `  ${captions.events?.length ?? 0} events, auto-generated: ${englishTrack.kind === 'asr'}`,
);
