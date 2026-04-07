#!/usr/bin/env -S bun run
/**
 * ABOUTME: Downloads YouTube video transcripts as timestamped text and raw JSON.
 * ABOUTME: Accepts a full URL or video ID, saves to .llm/ by default.
 */

import { parseArgs } from 'node:util';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseJson3Captions } from '../src/core/caption-parser';
import { formatTime } from '../src/core/time-format';
import type { TimedWord } from '../src/core/types';

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    output: { type: 'string', short: 'o' },
    help: { type: 'boolean', short: 'h' },
  },
  allowPositionals: true,
});

if (values.help || positionals.length === 0) {
  console.log(`Usage: just transcript <url-or-video-id> [-o output-path]

Downloads a YouTube video's transcript as timestamped text.

Examples:
  just transcript 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
  just transcript dQw4w9WgXcQ
  just transcript dQw4w9WgXcQ -o transcripts/rick.txt

Default output: .llm/<video-id>.txt (text) and .llm/<video-id>.json (raw words)`);
  process.exit(0);
}

// Extract video ID from URL or bare ID
const input = positionals[0];
const videoIdMatch = input.match(/[?&]v=([^&]+)/) ?? input.match(/^([a-zA-Z0-9_-]{11})$/);
if (!videoIdMatch) {
  console.error('Could not extract video ID. Pass a YouTube URL or 11-character video ID.');
  process.exit(1);
}
const videoId = videoIdMatch[1];

// Fetch player response via Innertube ANDROID client
const INNERTUBE_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const ANDROID_UA = 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)';

console.log(`Fetching transcript for video: ${videoId}`);

const playerResponse = await fetch(INNERTUBE_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'User-Agent': ANDROID_UA },
  body: JSON.stringify({
    context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } },
    videoId,
  }),
}).then((r) => r.json());

const title = playerResponse?.videoDetails?.title;
if (!title) {
  console.error('Failed to get video details from Innertube API.');
  process.exit(1);
}
console.log(`Title: ${title}`);

// Find English caption track
const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const englishTrack = tracks.find((t: any) => t.languageCode === 'en');
if (!englishTrack) {
  console.error(
    'No English captions found. Available:',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tracks.map((t: any) => t.languageCode).join(', ') || 'none',
  );
  process.exit(1);
}

// Fetch captions as JSON3
let captionUrl = englishTrack.baseUrl;
captionUrl = captionUrl.includes('fmt=')
  ? captionUrl.replace(/fmt=[^&]*/, 'fmt=json3')
  : captionUrl + '&fmt=json3';

const captionJson = await fetch(captionUrl, {
  headers: { 'User-Agent': ANDROID_UA },
}).then((r) => r.json());

const words: TimedWord[] = parseJson3Captions(captionJson);
console.log(`${words.length} words, auto-generated: ${englishTrack.kind === 'asr'}`);

// Group words into segments (by 2s gaps, matching the extension's SEGMENT_GAP_MS)
const SEGMENT_GAP_MS = 2000;
const segments: TimedWord[][] = [];
let current: TimedWord[] = [];

for (const word of words) {
  if (current.length > 0 && word.start - current[current.length - 1].end > SEGMENT_GAP_MS) {
    segments.push(current);
    current = [];
  }
  current.push(word);
}
if (current.length > 0) segments.push(current);

// Format as timestamped text
const lines = segments.map((seg) => {
  const timestamp = formatTime(seg[0].start);
  const text = seg.map((w) => w.text).join(' ');
  return `[${timestamp}] ${text}`;
});

const textOutput = `# ${title}\n# ${videoId}\n\n${lines.join('\n')}\n`;

// Determine output paths
const outputDir = resolve('.llm');
mkdirSync(outputDir, { recursive: true });

const basePath = values.output ?? resolve(outputDir, `${videoId}.txt`);
const jsonPath = basePath.replace(/\.txt$/, '.json');

await Bun.write(basePath, textOutput);
console.log(`Saved transcript to ${basePath}`);

// Save raw words as JSON for the model bench harness
const jsonOutput = { videoId, title, wordCount: words.length, words };
await Bun.write(jsonPath, JSON.stringify(jsonOutput, null, 2));
console.log(`Saved raw words to ${jsonPath}`);
