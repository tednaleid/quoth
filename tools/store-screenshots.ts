#!/usr/bin/env -S bun run
/**
 * ABOUTME: Captures the store listing screenshots: real browser windows with the docked sidebar at 1280x800.
 * ABOUTME: Chrome is driven via Playwright + CDP, Firefox via Playwright + the View menu; capture is OS-level.
 */

import {
  chromium,
  firefox,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Page,
} from 'playwright';
import { withExtension } from 'playwright-webextext';
import path from 'path';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const which = process.argv[2] || 'all';
const videoUrl = process.argv[3] || 'https://www.youtube.com/watch?v=o1umIJJgKuk';
const outDir = path.resolve('assets/store/screenshots');
mkdirSync(outDir, { recursive: true });

const WIDTH = 1280;
const HEIGHT = 800;
// Sidebar width in the committed store shots; both browsers default narrower.
const SIDEBAR_WIDTH = 420;
const FIREFOX_SIDEBAR_WIDTH = 590;
const SEEK_SECONDS = 20;
const helper = path.resolve('tools/capture-window.py');

interface OsWindow {
  id: number;
  pid: number;
  owner: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function os(cmd: string, ...args: string[]): string {
  const r = spawnSync(helper, [cmd, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`capture-window ${cmd} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function osWindow(owner: string): OsWindow {
  const found = JSON.parse(os('list', owner)) as OsWindow[];
  if (found.length === 0) throw new Error(`no window for ${owner}`);
  return found[0];
}

function capture(owner: string, name: string): void {
  const file = path.join(outDir, `${name}.png`);
  os('capture', owner, file);
  console.log(`  captured ${name}.png`);
}

function osascript(script: string): string {
  const r = spawnSync('osascript', ['-e', script], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`osascript failed: ${r.stderr}`);
  return r.stdout.trim();
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Plays from SEEK_SECONDS for a moment so the highlight sits mid-transcript, then pauses. */
async function primePlayback(page: Page): Promise<void> {
  await page.evaluate((seek) => {
    const v = document.querySelector('video') as HTMLVideoElement | null;
    if (!v) return;
    v.currentTime = seek;
    void v.play();
  }, SEEK_SECONDS);
  await wait(3000);
  await page.evaluate(() => (document.querySelector('video') as HTMLVideoElement | null)?.pause());
}

/** The content script forwards this to the background, which opens the sidebar or popout. */
async function requestPage(page: Page, target: 'sidepanel' | 'popout'): Promise<void> {
  // A trusted click grants the user activation the sidebar API requires.
  await page.mouse.click(WIDTH / 2, HEIGHT - 100);
  await page.evaluate((t) => window.postMessage({ type: 'quoth-open-page', page: t }, '*'), target);
}

/** Waits for the popout tab, which opens active and so becomes the window title. */
async function waitForPopoutWindow(owner: string): Promise<void> {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const name = (JSON.parse(os('list', owner)) as { name: string }[])[0]?.name ?? '';
    if (name.startsWith('Quoth')) {
      // Give the popout time to load the transcript before capturing.
      await wait(2500);
      return;
    }
    await wait(250);
  }
  throw new Error('popout tab did not open');
}

/** Evaluates JS inside a non-page CDP target (Chrome's docked side panel). */
async function attachEvaluator(cdp: CDPSession, targetId: string) {
  const { sessionId } = (await cdp.send('Target.attachToTarget', { targetId, flatten: false })) as {
    sessionId: string;
  };
  let nextId = 1;
  const pending = new Map<number, (v: unknown) => void>();
  cdp.on('Target.receivedMessageFromTarget', (ev: { sessionId: string; message: string }) => {
    if (ev.sessionId !== sessionId) return;
    const msg = JSON.parse(ev.message) as {
      id?: number;
      result?: { result?: { value?: unknown } };
    };
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)!(msg.result?.result?.value);
      pending.delete(msg.id);
    }
  });
  return (expression: string) =>
    new Promise<unknown>((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      void cdp.send('Target.sendMessageToTarget', {
        sessionId,
        message: JSON.stringify({
          id,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true },
        }),
      });
    });
}

async function chromeShots(): Promise<void> {
  console.log('Chrome');
  const extensionPath = path.resolve('.output/chrome-mv3');
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    viewport: null,
    args: [
      '--mute-audio',
      `--window-size=${WIDTH},${HEIGHT}`,
      '--window-position=0,0',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  try {
    await chromeFlow(context);
  } finally {
    await context.close();
  }
}

async function chromeFlow(context: BrowserContext): Promise<void> {
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(videoUrl, { waitUntil: 'load', timeout: 30000 });
  await wait(4000);
  await requestPage(page, 'sidepanel');
  await wait(2500);

  const cdp = await context.newCDPSession(page);
  const { targetInfos } = (await cdp.send('Target.getTargets')) as {
    targetInfos: { targetId: string; url: string }[];
  };
  const panel = targetInfos.find((t) => t.url.includes('sidepanel.html'));
  if (!panel) throw new Error('side panel did not open');
  const inPanel = await attachEvaluator(cdp, panel.targetId);

  // Widen the panel by dragging its left edge. The panel document sits inside
  // about 17px of side panel chrome, so the resize edge is left of innerWidth.
  const win = osWindow('Chrom');
  const panelWidth = (await inPanel('window.innerWidth')) as number;
  const edgeX = win.x + WIDTH - panelWidth - 17;
  os(
    'drag',
    String(edgeX),
    String(win.y + 400),
    String(win.x + WIDTH - SIDEBAR_WIDTH),
    String(win.y + 400),
  );
  await wait(800);

  await primePlayback(page);
  await wait(500);
  capture('Chrom', '01-chrome-sidepanel');

  await inPanel(
    'document.querySelector(\'button[aria-label="Highlight settings"]\').click(); true',
  );
  await wait(600);
  capture('Chrom', '02-chrome-settings');
  await inPanel(
    'document.querySelector(\'button[aria-label="Highlight settings"]\').click(); true',
  );

  await inPanel('window.close(); true');
  await requestPage(page, 'popout');
  await waitForPopoutWindow('Chrom');
  capture('Chrom', '03-chrome-popout');
}

async function firefoxShots(): Promise<void> {
  console.log('Firefox');
  const extensionPath = path.resolve('.output/firefox-mv2');
  const browser = await withExtension(firefox, extensionPath).launch({ headless: false });
  try {
    await firefoxFlow(browser);
  } finally {
    await browser.close();
  }
}

async function firefoxFlow(browser: Browser): Promise<void> {
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();
  await page.goto(videoUrl, { waitUntil: 'load', timeout: 30000 });
  await wait(5000);

  // Playwright's Firefox is addressed by pid; its process name is not stable.
  const win = osWindow('Nightly');
  const proc = `(first process whose unix id is ${win.pid})`;
  osascript(`tell application "System Events" to set frontmost of ${proc} to true`);
  osascript(
    `tell application "System Events" to tell ${proc} to set position of front window to {0, 0}`,
  );
  osascript(
    `tell application "System Events" to tell ${proc} to set size of front window to {${WIDTH}, ${HEIGHT}}`,
  );
  await wait(800);
  const toggleSidebar = () =>
    osascript(
      `tell application "System Events" to tell ${proc} to click menu item "Quoth" of menu 1 of menu item "Sidebar" of menu 1 of menu bar item "View" of menu bar 1`,
    );
  toggleSidebar();
  await wait(3000);

  // Widen the sidebar by dragging its splitter (default width is ~215px).
  const sized = osWindow('Nightly');
  os(
    'drag',
    String(sized.x + 216),
    String(sized.y + 400),
    String(sized.x + FIREFOX_SIDEBAR_WIDTH),
    String(sized.y + 400),
  );
  await wait(800);

  await primePlayback(page);
  await wait(500);
  capture('Nightly', '01-firefox-sidepanel');

  // The sidebar document is not a Playwright page, so click its settings button by position.
  const settingsX = sized.x + FIREFOX_SIDEBAR_WIDTH - 58;
  const settingsY = sized.y + 147;
  os('click', String(settingsX), String(settingsY));
  await wait(600);
  capture('Nightly', '02-firefox-settings');
  os('click', String(settingsX), String(settingsY));

  toggleSidebar();
  await wait(500);
  await requestPage(page, 'popout');
  await waitForPopoutWindow('Nightly');
  capture('Nightly', '03-firefox-popout');
}

if (which === 'chrome' || which === 'all') await chromeShots();
if (which === 'firefox' || which === 'all') await firefoxShots();
console.log(`\nScreenshots written to ${outDir}`);
