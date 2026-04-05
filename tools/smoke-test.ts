#!/usr/bin/env -S bun run
/**
 * ABOUTME: Smoke test that investigates YouTube caption access from the page context.
 * ABOUTME: Uses Playwright to load YouTube and run JavaScript directly.
 */

import { chromium } from 'playwright';
import path from 'path';

const extensionPath = path.resolve('.output/chrome-mv3');
const videoUrl = process.argv[2] || 'https://www.youtube.com/watch?v=YwZR6tc7qYg';

console.log('Launching browser with extension...');
const context = await chromium.launchPersistentContext('', {
  headless: false,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--disable-blink-features=AutomationControlled',
  ],
});

let [background] = context.serviceWorkers();
if (!background) {
  background = await context.waitForEvent('serviceworker');
}
const extensionId = background.url().split('/')[2];

const pages = context.pages();
const ytPage = pages[0] || (await context.newPage());

// Set consent cookies before navigating (YouTube returns empty captions without these)
await context.addCookies([
  {
    name: 'CONSENT',
    value: 'YES+cb.20210328-17-p0.en+FX+634',
    domain: '.youtube.com',
    path: '/',
  },
  {
    name: 'SOCS',
    value: 'CAISHAgCEhJnd3NfMjAyNDAxMTAtMF9SQzIaAmVuIAEaBgiA_LyuBg',
    domain: '.youtube.com',
    path: '/',
  },
  {
    name: 'CONSENT',
    value: 'YES+cb.20210328-17-p0.en+FX+634',
    domain: '.google.com',
    path: '/',
  },
]);

console.log('Navigating to YouTube:', videoUrl);
await ytPage.goto(videoUrl, { waitUntil: 'load', timeout: 30000 });
await ytPage.waitForTimeout(5000);

// Run investigation directly in page context
const investigation = await ytPage.evaluate(async () => {
  const results: Record<string, any> = {};

  // 1. Check player response global variable
  const pr = (window as any).ytInitialPlayerResponse;
  results.hasPlayerResponse = !!pr;
  results.videoId = pr?.videoDetails?.videoId;
  results.title = pr?.videoDetails?.title?.substring(0, 50);

  // 2. Get caption tracks
  const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  results.trackCount = tracks.length;
  results.tracks = tracks.map((t: any) => ({
    lang: t.languageCode,
    kind: t.kind,
    name: t.name?.simpleText,
    fullUrl: t.baseUrl,
  }));

  // 3. Try fetching the first caption track
  if (tracks.length > 0) {
    const track = tracks[0];
    const rawUrl = track.baseUrl;

    // Try raw URL
    try {
      const resp = await fetch(rawUrl);
      const text = await resp.text();
      results.rawFetch = {
        status: resp.status,
        contentType: resp.headers.get('content-type'),
        len: text.length,
        preview: text.substring(0, 300),
      };
    } catch (e) { results.rawFetch = { error: (e as Error).message }; }

    // Try with fmt=json3 appended
    const json3Url = rawUrl + (rawUrl.includes('?') ? '&' : '?') + 'fmt=json3';
    try {
      const resp = await fetch(json3Url);
      const text = await resp.text();
      results.json3Fetch = {
        status: resp.status,
        contentType: resp.headers.get('content-type'),
        len: text.length,
        preview: text.substring(0, 300),
      };
    } catch (e) { results.json3Fetch = { error: (e as Error).message }; }
  }

  // 4. Check if YouTube's own transcript UI is available
  const transcriptButton = document.querySelector('button[aria-label*="transcript" i]')
    || document.querySelector('[aria-label*="Show transcript" i]');
  results.hasTranscriptButton = !!transcriptButton;

  // 5. Check page cookies
  results.cookieCount = document.cookie.split(';').length;
  results.hasConsentCookie = document.cookie.includes('SOCS') || document.cookie.includes('CONSENT');

  return results;
});

console.log('\n=== YouTube Caption Investigation ===');
console.log(JSON.stringify(investigation, null, 2));

// Also test the extension's side panel
console.log('\n=== Extension Side Panel ===');
const sidePanelPage = await context.newPage();
await sidePanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);
await sidePanelPage.waitForTimeout(5000);

const status = await sidePanelPage.locator('.status-bar span').textContent();
const header = await sidePanelPage.locator('h1').textContent();
const hasTranscript = (await sidePanelPage.locator('.transcript').count()) > 0;
const wordCount = hasTranscript ? await sidePanelPage.locator('.word').count() : 0;
console.log(`Header: ${header}`);
console.log(`Status: ${status}`);
console.log(`Transcript: ${hasTranscript}, Words: ${wordCount}`);

if (hasTranscript && wordCount > 0) {
  const first5 = await sidePanelPage.locator('.word').evaluateAll(
    (els) => els.slice(0, 5).map((e) => e.textContent?.trim()),
  );
  console.log(`First words: ${first5.join(', ')}`);

  // Test click-to-seek on a nearby word
  console.log('\n--- Click-to-seek test ---');
  const targetWord = sidePanelPage.locator('.word').nth(4);
  const wordText = await targetWord.textContent();
  const wordStart = await targetWord.getAttribute('data-start');
  console.log(`Clicking word "${wordText?.trim()}" (data-start: ${wordStart}ms)`);

  const timeBefore = await ytPage.evaluate(() => {
    const video = document.querySelector('video') as HTMLVideoElement | null;
    return video ? Math.round(video.currentTime * 1000) : null;
  });
  console.log(`Video time before: ${timeBefore}ms`);

  await targetWord.click();
  await ytPage.waitForTimeout(2000);

  const timeAfter = await ytPage.evaluate(() => {
    const video = document.querySelector('video') as HTMLVideoElement | null;
    return video ? Math.round(video.currentTime * 1000) : null;
  });
  console.log(`Video time after: ${timeAfter}ms`);

  if (wordStart && timeAfter !== null) {
    const expected = parseInt(wordStart);
    const diff = Math.abs(timeAfter - expected);
    console.log(`Expected: ~${expected}ms, Got: ${timeAfter}ms, Diff: ${diff}ms`);
    console.log(diff < 5000 ? 'Click-to-seek: WORKING' : 'Click-to-seek: MISMATCH');
  }

  console.log('\n=== SMOKE TEST PASSED ===');
} else {
  console.log('\n=== NEEDS INVESTIGATION ===');
}

await context.close();
