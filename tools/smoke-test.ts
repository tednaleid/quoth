#!/usr/bin/env -S bun run
/**
 * ABOUTME: Smoke test that loads the extension, navigates to YouTube, and verifies the full flow.
 * ABOUTME: Opens side panel as a tab and tests transcript loading + click-to-seek via Playwright.
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
  ],
});

let [background] = context.serviceWorkers();
if (!background) {
  background = await context.waitForEvent('serviceworker');
}
const extensionId = background.url().split('/')[2];
console.log('Extension ID:', extensionId);

// Navigate to YouTube
const pages = context.pages();
const ytPage = pages[0] || (await context.newPage());
ytPage.on('console', (m) => {
  if (m.text().includes('[quoth')) console.log(`[YT] ${m.text()}`);
});
console.log('Navigating to YouTube:', videoUrl);
await ytPage.goto(videoUrl, { waitUntil: 'load', timeout: 30000 });
await ytPage.waitForTimeout(5000);

// Open side panel as a tab
console.log('Opening side panel...');
const sidePanelPage = await context.newPage();
sidePanelPage.on('console', (m) => {
  if (m.text().includes('[quoth')) console.log(`[SP] ${m.text()}`);
});
sidePanelPage.on('pageerror', (e) => console.log(`[SP ERROR] ${e.message}`));

await sidePanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);
await sidePanelPage.waitForTimeout(5000);

// Check side panel state
const header = await sidePanelPage.locator('h1').textContent();
const status = await sidePanelPage.locator('.status-bar span').textContent();
const hasTranscript = (await sidePanelPage.locator('.transcript').count()) > 0;
const wordCount = hasTranscript ? await sidePanelPage.locator('.word').count() : 0;

console.log(`Header: ${header}`);
console.log(`Status: ${status}`);
console.log(`Transcript: ${hasTranscript}, Words: ${wordCount}`);

if (!hasTranscript || wordCount === 0) {
  console.log('\nSMOKE TEST FAILED: No transcript loaded');
  await sidePanelPage.screenshot({ path: '.output/smoke-test-failure.png' });
  console.log('Screenshot saved to .output/smoke-test-failure.png');
  // Also dump sidepanel HTML to help debug
  const html = await sidePanelPage.content();
  console.log('Sidepanel HTML (first 800 chars):');
  console.log(html.slice(0, 800));
  await context.close();
  process.exit(1);
}

const firstWords = await sidePanelPage
  .locator('.word')
  .evaluateAll((els) => els.slice(0, 5).map((e) => e.textContent?.trim()));
console.log(`First words: ${firstWords.join(', ')}`);

// Test click-to-seek
console.log('\n--- Click-to-seek test ---');
const targetWord = sidePanelPage.locator('.word').nth(500);
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
  if (diff < 5000) {
    console.log('Click-to-seek: WORKING');
  } else {
    console.log('Click-to-seek: MISMATCH');
    await context.close();
    process.exit(1);
  }
}

console.log('\nSMOKE TEST PASSED');
await context.close();
