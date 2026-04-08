#!/usr/bin/env -S bun run
/**
 * ABOUTME: Takes screenshots of the sidepanel transcript for visual evaluation.
 * ABOUTME: Loads the Chrome extension, navigates to a YouTube video, and captures the sidepanel.
 */

import { chromium } from 'playwright';
import path from 'path';

const extensionPath = path.resolve('.output/chrome-mv3');
const videoUrl = process.argv[2] || 'https://www.youtube.com/watch?v=YwZR6tc7qYg';
const outputName = process.argv[3] || 'sidepanel';

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

const pages = context.pages();
const ytPage = pages[0] || (await context.newPage());
console.log(`Navigating to: ${videoUrl}`);
await ytPage.goto(videoUrl, { waitUntil: 'load', timeout: 30000 });
await ytPage.waitForTimeout(5000);

const sidePanelPage = await context.newPage();
await sidePanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);
await sidePanelPage.waitForTimeout(5000);

// Set a fixed viewport for consistent screenshots
await sidePanelPage.setViewportSize({ width: 400, height: 900 });

const wordCount = await sidePanelPage.locator('.word').count();
const segmentCount = await sidePanelPage.locator('.segment').count();
console.log(`Words: ${wordCount}, Segments: ${segmentCount}`);

// Take screenshot
const screenshotPath = `.output/${outputName}.png`;
await sidePanelPage.screenshot({ path: screenshotPath, fullPage: false });
console.log(`Screenshot saved: ${screenshotPath}`);

// Also dump first few segments' text for quick review
const segmentTexts = await sidePanelPage.locator('.segment').evaluateAll((els) =>
  els.slice(0, 8).map((el) => {
    const ts = el.querySelector('.timestamp')?.textContent || '';
    const words = Array.from(el.querySelectorAll('.word'))
      .map((w) => w.textContent?.trim())
      .join(' ');
    return `${ts} ${words}`;
  })
);
console.log('\nFirst segments:');
for (const seg of segmentTexts) {
  console.log(`  ${seg}`);
}

await context.close();
