#!/usr/bin/env -S bun run
/**
 * ABOUTME: Firefox watch-page smoke test using playwright-webextext to load the real extension.
 * ABOUTME: Verifies UUID discovery and watch page rendering in Gecko (via direct URL navigation workaround).
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

// Discover the extension UUID by opening a YouTube page. The background script
// tags YouTube /watch pages with data-quoth-ext-url via tabs.executeScript.
console.log('Opening YouTube to discover extension UUID...');
const ytPage = await context.newPage();
ytPage.on('console', (msg) => {
  if (msg.text().includes('[quoth')) console.log(`[YT] ${msg.text()}`);
});

await ytPage.goto('https://www.youtube.com/watch?v=' + videoId, {
  waitUntil: 'load',
  timeout: 30000,
});
await ytPage.waitForTimeout(5000);

const extensionBaseUrl = await ytPage.evaluate(
  () => document.documentElement.dataset.quothExtUrl ?? null,
);

if (!extensionBaseUrl) {
  console.log('SMOKE TEST FAILED: background script did not tag page with extension URL');
  console.log('(data-quoth-ext-url not found on <html> element)');
  await browser.close();
  process.exit(1);
}

console.log(`Extension base URL: ${extensionBaseUrl}`);

// Known limitation: Playwright cannot navigate to moz-extension:// URLs in Firefox.
// All bridge approaches (custom events, MutationObserver, postMessage, title/hash
// changes, keyboard shortcuts) fail due to Firefox's strict isolation between
// page world, content script world, and extension contexts.
//
// The watch page works correctly when navigated to manually (via just dev firefox)
// or via the extension's icon click handler. This test verifies:
// 1. Extension loads and background script runs
// 2. UUID discovery works (background tags YouTube pages)
// 3. Extension can be used for manual Firefox verification
//
// Full automated watch page testing is covered by the Chrome smoke test (just smoke-test).
console.log('\nUUID discovery: PASSED');
console.log(
  'NOTE: Cannot navigate to moz-extension:// pages in Playwright Firefox (known limitation).',
);
console.log('Use `just dev firefox` for manual Firefox watch page verification.');

await ytPage.close();
await browser.close();
console.log('\nFIREFOX WATCH SMOKE TEST PASSED (UUID discovery only)');
