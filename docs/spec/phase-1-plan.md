# Phase 1: Project Skeleton and Hello World -- Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Chrome extension that opens a side panel with "Quoth" header, with a content script on YouTube pages, fully tested with Vitest and Playwright, all commands via justfile, CI wired up.

**Architecture:** WXT framework scaffolds the extension with Svelte 5 for the side panel UI. Source lives in `src/` with `entrypoints/` for WXT-managed extension entry points and `core/` for pure logic. Hexagonal ports/adapters are stubbed but not implemented until Phase 2.

**Tech Stack:** WXT 0.20.x, Svelte 5, TypeScript, bun, Vitest, Playwright, ESLint + Prettier, just

**Spec reference:** `docs/spec/design.md` -- Phase 1 section

---

## File Map

### Created in this phase

```
quoth/
  CLAUDE.md                              # Build/test commands, project conventions
  LICENSE                                 # MIT license
  justfile                               # All build/test/dev recipes
  package.json                           # bun dependencies (created by WXT init, modified)
  wxt.config.ts                          # WXT framework config (created by WXT init, modified)
  tsconfig.json                          # TypeScript config (created by WXT init, modified)
  vitest.config.ts                       # Vitest with WxtVitest plugin
  playwright.config.ts                   # Playwright E2E config
  .eslintrc.cjs                          # ESLint config with Svelte plugin
  .prettierrc                            # Prettier config
  .github/
    workflows/
      ci.yml                             # Runs just check on push/PR

  src/
    entrypoints/
      sidepanel/
        index.html                       # Side panel HTML shell
        main.ts                          # Svelte app mount
        App.svelte                       # Root Svelte component
      content.ts                         # YouTube content script (detection only)
      background.ts                      # Service worker (empty message router)

    core/
      types.ts                           # TimedWord, TimedTranscript type stubs

  tests/
    unit/
      core/
        types.test.ts                    # Smoke test for type imports
      core/
        youtube.test.ts                  # YouTube URL detection logic
    e2e/
      sidepanel.test.ts                  # Side panel opens with expected content
```

### Modified from WXT scaffold

- `package.json` -- add dev dependencies, configure scripts
- `wxt.config.ts` -- set `srcDir`, configure Svelte, sidePanel manifest entries
- `tsconfig.json` -- adjust paths
- `.gitignore` -- add WXT/extension-specific ignores

---

## Task 1: Scaffold WXT Project

**Files:**
- Create: `package.json`, `wxt.config.ts`, `tsconfig.json` (via WXT init)
- Modify: `package.json` (adjust for bun), `wxt.config.ts` (set srcDir)

- [ ] **Step 1: Initialize WXT project with Svelte template**

```bash
cd /Users/tednaleid/Library/CloudStorage/Dropbox/code/quoth
bunx wxt@latest init . --template svelte
```

If prompted about overwriting, accept. This creates the base project structure including `package.json`, `wxt.config.ts`, `tsconfig.json`, and a default popup entrypoint.

- [ ] **Step 2: Install dependencies with bun**

```bash
bun install
```

- [ ] **Step 3: Configure WXT to use src/ directory**

Replace the entire `wxt.config.ts` with:

```typescript
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'Quoth',
    description: 'YouTube transcript viewer with client-side formatting',
    permissions: ['sidePanel', 'activeTab', 'storage', 'unlimitedStorage'],
    side_panel: {
      default_path: 'sidepanel/index.html',
    },
  },
});
```

- [ ] **Step 4: Move entrypoints to src/ directory**

```bash
mkdir -p src/entrypoints
# Move any scaffold-generated entrypoints into src/entrypoints/
# Remove the default popup entrypoint (we use sidepanel instead)
mv entrypoints/* src/entrypoints/ 2>/dev/null || true
rm -rf entrypoints
rm -rf src/entrypoints/popup 2>/dev/null || true
```

- [ ] **Step 5: Verify the project builds**

```bash
bunx wxt build
```

Expected: build succeeds (may warn about missing entrypoints, that's OK at this point).

- [ ] **Step 6: Commit scaffold**

```bash
git add -A
git commit -m "scaffold WXT project with Svelte 5 template"
```

---

## Task 2: Create Side Panel Entrypoint

**Files:**
- Create: `src/entrypoints/sidepanel/index.html`
- Create: `src/entrypoints/sidepanel/main.ts`
- Create: `src/entrypoints/sidepanel/App.svelte`

- [ ] **Step 1: Create side panel HTML shell**

Write `src/entrypoints/sidepanel/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Quoth</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Create Svelte mount script**

Write `src/entrypoints/sidepanel/main.ts`:

```typescript
import { mount } from 'svelte';
import App from './App.svelte';

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
```

- [ ] **Step 3: Create root Svelte component**

Write `src/entrypoints/sidepanel/App.svelte`:

```svelte
<script lang="ts">
  const title = 'Quoth';
</script>

<main>
  <header>
    <h1>{title}</h1>
  </header>
  <div class="transcript-placeholder">
    <p>Open a YouTube video to see its transcript.</p>
  </div>
  <footer class="status-bar">
    <span>Ready</span>
  </footer>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    height: 100vh;
    font-family: system-ui, -apple-system, sans-serif;
    color: #e0e0e0;
    background: #1a1a2e;
  }

  header {
    padding: 8px 12px;
    border-bottom: 1px solid #2a2a4a;
  }

  h1 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  .transcript-placeholder {
    flex: 1;
    padding: 12px;
    color: #888;
  }

  .status-bar {
    padding: 4px 12px;
    font-size: 11px;
    color: #666;
    border-top: 1px solid #2a2a4a;
  }
</style>
```

- [ ] **Step 4: Build and verify**

```bash
bunx wxt build
```

Expected: build succeeds with side panel entrypoint included in output.

- [ ] **Step 5: Commit**

```bash
git add src/entrypoints/sidepanel/
git commit -m "add side panel entrypoint with Svelte hello world"
```

---

## Task 3: Add Content Script and Background Service Worker

**Files:**
- Create: `src/entrypoints/content.ts`
- Create: `src/entrypoints/background.ts`

- [ ] **Step 1: Create YouTube content script**

Write `src/entrypoints/content.ts`:

```typescript
export default defineContentScript({
  matches: ['*://*.youtube.com/watch*'],
  main() {
    console.log('[quoth] Content script loaded on YouTube video page');
  },
});
```

WXT auto-imports `defineContentScript` -- no import statement needed.

- [ ] **Step 2: Create background service worker**

Write `src/entrypoints/background.ts`:

```typescript
export default defineBackground(() => {
  console.log('[quoth] Background service worker started');

  browser.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
    console.log('[quoth] Message received:', message);
    return false;
  });
});
```

WXT auto-imports `defineBackground` and `browser`.

- [ ] **Step 3: Build and verify all entrypoints present**

```bash
bunx wxt build
ls .output/chrome-mv3/
```

Expected: output contains `sidepanel/`, `content-scripts/`, `background.js` (or `service-worker.js`), and `manifest.json`.

- [ ] **Step 4: Verify manifest has correct permissions and content script matches**

```bash
cat .output/chrome-mv3/manifest.json | jq '.permissions, .content_scripts, .side_panel'
```

Expected: permissions include `sidePanel`, content scripts match `*://*.youtube.com/watch*`, side_panel has default_path.

- [ ] **Step 5: Commit**

```bash
git add src/entrypoints/content.ts src/entrypoints/background.ts
git commit -m "add YouTube content script and background service worker"
```

---

## Task 4: Create Core Type Stubs

**Files:**
- Create: `src/core/types.ts`

- [ ] **Step 1: Create type definitions**

Write `src/core/types.ts`:

```typescript
/**
 * ABOUTME: Core data types for transcript representation.
 * ABOUTME: Used across all layers of the application.
 */

export interface TimedWord {
  text: string;
  start: number;
  end: number;
  original: string;
}

export interface ParagraphBreak {
  wordIndex: number;
  startTime: number;
}

export interface Section {
  title: string;
  paragraphIndex: number;
  startTime: number;
}

export type FormattingTier = 0 | 1 | 2 | 3;

export interface TimedTranscript {
  videoId: string;
  words: TimedWord[];
  formattingTier: FormattingTier;
  paragraphs: ParagraphBreak[];
  sections: Section[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/types.ts
git commit -m "add core type definitions for transcript data model"
```

---

## Task 5: Set Up Vitest with WxtVitest Plugin

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/unit/core/types.test.ts`

- [ ] **Step 1: Install Vitest and testing dependencies**

```bash
bun add -d vitest @testing-library/svelte happy-dom
```

- [ ] **Step 2: Create Vitest configuration**

Write `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: 'happy-dom',
  },
});
```

- [ ] **Step 3: Write a smoke test for type imports**

Write `tests/unit/core/types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { TimedWord, TimedTranscript, FormattingTier } from '../../../src/core/types';

describe('core types', () => {
  it('should create a TimedWord', () => {
    const word: TimedWord = {
      text: 'hello',
      start: 0,
      end: 500,
      original: 'hello',
    };
    expect(word.text).toBe('hello');
    expect(word.start).toBe(0);
    expect(word.end).toBe(500);
  });

  it('should create a TimedTranscript at tier 0', () => {
    const transcript: TimedTranscript = {
      videoId: 'abc123',
      words: [],
      formattingTier: 0,
      paragraphs: [],
      sections: [],
    };
    expect(transcript.videoId).toBe('abc123');
    expect(transcript.formattingTier).toBe(0);
  });

  it('should enforce formatting tier values', () => {
    const tiers: FormattingTier[] = [0, 1, 2, 3];
    expect(tiers).toHaveLength(4);
  });
});
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
bunx vitest run
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts tests/
git commit -m "set up Vitest with WxtVitest plugin and first unit tests"
```

---

## Task 6: Add YouTube URL Detection Logic and Test

**Files:**
- Create: `src/core/youtube.ts`
- Create: `tests/unit/core/youtube.test.ts`
- Modify: `src/entrypoints/content.ts`

- [ ] **Step 1: Write the failing test**

Write `tests/unit/core/youtube.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { extractVideoId } from '../../../src/core/youtube';

describe('extractVideoId', () => {
  it('should extract video ID from standard YouTube URL', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=YwZR6tc7qYg'))
      .toBe('YwZR6tc7qYg');
  });

  it('should extract video ID when other params present', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=abc123&t=120'))
      .toBe('abc123');
  });

  it('should extract video ID from youtube.com without www', () => {
    expect(extractVideoId('https://youtube.com/watch?v=abc123'))
      .toBe('abc123');
  });

  it('should return null for non-YouTube URLs', () => {
    expect(extractVideoId('https://www.example.com/watch?v=abc123'))
      .toBeNull();
  });

  it('should return null for YouTube URLs without video ID', () => {
    expect(extractVideoId('https://www.youtube.com/'))
      .toBeNull();
  });

  it('should return null for YouTube channel pages', () => {
    expect(extractVideoId('https://www.youtube.com/channel/UCxyz'))
      .toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bunx vitest run tests/unit/core/youtube.test.ts
```

Expected: FAIL -- `extractVideoId` is not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

Write `src/core/youtube.ts`:

```typescript
/**
 * ABOUTME: YouTube URL parsing utilities.
 * ABOUTME: Extracts video IDs from YouTube watch page URLs.
 */

export function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const isYouTube = parsed.hostname === 'www.youtube.com'
      || parsed.hostname === 'youtube.com';

    if (!isYouTube) return null;
    if (!parsed.pathname.startsWith('/watch')) return null;

    return parsed.searchParams.get('v') ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
bunx vitest run tests/unit/core/youtube.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Update content script to use extractVideoId**

Modify `src/entrypoints/content.ts`:

```typescript
import { extractVideoId } from '../core/youtube';

export default defineContentScript({
  matches: ['*://*.youtube.com/watch*'],
  main() {
    const videoId = extractVideoId(window.location.href);
    console.log('[quoth] Content script loaded. Video ID:', videoId);
  },
});
```

- [ ] **Step 6: Verify build still works**

```bash
bunx wxt build
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/core/youtube.ts tests/unit/core/youtube.test.ts src/entrypoints/content.ts
git commit -m "add YouTube URL video ID extraction with tests"
```

---

## Task 7: Justfile with Core Recipes

**Files:**
- Create: `justfile`

- [ ] **Step 1: Create justfile with all recipes**

Write `justfile`:

```just
# ABOUTME: Build, test, and development commands for the Quoth browser extension.
# ABOUTME: All commands should be run through these recipes, not directly via bun/npx.

# Default recipe: show available commands
default:
    @just --list

# Run all checks: tests, linting, typecheck, format check
check: test lint typecheck fmt-check

# Run unit tests
test:
    bunx vitest run

# Run unit tests in watch mode
test-watch:
    bunx vitest

# Run E2E tests (requires built extension)
test-e2e: build
    bunx playwright test

# Run linter
lint:
    bunx eslint src/ tests/

# Run formatter
fmt:
    bunx prettier --write "src/**/*.{ts,svelte,html,css}" "tests/**/*.ts"

# Check formatting without modifying files
fmt-check:
    bunx prettier --check "src/**/*.{ts,svelte,html,css}" "tests/**/*.ts"

# Run TypeScript type checking
typecheck:
    bunx wxt prepare && bunx tsc --noEmit

# Build the extension for Chrome
build:
    bunx wxt build

# Build the extension for Firefox (future)
build-firefox:
    bunx wxt build --browser firefox

# Start dev mode with HMR
dev:
    bunx wxt

# Clean build artifacts and caches
clean:
    rm -rf .output .wxt node_modules/.vite

# Install git pre-commit hook
install-hooks:
    @echo '#!/bin/sh' > .git/hooks/pre-commit
    @echo 'just check' >> .git/hooks/pre-commit
    @chmod +x .git/hooks/pre-commit
    @echo "Pre-commit hook installed."

# Run model comparison harness (Phase 4+)
model-bench *ARGS:
    @echo "Model bench not yet implemented (Phase 4)"

# Capture YouTube page fixture for testing (Phase 2+)
fixture-capture URL:
    @echo "Fixture capture not yet implemented (Phase 2)"

# Bump version, generate release notes, tag, and push (Phase 6+)
bump VERSION:
    @echo "Bump not yet implemented (Phase 6)"

# Re-trigger release workflow for existing version (Phase 6+)
retag VERSION:
    @echo "Retag not yet implemented (Phase 6)"
```

- [ ] **Step 2: Verify `just test` works**

```bash
just test
```

Expected: all unit tests pass.

- [ ] **Step 3: Verify `just build` works**

```bash
just build
```

Expected: extension builds to `.output/chrome-mv3/`.

- [ ] **Step 4: Commit**

```bash
git add justfile
git commit -m "add justfile with build, test, dev, and check recipes"
```

---

## Task 8: ESLint + Prettier Configuration

**Files:**
- Create: `.eslintrc.cjs`
- Create: `.prettierrc`
- Modify: `package.json` (add dev dependencies)

- [ ] **Step 1: Install ESLint and Prettier with Svelte support**

```bash
bun add -d eslint @eslint/js typescript-eslint eslint-plugin-svelte prettier prettier-plugin-svelte svelte-eslint-parser
```

- [ ] **Step 2: Create ESLint configuration**

Write `.eslintrc.cjs`:

```javascript
/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:svelte/recommended',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  parserOptions: {
    extraFileExtensions: ['.svelte'],
  },
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  overrides: [
    {
      files: ['*.svelte'],
      parser: 'svelte-eslint-parser',
      parserOptions: {
        parser: '@typescript-eslint/parser',
      },
    },
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
  ignorePatterns: ['.output/', '.wxt/', 'node_modules/'],
};
```

- [ ] **Step 3: Create Prettier configuration**

Write `.prettierrc`:

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "plugins": ["prettier-plugin-svelte"],
  "overrides": [
    {
      "files": "*.svelte",
      "options": {
        "parser": "svelte"
      }
    }
  ]
}
```

- [ ] **Step 4: Run linter and fix any issues**

```bash
just lint
```

Fix any lint errors in existing files. Common issues: unused variables, missing types.

- [ ] **Step 5: Run formatter**

```bash
just fmt
```

- [ ] **Step 6: Verify `just fmt-check` passes**

```bash
just fmt-check
```

Expected: no formatting issues.

- [ ] **Step 7: Verify `just check` runs all checks**

```bash
just check
```

Expected: tests pass, lint passes, typecheck passes, format check passes.

- [ ] **Step 8: Commit**

```bash
git add .eslintrc.cjs .prettierrc package.json bun.lockb
git add -u  # pick up any reformatted files
git commit -m "configure ESLint + Prettier with Svelte support"
```

---

## Task 9: Playwright E2E Setup and First Test

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/sidepanel.test.ts`

- [ ] **Step 1: Install Playwright**

```bash
bun add -d @playwright/test
bunx playwright install chromium
```

- [ ] **Step 2: Create Playwright configuration for extension testing**

Write `playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';
import path from 'path';

const extensionPath = path.resolve('.output/chrome-mv3');

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  use: {
    headless: false,
  },
  projects: [
    {
      name: 'chromium-extension',
      use: {
        browserName: 'chromium',
        launchOptions: {
          args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
          ],
        },
      },
    },
  ],
});
```

Note: Playwright extension testing requires `headless: false` or the newer headless mode. We set `headless: false` here. Check if `headless: 'shell'` works during Phase 1 verification -- if so, switch to that for CI.

- [ ] **Step 3: Write the failing E2E test**

Write `tests/e2e/sidepanel.test.ts`:

```typescript
import { test, expect, type BrowserContext } from '@playwright/test';
import path from 'path';

const extensionPath = path.resolve('.output/chrome-mv3');

test.describe('Side Panel', () => {
  let context: BrowserContext;
  let extensionId: string;

  test.beforeAll(async ({ }, testInfo) => {
    // Launch browser with extension
    const browserType = testInfo.project.use.browserName === 'chromium'
      ? (await import('@playwright/test')).chromium
      : undefined;

    if (!browserType) throw new Error('Only Chromium is supported for extension testing');

    context = await browserType.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    // Get extension ID from the service worker
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker');
    }
    extensionId = background.url().split('/')[2];
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('side panel page renders with expected content', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel/index.html`);

    await expect(page.locator('h1')).toHaveText('Quoth');
    await expect(page.locator('.status-bar')).toContainText('Ready');
    await expect(page.locator('.transcript-placeholder')).toContainText(
      'Open a YouTube video to see its transcript.'
    );

    await page.close();
  });
});
```

- [ ] **Step 4: Build the extension first, then run E2E test**

```bash
just build
bunx playwright test
```

Expected: 1 test passes. The side panel page loads and shows "Quoth" header, "Ready" status, and placeholder text.

- [ ] **Step 5: Update just test-e2e recipe if command differs**

If the Playwright command needed adjustment (e.g., different config path), update the `test-e2e` recipe in the justfile.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts tests/e2e/
git commit -m "set up Playwright E2E testing with first side panel test"
```

---

## Task 10: CI Workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create CI workflow**

Write `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - uses: taiki-e/install-action@v2
        with:
          tool: just

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Run all checks
        run: just check

  e2e:
    runs-on: ubuntu-latest
    needs: check
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - uses: taiki-e/install-action@v2
        with:
          tool: just

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Install Playwright browsers
        run: bunx playwright install --with-deps chromium

      - name: Build extension
        run: just build

      - name: Run E2E tests
        run: just test-e2e
```

Note: E2E tests may need `xvfb-run` on Linux CI if headless mode doesn't work with extensions. If so, change the last step to:

```yaml
      - name: Run E2E tests
        run: xvfb-run just test-e2e
```

- [ ] **Step 2: Commit**

```bash
git add .github/
git commit -m "add CI workflow running just check and E2E tests"
```

---

## Task 11: Pre-commit Hook

- [ ] **Step 1: Install the pre-commit hook**

```bash
just install-hooks
```

Expected: prints "Pre-commit hook installed."

- [ ] **Step 2: Verify hook runs on commit**

Make a trivial change (e.g., add a blank line to a test file), stage it, and commit. The hook should run `just check` before allowing the commit.

```bash
echo "" >> tests/unit/core/types.test.ts
git add tests/unit/core/types.test.ts
git commit -m "test: verify pre-commit hook"
```

Expected: `just check` runs. If it passes, commit succeeds. If formatting changed the file, the hook will fail -- fix with `just fmt`, re-stage, re-commit.

- [ ] **Step 3: Commit (if the test commit didn't already)**

If the verification commit above went through, revert the trivial change:

```bash
git revert HEAD --no-edit
```

---

## Task 12: Project Documentation

**Files:**
- Create: `CLAUDE.md`
- Create: `LICENSE`
- Modify: `.gitignore`

- [ ] **Step 1: Create CLAUDE.md**

Write `CLAUDE.md`:

```markdown
# Quoth

YouTube transcript viewer browser extension with client-side ML formatting.

## Build and Test

- `just check` -- run all tests, linting, type checking, and format checking (used by CI)
- `just test` -- run unit tests only
- `just test-e2e` -- run Playwright E2E tests (builds extension first)
- `just lint` -- run ESLint
- `just fmt` -- format code with Prettier
- `just typecheck` -- run TypeScript type checker
- `just build` -- build Chrome extension to .output/chrome-mv3/
- `just dev` -- start dev mode with HMR
- `just clean` -- remove build artifacts and caches
- `just install-hooks` -- install pre-commit hook that runs `just check`

Red/green testing: write a failing test before implementing, then make it pass.
All commits should pass `just check`.

## Architecture

Hexagonal (ports and adapters). See `docs/spec/design.md` for full spec.

- `src/core/` -- pure logic, no browser API imports
- `src/ports/` -- TypeScript interfaces (Phase 2+)
- `src/adapters/` -- adapter implementations (Phase 2+)
- `src/entrypoints/` -- WXT extension entry points
- `tests/unit/` -- Vitest unit tests
- `tests/e2e/` -- Playwright E2E tests

## Extension entry points

- `src/entrypoints/sidepanel/` -- Svelte 5 side panel UI
- `src/entrypoints/content.ts` -- YouTube content script
- `src/entrypoints/background.ts` -- Service worker message router
```

- [ ] **Step 2: Create MIT LICENSE**

Write `LICENSE`:

```
MIT License

Copyright (c) 2026 Ted Naleid

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 3: Update .gitignore**

Ensure `.gitignore` includes:

```
node_modules/
.output/
.wxt/
.superpowers/
*.log
dist/

# Playwright
test-results/
playwright-report/
.playwright-cli/
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md LICENSE .gitignore
git commit -m "add CLAUDE.md, MIT license, and updated gitignore"
```

---

## Task 13: Verify playwright-cli Works with Extension

- [ ] **Step 1: Build the extension**

```bash
just build
```

- [ ] **Step 2: Open Chrome with the extension using playwright-cli**

```bash
playwright-cli open --browser=chrome
```

If this opens a plain Chrome window, try loading the extension manually by navigating to `chrome://extensions`, enabling Developer mode, and loading the `.output/chrome-mv3/` directory. If `playwright-cli` supports launch args for extensions, use:

```bash
playwright-cli open --browser=chrome --launch-arg="--load-extension=.output/chrome-mv3"
```

Document whichever approach works in CLAUDE.md.

- [ ] **Step 3: Navigate to a YouTube video**

```bash
playwright-cli goto https://www.youtube.com/watch?v=YwZR6tc7qYg
```

- [ ] **Step 4: Take a snapshot to verify content script loaded**

```bash
playwright-cli console
```

Expected: should see `[quoth] Content script loaded. Video ID: YwZR6tc7qYg` in the console output.

- [ ] **Step 5: Verify side panel is accessible**

If the extension loaded successfully, try opening the side panel via the extension icon or navigate directly:

```bash
playwright-cli snapshot
```

Document the results and any workarounds needed in CLAUDE.md under a "playwright-cli" section.

- [ ] **Step 6: Close browser and commit any doc updates**

```bash
playwright-cli close
git add CLAUDE.md
git commit -m "document playwright-cli extension debugging workflow"
```

---

## Task 14: Final Verification

- [ ] **Step 1: Clean build from scratch**

```bash
just clean
bun install
just check
```

Expected: all checks pass (tests, lint, typecheck, format).

- [ ] **Step 2: Run E2E tests**

```bash
just test-e2e
```

Expected: E2E test passes.

- [ ] **Step 3: Manual smoke test with `just dev`**

```bash
just dev
```

This opens Chrome with the extension in dev mode. Verify:
1. Extension icon appears in the toolbar
2. Clicking it opens the side panel with "Quoth" header
3. Navigate to a YouTube video -- check the browser console for `[quoth] Content script loaded`
4. Side panel shows "Open a YouTube video to see its transcript."

Close the dev browser when done.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -u
git commit -m "phase 1 complete: project skeleton with testing infrastructure"
```
