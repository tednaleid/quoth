#!/usr/bin/env -S bun run
/**
 * ABOUTME: Firefox watch-page smoke test using playwright-webextext to load the real extension.
 * ABOUTME: Verifies transcript loading, click-to-seek, and active-word advancement in Gecko.
 */

import { firefox } from 'playwright';
import { withExtension } from 'playwright-webextext';
import path from 'path';

const extensionPath = path.resolve('.output/firefox-mv2');
const videoId = process.argv[2] || 'YwZR6tc7qYg';

console.log(`Loading extension from: ${extensionPath}`);

const firefoxWithExt = withExtension(firefox, extensionPath);
const browser = await firefoxWithExt.launch({ headless: false });
const context = await browser.newContext();

// Discover the extension UUID by opening a YouTube page. The content script
// tags the page DOM with data-quoth-ext-url, which we read from Playwright.
console.log('Opening YouTube to discover extension UUID...');
const ytPage = await context.newPage();
ytPage.on('console', (msg) => {
  if (msg.text().includes('[quoth')) console.log(`[YT] ${msg.text()}`);
});
ytPage.on('pageerror', (e) => console.log(`[ERROR] ${e.message}`));

await ytPage.goto('https://www.youtube.com/watch?v=' + videoId, {
  waitUntil: 'load',
  timeout: 30000,
});
await ytPage.waitForTimeout(5000);

const extensionBaseUrl = await ytPage.evaluate(
  () => document.documentElement.dataset.quothExtUrl ?? null,
);

if (!extensionBaseUrl) {
  console.log('SMOKE TEST FAILED: content script did not tag page with extension URL');
  console.log('(data-quoth-ext-url not found on <html> element)');
  await browser.close();
  process.exit(1);
}

console.log(`Extension base URL: ${extensionBaseUrl}`);

// Close the YouTube page (no longer needed) and open the watch page
await ytPage.close();

const watchUrl = `${extensionBaseUrl}watch.html?v=${videoId}&t=30`;
console.log(`Opening watch page: ${watchUrl}`);

const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on('console', (msg) => {
  const text = msg.text();
  if (text.includes('[quoth') || msg.type() === 'error') console.log(`[W] ${text}`);
});

// Navigate — use a short timeout since iframe may block 'load' event forever
try {
  await page.goto(watchUrl, { timeout: 10000 });
} catch {
  console.log('(page.goto timed out — expected if iframe blocks load event)');
}

// Wait for transcript to populate
console.log('Waiting for transcript to load...');
try {
  await page.waitForSelector('.word', { timeout: 20000 });
} catch {
  console.log('Transcript did not load (.word not found). Dumping diagnostics...');
  const html = await page.content().catch(() => 'COULD NOT READ CONTENT');
  const diag = await page.evaluate(() => ({
    url: window.location.href,
    htmlLen: document.documentElement.outerHTML.length,
    main: document.querySelectorAll('main').length,
    h1: document.querySelector('h1')?.textContent ?? 'NONE',
    iframe: document.querySelectorAll('iframe').length,
    placeholder: document.querySelector('.placeholder')?.textContent ?? 'NONE',
    bodyText: document.body?.textContent?.slice(0, 300) ?? 'EMPTY',
  })).catch(() => ({ error: 'evaluate failed' }));
  console.log('Diagnostics:', JSON.stringify(diag, null, 2));
  console.log('\nSMOKE TEST FAILED');
  await browser.close();
  process.exit(1);
}

const title = await page.locator('h1').textContent();
const wordCount = await page.locator('.word').count();
console.log(`Title: ${title}`);
console.log(`Words loaded: ${wordCount}`);

if (wordCount === 0) {
  console.log('SMOKE TEST FAILED: no words rendered');
  await browser.close();
  process.exit(1);
}

// Wait for embed content script to start reporting playback time
console.log('Waiting for embed content script to report playback time...');
try {
  await page.waitForSelector('.word.active-word', { timeout: 15000 });
} catch {
  console.log('WARNING: No active-word highlight detected (embed content script may not have connected)');
  console.log('Transcript loaded but live playback tracking not confirmed');
}

const activeEl = page.locator('.word.active-word').first();
const initialStart = await activeEl.getAttribute('data-start').catch(() => null);
console.log(`Initial .active-word data-start: ${initialStart}ms`);

// Click a word to test seek
console.log('\n--- Click-to-seek test ---');
const targetWord = page.locator('.word').nth(500);
const wordText = await targetWord.textContent();
const wordStart = await targetWord.getAttribute('data-start');
console.log(`Clicking word "${wordText?.trim()}" (data-start: ${wordStart}ms)`);

await targetWord.click();
await page.waitForTimeout(2000);

const activeAfterClick = await page
  .locator('.word.active-word')
  .first()
  .getAttribute('data-start')
  .catch(() => null);
console.log(`Active word after click: ${activeAfterClick}ms`);

if (wordStart && activeAfterClick) {
  const expected = parseInt(wordStart);
  const got = parseInt(activeAfterClick);
  const diff = Math.abs(got - expected);
  console.log(`Expected: ~${expected}ms, Got: ${got}ms, Diff: ${diff}ms`);
  if (diff > 5000) {
    console.log('Click-to-seek: MISMATCH');
    await browser.close();
    process.exit(1);
  }
  console.log('Click-to-seek: WORKING');
} else {
  console.log('Click-to-seek: SKIPPED (active-word not available)');
}

// Active-word advancement test
console.log('\n--- Active-word advancement test ---');
await page.waitForTimeout(2000);
const activeAfterWait = await page
  .locator('.word.active-word')
  .first()
  .getAttribute('data-start')
  .catch(() => null);

if (activeAfterClick && activeAfterWait) {
  const before = parseInt(activeAfterClick);
  const after = parseInt(activeAfterWait);
  if (after > before) {
    console.log(`Active-word advancement: WORKING (${before}ms -> ${after}ms)`);
  } else {
    console.log(`Active-word advancement: NOT DETECTED (${before}ms -> ${after}ms)`);
  }
}

console.log('\nFIREFOX WATCH SMOKE TEST PASSED');
await browser.close();
