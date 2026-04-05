#!/usr/bin/env -S bun run
/**
 * ABOUTME: Smoke test for the watch-page entry: loads chrome-extension://.../watch.html directly.
 * ABOUTME: Verifies iframe embed loads, transcript populates, click-to-seek works, active-word advances.
 */

import { chromium } from 'playwright';
import path from 'path';

const extensionPath = path.resolve('.output/chrome-mv3');
const videoId = process.argv[2] || 'YwZR6tc7qYg';

async function launchContext(headless: boolean) {
  const args = [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--mute-audio',
  ];
  if (!headless) {
    args.push('--window-position=-10000,-10000');
  }
  return chromium.launchPersistentContext('', { headless, args });
}

console.log('Launching browser with extension (headless)...');
let context = await launchContext(true);

let [background] = context.serviceWorkers();
if (!background) {
  try {
    background = await context.waitForEvent('serviceworker', { timeout: 5000 });
  } catch {
    console.log('Headless extension load failed, falling back to off-screen headed mode...');
    await context.close();
    context = await launchContext(false);
    [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker');
    }
  }
}
const extensionId = background.url().split('/')[2];
console.log('Extension ID:', extensionId);

const page = context.pages()[0] || (await context.newPage());
page.on('console', (m) => {
  if (m.text().includes('[quoth') || m.type() === 'error') console.log(`[W] ${m.text()}`);
});
page.on('pageerror', (e) => console.log(`[W ERROR] ${e.message}`));

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

// Click the iframe to satisfy browser autoplay gating (belt-and-suspenders with &mute=1)
try {
  await page.locator('iframe').click({ timeout: 2000 });
} catch {
  // non-fatal
}

// Wait for the embed content script to start emitting time updates (first .active-word)
console.log('Waiting for embed content script to report playback time...');
await page.waitForSelector('.active-word', { timeout: 15000 });
const initialActiveStart = parseInt(
  (await page.locator('.active-word').first().getAttribute('data-start')) || '0',
);
console.log(`Initial .active-word data-start: ${initialActiveStart}ms`);

// Click a word well past t=30 so we can detect the seek
console.log('\n--- Click-to-seek test ---');
const targetWord = page.locator('.word').nth(500);
const wordText = await targetWord.textContent();
const wordStartStr = await targetWord.getAttribute('data-start');
const wordStart = wordStartStr ? parseInt(wordStartStr) : 0;
console.log(
  `Clicking word "${wordText?.trim()}" (data-start: ${wordStart}ms = ${(wordStart / 1000).toFixed(3)}s)`,
);

await targetWord.click();

// Wait ~1s for the seek to take effect and the active-word to move near the clicked word
await page.waitForTimeout(1000);
const postSeekActiveStart = parseInt(
  (await page.locator('.active-word').first().getAttribute('data-start')) || '0',
);
console.log(`After click+1s: .active-word data-start=${postSeekActiveStart}ms`);

// Verify the active-word jumped to near the clicked word (within 5s)
if (Math.abs(postSeekActiveStart - wordStart) > 5000) {
  console.log(
    `Click-to-seek FAILED: expected active-word near ${wordStart}ms, got ${postSeekActiveStart}ms`,
  );
  await page.screenshot({ path: '.output/smoke-test-watch-failure.png' });
  await context.close();
  process.exit(1);
}
console.log(`Click-to-seek: WORKING (active-word moved to ~${postSeekActiveStart}ms)`);

// Wait another 1.5s and verify the active-word advanced (live highlighting works)
console.log('\n--- Active-word advancement test ---');
await page.waitForTimeout(1500);
const advancedActiveStart = parseInt(
  (await page.locator('.active-word').first().getAttribute('data-start')) || '0',
);
console.log(`After +1.5s more: .active-word data-start=${advancedActiveStart}ms`);

if (advancedActiveStart <= postSeekActiveStart) {
  console.log(
    `Active-word advancement FAILED: data-start did not advance (${postSeekActiveStart}ms -> ${advancedActiveStart}ms)`,
  );
  await page.screenshot({ path: '.output/smoke-test-watch-failure.png' });
  await context.close();
  process.exit(1);
}
console.log(
  `Active-word advancement: WORKING (${postSeekActiveStart}ms -> ${advancedActiveStart}ms)`,
);

// Cache hit check: reload the page and verify transcript appears quickly
console.log('\n--- Cache hit check ---');
const reloadStart = Date.now();
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('.word', { timeout: 10000 });
const reloadMs = Date.now() - reloadStart;
console.log(`Transcript re-rendered in ${reloadMs}ms (cache hit implied by speed)`);

console.log('\nSMOKE TEST PASSED');
await context.close();
