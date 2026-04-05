#!/usr/bin/env -S bun run
/**
 * ABOUTME: Debug script that loads the Firefox extension via playwright-webextext.
 * ABOUTME: Navigates to YouTube and logs content script + sidebar console messages.
 */

import { firefox } from 'playwright';
import { withExtension } from 'playwright-webextext';
import path from 'path';

const extensionPath = path.resolve('.output/firefox-mv2');
const videoUrl = process.argv[2] || 'https://www.youtube.com/watch?v=YwZR6tc7qYg';

console.log(`Loading extension from: ${extensionPath}`);
console.log(`Target video: ${videoUrl}\n`);

const firefoxWithExt = withExtension(firefox, extensionPath);
const browser = await firefoxWithExt.launch({ headless: false });
const context = await browser.newContext();

// Capture the extension's base URL from content script console output
let capturedExtUrl: string | null = null;

// Watch all pages for console messages
context.on('page', (page) => {
  const url = page.url();
  console.log(`\n=== New page: ${url} ===`);
  page.on('console', async (msg) => {
    const text = msg.text();
    // Filter noise: only show quoth messages and errors
    if (text.includes('[quoth]') || msg.type() === 'error') {
      const type = msg.type().toUpperCase().padEnd(5);
      // Serialize JSHandle args to readable values
      const args = await Promise.all(msg.args().map((a) => a.jsonValue().catch(() => '[unserializable]')));
      const fullText = args.length > 0 ? args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') : text;
      console.log(`[${type}] [${pageLabel(page.url())}] ${fullText}`);
      // Capture the extension URL
      if (!capturedExtUrl && fullText.includes('extension sidepanel URL')) {
        const match = fullText.match(/moz-extension:\/\/[a-f0-9-]+\/sidepanel\.html/i);
        if (match) capturedExtUrl = match[0];
      }
    }
  });
  page.on('pageerror', (err) => {
    console.log(`[ERROR] [${pageLabel(page.url())}] ${err.message}`);
  });
});

// Watch all context-level requests (includes content script + extension fetches)
context.on('request', (req) => {
  const reqUrl = req.url();
  if (reqUrl.includes('youtubei/v1/player') || reqUrl.includes('timedtext')) {
    console.log(`[NET  ] REQ  ${req.method()} ${reqUrl.slice(0, 120)}`);
  }
});
context.on('response', (res) => {
  const resUrl = res.url();
  if (resUrl.includes('youtubei/v1/player') || resUrl.includes('timedtext')) {
    console.log(`[NET  ] RESP ${res.status()} ${resUrl.slice(0, 120)}`);
  }
});

function pageLabel(url: string): string {
  if (url.includes('youtube.com')) return 'YT';
  if (url.includes('sidepanel.html')) return 'SIDEBAR';
  if (url.includes('background')) return 'BG';
  if (url.startsWith('moz-extension://')) return 'EXT';
  return url.slice(0, 40);
}

// Open YouTube page
console.log('Opening YouTube...');
const ytPage = await context.newPage();

await ytPage.goto(videoUrl, { waitUntil: 'load', timeout: 30000 });
console.log('YouTube loaded. Waiting 10s to see content script activity...');
await ytPage.waitForTimeout(10000);

// Check if our content script is loaded by looking for evidence
const hasContentScript = await ytPage.evaluate(() => {
  // Content script runs in isolated world -- we can't access its variables directly
  // but we can check if the extension's content script has set up its listeners
  // by looking at the DOM or any side effects
  return {
    videoEl: !!document.querySelector('video.html5-main-video'),
    videoSrc: (document.querySelector('video.html5-main-video') as HTMLVideoElement | null)?.src ?? null,
    documentReady: document.readyState,
  };
});
console.log('\nPage state:', hasContentScript);

// Try to open the sidebar programmatically
// In Firefox, we need to find the extension UUID first
console.log('\nLooking for extension pages...');
const pages = context.pages();
console.log(`Total pages: ${pages.length}`);
pages.forEach((p, i) => console.log(`  [${i}] ${p.url()}`));

// Open the background page to trigger it and find the extension URL
// Firefox doesn't expose extension pages via context.pages() directly unless they're open
// We can open the sidebar by navigating to moz-extension://<uuid>/sidepanel.html
// But we need to know the UUID. Try to extract it from the manifest or service workers.

const extUrl = capturedExtUrl;
console.log(`\nExtension sidepanel URL: ${extUrl}`);

if (extUrl) {
  console.log(`Opening sidebar as tab: ${extUrl}`);
  const sidebarPage = await context.newPage();
  await sidebarPage.goto(extUrl, { waitUntil: 'load', timeout: 10000 });
  console.log('Sidebar opened. Waiting 10s...');
  await sidebarPage.waitForTimeout(10000);

  // Check sidebar state
  const sidebarState = await sidebarPage.evaluate(() => {
    const status = document.querySelector('.status-bar span')?.textContent;
    const placeholder = document.querySelector('.placeholder p')?.textContent;
    const wordCount = document.querySelectorAll('.word').length;
    const transcriptExists = !!document.querySelector('.transcript');
    return { status, placeholder, wordCount, transcriptExists };
  });
  console.log('\nSidebar state:', sidebarState);
}

console.log('\n--- Keeping browser open for 20s for manual inspection ---');
await ytPage.waitForTimeout(20000);

await browser.close();
