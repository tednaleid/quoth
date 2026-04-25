#!/usr/bin/env -S bun run
/**
 * ABOUTME: Captures store-quality 1280x800 PNG screenshots of the Chrome extension UI
 * ABOUTME: into assets/store/screenshots/. Reuses the same launch pattern as smoke-test-chrome.
 */

import { chromium } from 'playwright';
import path from 'path';
import { mkdirSync } from 'node:fs';

const extensionPath = path.resolve('.output/chrome-mv3');
const videoUrl = process.argv[2] || 'https://www.youtube.com/watch?v=YwZR6tc7qYg';
const outDir = path.resolve('assets/store/screenshots');
mkdirSync(outDir, { recursive: true });

const VIEWPORT = { width: 1280, height: 800 };

console.log('Launching Chrome with extension...');
const context = await chromium.launchPersistentContext('', {
  headless: false,
  viewport: VIEWPORT,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
  ],
});

let [background] = context.serviceWorkers();
if (!background) background = await context.waitForEvent('serviceworker');
const extensionId = background.url().split('/')[2];
console.log('Extension ID:', extensionId);

const ytPage = context.pages()[0] || (await context.newPage());
await ytPage.setViewportSize(VIEWPORT);
console.log('Loading YouTube video:', videoUrl);
await ytPage.goto(videoUrl, { waitUntil: 'load', timeout: 30000 });
await ytPage.waitForTimeout(5000);

// Pause the YouTube video so screenshots aren't moving frames
await ytPage.evaluate(() => {
  const video = document.querySelector('video') as HTMLVideoElement | null;
  if (video) {
    video.pause();
    video.currentTime = 0;
  }
});

// --- Side panel screenshot ---
console.log('Capturing 01-sidepanel.png...');
const sidePanel = await context.newPage();
await sidePanel.setViewportSize(VIEWPORT);
await sidePanel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
await sidePanel.waitForSelector('.transcript .word', { timeout: 15000 });
await sidePanel.waitForTimeout(1500);
await sidePanel.screenshot({ path: path.join(outDir, '01-sidepanel.png'), fullPage: false });

// --- Popout screenshots ---
const ytTabIds = await background.evaluate(async () => {
  const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/watch*' });
  return tabs.map((t: { id?: number }) => t.id);
});
const popoutTabId = ytTabIds[0];
if (!popoutTabId) {
  console.error('Could not find YouTube tab id for popout');
  await context.close();
  process.exit(1);
}

const popout = await context.newPage();
await popout.setViewportSize(VIEWPORT);
await popout.goto(`chrome-extension://${extensionId}/popout.html?tabId=${popoutTabId}`);
await popout.waitForSelector('.transcript .word', { timeout: 15000 });
await popout.waitForTimeout(1500);

// 02: idle popout, top of transcript
console.log('Capturing 02-popout.png...');
await popout.screenshot({ path: path.join(outDir, '02-popout.png'), fullPage: false });

// 03: fade horizon active during playback
console.log('Capturing 03-horizon.png...');
await ytPage.evaluate(() => {
  const video = document.querySelector('video') as HTMLVideoElement | null;
  if (video) {
    video.currentTime = 30;
    void video.play();
  }
});
await popout.waitForTimeout(2500);
// Scroll to where the horizon is rendering so it's in the viewport
await popout.evaluate(() => {
  const lit = document.querySelector('.word[style*="--word-intensity"]') as HTMLElement | null;
  if (lit) lit.scrollIntoView({ block: 'center' });
});
await popout.waitForTimeout(800);
await popout.screenshot({ path: path.join(outDir, '03-horizon.png'), fullPage: false });

// 04: click-to-seek mid-action -- pause first, click a word deeper in the transcript
console.log('Capturing 04-click-to-seek.png...');
await ytPage.evaluate(() => {
  const video = document.querySelector('video') as HTMLVideoElement | null;
  if (video) video.pause();
});
const target = popout.locator('.word').nth(200);
await target.scrollIntoViewIfNeeded();
await popout.waitForTimeout(400);
await target.hover();
await popout.waitForTimeout(300);
await popout.screenshot({ path: path.join(outDir, '04-click-to-seek.png'), fullPage: false });

console.log('\nScreenshots written to', outDir);
console.log('Files:');
for (const f of [
  '01-sidepanel.png',
  '02-popout.png',
  '03-horizon.png',
  '04-click-to-seek.png',
]) {
  console.log('  ', path.join(outDir, f));
}

await context.close();
