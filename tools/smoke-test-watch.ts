#!/usr/bin/env -S bun run
/**
 * ABOUTME: Smoke test for the watch-page entry: loads chrome-extension://.../watch.html directly.
 * ABOUTME: Verifies iframe embed loads, transcript populates, click-to-seek works.
 */

import { chromium } from 'playwright';
import path from 'path';

const extensionPath = path.resolve('.output/chrome-mv3');
const videoId = process.argv[2] || 'YwZR6tc7qYg';

console.log('Launching browser with extension...');
const context = await chromium.launchPersistentContext('', {
  headless: false,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  ],
});

let [background] = context.serviceWorkers();
if (!background) {
  background = await context.waitForEvent('serviceworker');
}
const extensionId = background.url().split('/')[2];
console.log('Extension ID:', extensionId);

const page = context.pages()[0] || (await context.newPage());
page.on('console', (m) => {
  if (m.text().includes('[quoth') || m.type() === 'error') console.log(`[W] ${m.text()}`);
});
page.on('pageerror', (e) => console.log(`[W ERROR] ${e.message}`));

// Track the iframe player's current time by reading the cmt= parameter
// from the periodic stats requests the embed fires.
const playbackTimes: number[] = [];
page.on('request', (req) => {
  const url = req.url();
  if (!url.includes('/api/stats/')) return;
  // cmt looks like "0.005:0.000,0.006:147.840" - the last ":X" is the current media time in seconds
  const cmtMatch = url.match(/[?&]cmt=([^&]+)/);
  if (!cmtMatch) return;
  const segs = decodeURIComponent(cmtMatch[1]).split(',');
  const last = segs[segs.length - 1];
  const parts = last.split(':');
  const t = parseFloat(parts[parts.length - 1]);
  if (Number.isFinite(t)) playbackTimes.push(t);
});

const watchUrl = `chrome-extension://${extensionId}/watch.html?v=${videoId}&t=30`;
console.log(`Opening watch page: ${watchUrl}`);
await page.goto(watchUrl, { waitUntil: 'load', timeout: 30000 });

// Wait for transcript to populate (words rendered)
console.log('Waiting for transcript to load...');
await page.waitForSelector('.word', { timeout: 20000 });

const title = await page.locator('h1').textContent();
const wordCount = await page.locator('.word').count();
console.log(`Title: ${title}`);
console.log(`Words loaded: ${wordCount}`);

if (wordCount === 0) {
  console.log('\nSMOKE TEST FAILED: no words rendered');
  await page.screenshot({ path: '.output/smoke-test-watch-failure.png' });
  await context.close();
  process.exit(1);
}

// Click the iframe to satisfy browser autoplay gating
try {
  await page.locator('iframe').click({ timeout: 2000 });
} catch {
  // non-fatal
}

// Wait for the iframe player to start emitting stats so we have a baseline time
console.log('Waiting for iframe player to start...');
const baselineDeadline = Date.now() + 15000;
while (playbackTimes.length === 0 && Date.now() < baselineDeadline) {
  await page.waitForTimeout(500);
}
if (playbackTimes.length === 0) {
  console.log('\nSMOKE TEST FAILED: iframe player never reported playback time');
  await page.screenshot({ path: '.output/smoke-test-watch-failure.png' });
  await context.close();
  process.exit(1);
}
const baselineTime = playbackTimes[playbackTimes.length - 1];
console.log(`Baseline player time: ${baselineTime.toFixed(3)}s`);

// Click a word well past t=30 so we can detect the seek
console.log('\n--- Click-to-seek test ---');
const targetWord = page.locator('.word').nth(500);
const wordText = await targetWord.textContent();
const wordStartStr = await targetWord.getAttribute('data-start');
const wordStart = wordStartStr ? parseInt(wordStartStr) : 0;
console.log(`Clicking word "${wordText?.trim()}" (data-start: ${wordStart}ms = ${(wordStart / 1000).toFixed(3)}s)`);

const timesBeforeClickLen = playbackTimes.length;
await targetWord.click();

// Wait for the iframe to emit stats with the new playback time
console.log('Waiting for iframe stats after seek...');
const seekDeadline = Date.now() + 10000;
while (playbackTimes.length <= timesBeforeClickLen && Date.now() < seekDeadline) {
  await page.waitForTimeout(500);
}
const postSeekTimes = playbackTimes.slice(timesBeforeClickLen);
console.log(`Stats reported ${postSeekTimes.length} new playback times after click`);

// After seeking, the player should report a time near the target, NOT near the baseline
const targetSec = wordStart / 1000;
const matched = postSeekTimes.some((t) => Math.abs(t - targetSec) < 5);
if (!matched) {
  console.log(`Expected player time near ${targetSec.toFixed(3)}s, got: ${postSeekTimes.map((t) => t.toFixed(3)).join(', ')}`);
  console.log('Click-to-seek: FAILED');
  await page.screenshot({ path: '.output/smoke-test-watch-failure.png' });
  await context.close();
  process.exit(1);
}
console.log(`Click-to-seek: WORKING (player reported time ~${targetSec.toFixed(3)}s)`);

// Cache hit check: reload the page and verify transcript appears quickly
console.log('\n--- Cache hit check ---');
const reloadStart = Date.now();
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('.word', { timeout: 10000 });
const reloadMs = Date.now() - reloadStart;
console.log(`Transcript re-rendered in ${reloadMs}ms (cache hit implied by speed)`);

console.log('\nSMOKE TEST PASSED');
await context.close();
