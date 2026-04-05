# Firefox Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Firefox the primary development and build target with a SidebarHost port for cross-browser sidebar behavior.

**Architecture:** SidebarHost port with Chrome/Firefox adapters selected at build time via WXT's `import.meta.env.BROWSER`. Firefox-first justfile defaults. Tab-mode Firefox smoke test.

**Tech Stack:** WXT, Svelte 5, TypeScript, Playwright, Vitest

**Spec reference:** `docs/spec/firefox-support.md`

---

## Context

Quoth is a Chrome browser extension (WXT + Svelte 5 + TypeScript) that displays YouTube transcripts in a side panel. The hexagonal architecture refactoring is complete -- pure core logic, thin adapters, 87 tests.

The only runtime API difference between Chrome and Firefox is how the sidebar opens on icon click:
- Chrome: `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`
- Firefox: `browser.browserAction.onClicked` -> `browser.sidebarAction.toggle()`

WXT handles all manifest differences automatically (`side_panel` -> `sidebar_action`, permissions, background script type).

### Convention note for implementers

All source files in this project use a 2-line `ABOUTME:` comment header. Every new file must include this. Example:
```typescript
/**
 * ABOUTME: Port interface for browser sidebar/side panel lifecycle.
 * ABOUTME: Implementations: ChromeSidebarHost (sidePanel API), FirefoxSidebarHost (sidebarAction API).
 */
```

### Commands

All commands go through the justfile. Never run bare `bunx`/`bun run`/`npx`:
- `just check` -- run all checks (test + lint + typecheck + fmt-check)
- `just test [pattern]` -- run unit tests (e.g., `just test sidebar`)
- `just lint [files]` -- run linter
- `just typecheck [flags]` -- prepare WXT types + tsc --noEmit
- `just fmt [files]` -- format code
- `just build` -- build extension (currently Chrome, will become Firefox after Task 5)
- `just smoke-test` -- Chromium extension-loading smoke test

---

## File Map

### New files

```
src/
  ports/
    sidebar-host.ts                    # SidebarHost interface
  adapters/
    chrome/
      sidebar-host.ts                  # Chrome sidePanel adapter
    firefox/
      sidebar-host.ts                  # Firefox sidebarAction adapter
    sidebar-host-factory.ts            # Returns correct adapter based on browser string

tests/
  unit/
    adapters/
      sidebar-host-factory.test.ts     # Factory returns correct adapter per browser

tools/
  smoke-test-firefox.ts                # Firefox tab-mode Playwright test
```

### Modified files

```
src/
  entrypoints/
    background.ts                      # Use SidebarHost factory instead of inline chrome.sidePanel

wxt.config.ts                          # Add gecko.id, browser_specific_settings
justfile                               # Firefox-first dev/build defaults, new smoke-test-firefox recipe
```

---

## Task 1: SidebarHost Port and Chrome Adapter

Extract the existing Chrome-specific sidebar code from background.ts into the hexagonal pattern. After this task, Chrome still works exactly as before, just through the port.

**Files:**
- Create: `src/ports/sidebar-host.ts`
- Create: `src/adapters/chrome/sidebar-host.ts`
- Create: `src/adapters/sidebar-host-factory.ts`
- Create: `tests/unit/adapters/sidebar-host-factory.test.ts`
- Modify: `src/entrypoints/background.ts`

- [ ] **Step 1: Write failing test for the factory**

```typescript
// tests/unit/adapters/sidebar-host-factory.test.ts
/**
 * ABOUTME: Tests for SidebarHost factory.
 * ABOUTME: Verifies correct adapter is returned based on browser target string.
 */
import { describe, it, expect } from 'vitest';
import { createSidebarHost } from '../../../src/adapters/sidebar-host-factory';
import { ChromeSidebarHost } from '../../../src/adapters/chrome/sidebar-host';

describe('createSidebarHost', () => {
  it('returns ChromeSidebarHost for "chrome" browser', () => {
    const host = createSidebarHost('chrome');
    expect(host).toBeInstanceOf(ChromeSidebarHost);
  });

  it('returns ChromeSidebarHost as default for unknown browser', () => {
    const host = createSidebarHost('unknown');
    expect(host).toBeInstanceOf(ChromeSidebarHost);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `just test sidebar-host-factory`
Expected: FAIL (modules don't exist yet)

- [ ] **Step 3: Create the port interface**

```typescript
// src/ports/sidebar-host.ts
/**
 * ABOUTME: Port interface for browser sidebar/side panel lifecycle.
 * ABOUTME: Implementations: ChromeSidebarHost (sidePanel API), FirefoxSidebarHost (sidebarAction API).
 */

export interface SidebarHost {
  initialize(): void;
}
```

- [ ] **Step 4: Create the Chrome adapter**

```typescript
// src/adapters/chrome/sidebar-host.ts
/**
 * ABOUTME: Chrome sidePanel adapter -- opens side panel when extension icon is clicked.
 * ABOUTME: Uses chrome.sidePanel.setPanelBehavior (Chrome 114+, MV3 only).
 */
import type { SidebarHost } from '../../ports/sidebar-host';

export class ChromeSidebarHost implements SidebarHost {
  initialize(): void {
    // @ts-expect-error -- chrome.sidePanel not in WXT's browser types yet
    globalThis.chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
}
```

- [ ] **Step 5: Create the factory**

```typescript
// src/adapters/sidebar-host-factory.ts
/**
 * ABOUTME: Factory that returns the correct SidebarHost adapter for the target browser.
 * ABOUTME: Called from background.ts with import.meta.env.BROWSER at build time.
 */
import type { SidebarHost } from '../ports/sidebar-host';
import { ChromeSidebarHost } from './chrome/sidebar-host';

export function createSidebarHost(browser: string): SidebarHost {
  if (browser === 'firefox') {
    // Dynamic import not needed -- WXT tree-shakes at build time.
    // For now, Firefox adapter not yet created; fall through to Chrome.
    // Task 2 adds the Firefox branch.
    return new ChromeSidebarHost();
  }
  return new ChromeSidebarHost();
}
```

- [ ] **Step 6: Run test, verify it passes**

Run: `just test sidebar-host-factory`
Expected: PASS

- [ ] **Step 7: Update background.ts to use the factory**

Replace the current background.ts:

```typescript
// src/entrypoints/background.ts
import { createSidebarHost } from '../adapters/sidebar-host-factory';

export default defineBackground(() => {
  console.log('[quoth] Background service worker started');

  const sidebarHost = createSidebarHost(import.meta.env.BROWSER);
  sidebarHost.initialize();

  // Track the most recent tab with a content script
  let contentScriptTabId: number | null = null;

  // Route messages between content script and side panel
  browser.runtime.onMessage.addListener((message, sender) => {
    const msgType = (message as { type?: string })?.type ?? 'unknown';

    if (sender.tab?.id) {
      // Message from content script -- remember its tab and forward to side panel
      contentScriptTabId = sender.tab.id;
      console.log(`[quoth-bg] from content (tab ${sender.tab.id}): ${msgType}`);
      browser.runtime.sendMessage(message).catch(() => {
        // Side panel may not be open
      });
    } else {
      // Message from side panel -- forward to the content script's tab
      console.log(`[quoth-bg] from sidepanel: ${msgType}, forwarding to tab ${contentScriptTabId}`);
      if (contentScriptTabId) {
        browser.tabs.sendMessage(contentScriptTabId, message).catch((err) => {
          console.log(`[quoth-bg] forward failed: ${err}`);
        });
      } else {
        console.log('[quoth-bg] no content script tab known');
      }
    }
    return false;
  });
});
```

- [ ] **Step 8: Run `just check`**

All 87+ tests should pass, lint/typecheck/format clean.

- [ ] **Step 9: Commit**

---

## Task 2: Firefox SidebarHost Adapter

Create the Firefox adapter and wire it into the factory.

**Files:**
- Create: `src/adapters/firefox/sidebar-host.ts`
- Modify: `src/adapters/sidebar-host-factory.ts`
- Modify: `tests/unit/adapters/sidebar-host-factory.test.ts`

- [ ] **Step 1: Add failing test for Firefox adapter in factory**

Add to the existing test file:

```typescript
import { FirefoxSidebarHost } from '../../../src/adapters/firefox/sidebar-host';

it('returns FirefoxSidebarHost for "firefox" browser', () => {
  const host = createSidebarHost('firefox');
  expect(host).toBeInstanceOf(FirefoxSidebarHost);
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `just test sidebar-host-factory`
Expected: FAIL (FirefoxSidebarHost doesn't exist)

- [ ] **Step 3: Create the Firefox adapter**

```typescript
// src/adapters/firefox/sidebar-host.ts
/**
 * ABOUTME: Firefox sidebarAction adapter -- toggles sidebar when extension icon is clicked.
 * ABOUTME: Uses browser.sidebarAction.toggle() (Firefox 109+, MV2 and MV3).
 */
import type { SidebarHost } from '../../ports/sidebar-host';

export class FirefoxSidebarHost implements SidebarHost {
  initialize(): void {
    browser.browserAction.onClicked.addListener(() => {
      // @ts-expect-error -- sidebarAction not in WXT's browser types yet
      browser.sidebarAction.toggle();
    });
  }
}
```

- [ ] **Step 4: Update the factory to return FirefoxSidebarHost**

```typescript
// src/adapters/sidebar-host-factory.ts
/**
 * ABOUTME: Factory that returns the correct SidebarHost adapter for the target browser.
 * ABOUTME: Called from background.ts with import.meta.env.BROWSER at build time.
 */
import type { SidebarHost } from '../ports/sidebar-host';
import { ChromeSidebarHost } from './chrome/sidebar-host';
import { FirefoxSidebarHost } from './firefox/sidebar-host';

export function createSidebarHost(browser: string): SidebarHost {
  if (browser === 'firefox') {
    return new FirefoxSidebarHost();
  }
  return new ChromeSidebarHost();
}
```

- [ ] **Step 5: Run test, verify it passes**

Run: `just test sidebar-host-factory`
Expected: PASS (all 3 factory tests)

- [ ] **Step 6: Run `just check`**
- [ ] **Step 7: Commit**

---

## Task 3: WXT Configuration for Firefox

Add Firefox-specific manifest settings so `just build-firefox` produces a valid, installable extension.

**Files:**
- Modify: `wxt.config.ts`

- [ ] **Step 1: Update wxt.config.ts**

```typescript
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'Quoth',
    description: 'YouTube transcript viewer with client-side formatting',
    permissions: ['sidePanel', 'activeTab', 'tabs', 'storage', 'unlimitedStorage'],
    host_permissions: ['*://*.youtube.com/*'],
    side_panel: {
      default_path: 'sidepanel/index.html',
    },
    browser_specific_settings: {
      gecko: {
        id: 'quoth@tednaleid.com',
        strict_min_version: '109.0',
      },
    },
  },
});
```

WXT auto-handles: `side_panel` -> `sidebar_action` for Firefox, strips `sidePanel` permission, converts `host_permissions`.

The Firefox sidebar options (`open_at_install: false`, `default_title: 'Quoth'`) are set by WXT from the sidepanel entrypoint. WXT reads these from the sidepanel's `index.html` meta tags or from the entrypoint definition. Since the WXT manifest generation code already reads `defaultSidepanel.options.openAtInstall` and `defaultSidepanel.options.defaultTitle`, we may need to add these as WXT entrypoint options. If WXT doesn't support setting these via the config, the `browser_specific_settings` or a manual manifest override in `wxt.config.ts` is the fallback. Verify during implementation.

- [ ] **Step 2: Verify Chrome build still works**

Run: `just build chrome`
(Note: `build chrome` won't work yet -- justfile update is Task 4. Use `bunx wxt build` directly for this one-time verification.)

Actually, use the current `just build` which still targets Chrome:

Run: `just build`
Expected: Build succeeds, `.output/chrome-mv3/` is produced.

- [ ] **Step 3: Verify Firefox build works**

Run: `just build-firefox`
Expected: Build succeeds, `.output/firefox-mv3/` (or `.output/firefox-mv2/`) is produced.

- [ ] **Step 4: Inspect the Firefox manifest**

Run: `cat .output/firefox-mv*/manifest.json | jq '{sidebar_action, permissions, browser_specific_settings}'`

Expected: `sidebar_action` key present with `default_panel` pointing to the sidepanel HTML. No `sidePanel` in permissions. `browser_specific_settings.gecko.id` is `quoth@tednaleid.com`.

- [ ] **Step 5: Run `just check`**
- [ ] **Step 6: Commit**

---

## Task 4: Justfile Firefox-First Defaults

Update the justfile so Firefox is the default for `dev` and `build`, with Chrome available as an explicit option.

**Files:**
- Modify: `justfile`

- [ ] **Step 1: Update justfile**

Replace the `build`, `build-firefox`, and `dev` recipes. Add `smoke-test-firefox`:

```just
# Build the extension (default: firefox, or specify: just build chrome)
build BROWSER="firefox":
    bunx wxt build --browser {{BROWSER}}

# Start dev mode with HMR (default: firefox, or specify: just dev chrome)
dev BROWSER="firefox":
    bunx wxt --browser {{BROWSER}}

# Smoke test: load Chrome extension and navigate to YouTube (Chromium only -- Playwright can't load Firefox extensions)
smoke-test *URL:
    just build chrome
    bun run tools/smoke-test.ts {{URL}}

# Firefox tab-mode smoke test: verify side panel renders in Gecko engine
smoke-test-firefox:
    just build
    bun run tools/smoke-test-firefox.ts
```

Remove the old `build-firefox` recipe (now covered by `just build` which defaults to Firefox).

- [ ] **Step 2: Verify `just build` defaults to Firefox**

Run: `just build`
Expected: `.output/firefox-mv3/` (or `firefox-mv2`) produced.

- [ ] **Step 3: Verify `just build chrome` still works**

Run: `just build chrome`
Expected: `.output/chrome-mv3/` produced.

- [ ] **Step 4: Run `just check`**
- [ ] **Step 5: Commit**

---

## Task 5: Firefox Tab-Mode Smoke Test

Create a Playwright test that opens the side panel HTML in Firefox to verify Gecko rendering compatibility.

**Files:**
- Create: `tools/smoke-test-firefox.ts`

- [ ] **Step 1: Create the Firefox smoke test**

```typescript
#!/usr/bin/env -S bun run
/**
 * ABOUTME: Firefox tab-mode smoke test -- verifies side panel renders in Gecko engine.
 * ABOUTME: Opens sidepanel.html as a local file in Playwright Firefox. Does not load the extension.
 */

import { firefox } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

// Find the built sidepanel HTML in the Firefox build output
const outputDirs = ['.output/firefox-mv3', '.output/firefox-mv2'];
let sidepanelPath: string | null = null;

for (const dir of outputDirs) {
  const candidate = path.resolve(dir, 'sidepanel.html');
  const file = Bun.file(candidate);
  if (await file.exists()) {
    sidepanelPath = candidate;
    break;
  }
}

if (!sidepanelPath) {
  console.error('No Firefox build output found. Run `just build` first.');
  process.exit(1);
}

console.log('Launching Firefox...');
const browser = await firefox.launch({ headless: true });
const page = await browser.newPage();

// Open the sidepanel HTML as a file URL
const fileUrl = `file://${sidepanelPath}`;
console.log(`Opening: ${fileUrl}`);

// Collect any JS errors
const errors: string[] = [];
page.on('pageerror', (err) => errors.push(err.message));

await page.goto(fileUrl, { waitUntil: 'load', timeout: 15000 });
await page.waitForTimeout(2000);

// Verify basic rendering
const appDiv = await page.locator('#app').count();
if (appDiv === 0) {
  console.log('FIREFOX SMOKE TEST FAILED: #app element not found');
  await browser.close();
  process.exit(1);
}

// Check that the Svelte app mounted (look for the main element)
const mainEl = await page.locator('main').count();
if (mainEl === 0) {
  console.log('FIREFOX SMOKE TEST FAILED: Svelte app did not mount (<main> not found)');
  await browser.close();
  process.exit(1);
}

// Check initial state renders (the placeholder text)
const placeholderText = await page.locator('.placeholder p').textContent().catch(() => null);
console.log(`Placeholder text: ${placeholderText ?? '(not found)'}`);

// Check for header component
const headerExists = (await page.locator('header, [class*="header"]').count()) > 0;
console.log(`Header rendered: ${headerExists}`);

// Check for status bar
const statusBar = await page.locator('.status-bar').count();
console.log(`Status bar rendered: ${statusBar > 0}`);

// Report JS errors (some are expected -- browser.* APIs not available outside extension context)
if (errors.length > 0) {
  console.log(`\nJS errors (expected for non-extension context):`);
  errors.forEach((e) => console.log(`  - ${e}`));
}

// The test passes if the Svelte app mounts and renders without crashing
console.log('\nFIREFOX SMOKE TEST PASSED: Side panel renders in Gecko');
await browser.close();
```

- [ ] **Step 2: Verify the test runs**

Run: `just smoke-test-firefox`
Expected: Firefox launches headlessly, opens the built sidepanel.html, verifies rendering, exits with success.

Note: Some JS errors about `browser.*` not being defined are expected -- the side panel is running outside the extension context. The test verifies that the Svelte app mounts and the HTML/CSS renders correctly in Gecko. If the Svelte app fails to mount entirely (import errors, syntax incompatibilities), the test will catch it.

- [ ] **Step 3: Run `just check`**
- [ ] **Step 4: Commit**

---

## Task 6: Final Verification

- [ ] **Step 1: Clean build and full check**

Run: `just clean && bun install && just check`
Expected: All tests pass, lint/typecheck/format clean.

- [ ] **Step 2: Firefox build and manifest inspection**

Run: `just build && cat .output/firefox-mv*/manifest.json | jq .`
Expected: Valid Firefox manifest with `sidebar_action`, `browser_specific_settings.gecko`, no `sidePanel` permission.

- [ ] **Step 3: Chrome build**

Run: `just build chrome`
Expected: Valid Chrome build in `.output/chrome-mv3/`.

- [ ] **Step 4: Chromium smoke test**

Run: `just smoke-test`
Expected: Extension loads, transcript loads, click-to-seek works. (Requires real YouTube access.)

- [ ] **Step 5: Firefox tab-mode smoke test**

Run: `just smoke-test-firefox`
Expected: Side panel renders in Gecko engine.

- [ ] **Step 6: Commit final state**

---

## Verification

After this implementation:
- `just check` passes (87+ tests, all clean)
- `just build` produces a valid Firefox extension
- `just build chrome` produces a valid Chrome extension
- `just smoke-test` proves Chrome extension wiring still works
- `just smoke-test-firefox` proves side panel renders in Gecko
- `just dev` launches Firefox dev mode
- `just dev chrome` launches Chrome dev mode
- `src/ports/sidebar-host.ts` defines the SidebarHost interface
- `src/adapters/chrome/sidebar-host.ts` and `src/adapters/firefox/sidebar-host.ts` implement it
- `background.ts` is thin wiring using the factory
- No browser-specific code outside `src/adapters/`
