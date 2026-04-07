#!/usr/bin/env -S bun run
/**
 * ABOUTME: Firefox smoke test -- verifies side panel and popout render in Gecko engine.
 * ABOUTME: Serves the built pages via local HTTP with browser API stubs, opens in Playwright Firefox.
 */

import { firefox } from 'playwright';
import path from 'path';

// Find the built output in the Firefox build directory
const outputDirs = ['.output/firefox-mv3', '.output/firefox-mv2'];
let outputDir: string | null = null;

for (const dir of outputDirs) {
  const candidate = path.resolve(dir, 'sidepanel.html');
  const file = Bun.file(candidate);
  if (await file.exists()) {
    outputDir = path.resolve(dir);
    break;
  }
}

if (!outputDir) {
  console.error('No Firefox build output found. Run `just build` first.');
  process.exit(1);
}

// Serve the build output so absolute asset paths resolve correctly
const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url);
    const filePath = path.join(outputDir!, url.pathname);
    const file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file);
    }
    return new Response('Not Found', { status: 404 });
  },
});

const baseUrl = `http://localhost:${server.port}`;
console.log(`Serving ${outputDir} at ${baseUrl}`);

console.log('Launching Firefox...');
const browser = await firefox.launch({ headless: true });
const page = await browser.newPage();

// Inject a minimal WebExtensions browser API stub so the app can mount
// (outside extension context, browser.* globals are undefined and would crash)
await page.addInitScript(() => {
  const noop = () => {};
  const promiseResolve = () => Promise.resolve();
  const promiseResolveEmpty = () => Promise.resolve([]);
  const stubListener = { addListener: noop, removeListener: noop };
  // WXT polyfill checks globalThis.browser?.runtime?.id to detect extension context
  // @ts-expect-error -- stubbing globals for standalone page testing
  window.browser = {
    runtime: {
      id: 'quoth-test-stub',
      onMessage: stubListener,
      sendMessage: promiseResolve,
      getURL: (path: string) => `stub-extension://${path}`,
    },
    tabs: {
      query: promiseResolveEmpty,
      get: promiseResolve,
      sendMessage: promiseResolve,
      create: promiseResolve,
      onActivated: stubListener,
      onRemoved: stubListener,
      onUpdated: stubListener,
    },
  };
});

// Collect JS errors -- some may still occur and we'll report them
const errors: string[] = [];
page.on('pageerror', (err) => errors.push(err.message));

// --- Sidepanel rendering test ---
const targetUrl = `${baseUrl}/sidepanel.html`;
console.log(`Opening: ${targetUrl}`);

await page.goto(targetUrl, { waitUntil: 'load', timeout: 15000 });
await page.waitForTimeout(2000);

const mainEl = await page.locator('main').count();
if (mainEl === 0) {
  console.log('FIREFOX SMOKE TEST FAILED: Svelte app did not mount (<main> not found)');
  console.log('JS errors:');
  errors.forEach((e) => console.log(`  - ${e}`));
  await browser.close();
  server.stop();
  process.exit(1);
}
console.log('Sidepanel mounted: <main> element present');

const statusBarCount = await page.locator('.status-bar').count();
console.log(`Status bar rendered: ${statusBarCount > 0}`);

const placeholderText = await page
  .locator('.placeholder p')
  .textContent()
  .catch(() => null);
if (placeholderText) {
  console.log(`Initial placeholder: "${placeholderText.trim()}"`);
}

// --- Popout page rendering test ---
console.log('\n--- Popout page test ---');
const popoutUrl = `${baseUrl}/popout.html?tabId=1`;
console.log(`Opening: ${popoutUrl}`);
await page.goto(popoutUrl, { waitUntil: 'load', timeout: 15000 });
await page.waitForTimeout(2000);

const popoutMainEl = await page.locator('main').count();
if (popoutMainEl === 0) {
  console.log('FIREFOX SMOKE TEST FAILED: Popout app did not mount (<main> not found)');
  await browser.close();
  server.stop();
  process.exit(1);
}
console.log('Popout app mounted: <main> element present');

const popoutPlaceholder = await page
  .locator('.placeholder p')
  .textContent()
  .catch(() => null);
if (popoutPlaceholder) {
  console.log(`Popout placeholder: "${popoutPlaceholder.trim()}"`);
}

// Report JS errors for visibility (not a failure condition -- expected outside extension)
if (errors.length > 0) {
  console.log(`\nJS errors (expected for non-extension context):`);
  errors.forEach((e) => console.log(`  - ${e}`));
}

console.log('\nFIREFOX SMOKE TEST PASSED: Side panel and popout render in Gecko engine');
await browser.close();
server.stop();
