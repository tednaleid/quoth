# Firefox Support

**Goal:** Make Firefox the primary development and build target, with Chrome as a secondary supported browser.

**Architecture:** SidebarHost port with Chrome and Firefox adapters, selected at build time via WXT's browser target. Firefox-first justfile defaults.

---

## Context

Quoth is a YouTube transcript viewer browser extension built with WXT + Svelte 5 + TypeScript. Chrome support is complete (Phases 1-2). The hexagonal architecture refactoring is done -- pure core, thin adapters, 87 tests.

Firefox is the primary target browser. The extension should work identically in both browsers. The sidebar/side panel API is the only runtime difference -- everything else (content scripts, messaging, core logic) is cross-browser via WXT's `browser.*` API.

---

## What WXT Handles Automatically

WXT's manifest generation handles the bulk of cross-browser differences:

- `side_panel` (Chrome) -> `sidebar_action` (Firefox) manifest key conversion
- `sidePanel` permission added for Chrome, stripped for Firefox
- `host_permissions` handling per browser
- Background script: service worker (Chrome MV3) vs event page (Firefox MV3)
- `browser_style` stripping for Firefox MV3

No changes needed for content scripts, messaging, or the side panel HTML/JS itself.

---

## SidebarHost Port and Adapters

### Port interface

`src/ports/sidebar-host.ts`:
```typescript
export interface SidebarHost {
  initialize(): void;
}
```

Minimal interface covering the only runtime API difference: how the sidebar opens when the user clicks the extension icon.

### Chrome adapter

`src/adapters/chrome/sidebar-host.ts`:
```typescript
export class ChromeSidebarHost implements SidebarHost {
  initialize(): void {
    // @ts-expect-error -- chrome.sidePanel not in WXT types yet
    globalThis.chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
}
```

### Firefox adapter

`src/adapters/firefox/sidebar-host.ts`:
```typescript
export class FirefoxSidebarHost implements SidebarHost {
  initialize(): void {
    browser.browserAction.onClicked.addListener(() => {
      // @ts-expect-error -- sidebarAction not in WXT types yet
      browser.sidebarAction.toggle();
    });
  }
}
```

### Factory

`src/adapters/sidebar-host-factory.ts`:

Uses `import.meta.env.BROWSER` (set by WXT at build time) to return the correct adapter. WXT tree-shakes the unused adapter out of the bundle.

### Background.ts

Becomes thin wiring:
```typescript
const sidebarHost = createSidebarHost();
sidebarHost.initialize();
// ... existing message routing unchanged
```

---

## WXT Configuration

Add Firefox-specific settings to `wxt.config.ts`:

```typescript
manifest: {
  // ... existing config
  browser_specific_settings: {
    gecko: {
      id: 'quoth@tednaleid.com',
      strict_min_version: '109.0',  // first Firefox MV3 release
    },
  },
},
```

Sidebar options (via manifest override or sidepanel entrypoint options):
- `open_at_install: false`
- `default_title: 'Quoth'`

---

## Dev Workflow

Firefox-first defaults across all justfile commands:

| Command | Behavior |
|---|---|
| `just dev` | Firefox dev mode (default) |
| `just dev chrome` | Chrome dev mode |
| `just build` | Firefox build (default) |
| `just build chrome` | Chrome build |
| `just smoke-test` | Chromium extension-loading test (Playwright) |
| `just smoke-test-firefox` | Firefox tab-mode test (Playwright) |

WXT's default is Chrome, but our justfile recipes pass `--browser firefox` by default. This keeps WXT predictable while making our workflow Firefox-first.

---

## Testing Strategy

### Unit tests (`just test`)

Unchanged. 87 tests, pure logic, no browser dependency.

### Chromium smoke test (`just smoke-test`)

Existing test stays as-is. Uses `chromium.launchPersistentContext` with `--load-extension` to prove the full extension wiring works (loads extension, navigates to YouTube, verifies transcript loading + click-to-seek). This is the only viable way to test actual extension loading via Playwright.

### Firefox tab-mode test (`just smoke-test-firefox`)

New test. Opens `sidepanel.html` as a regular page in Playwright's Firefox browser. Verifies the UI renders and behaves correctly in Firefox's Gecko engine. Does not test extension loading (Playwright cannot load Firefox extensions), but the core pipeline (content scripts, messaging) is cross-browser.

### Why not full Firefox extension testing?

Playwright cannot natively load Firefox extensions. The only third-party option (`playwright-webextext`) uses Firefox's Remote Debugging Protocol but is fragile and requires headed mode. Tab-mode testing covers the UI layer in Gecko; the Chromium smoke test proves the extension wiring. Since content scripts and messaging use WXT's cross-browser `browser.*` API, if the wiring works in Chrome, it works in Firefox.

---

## Files Changed/Created

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
    sidebar-host-factory.ts            # Build-time browser detection

tools/
  smoke-test-firefox.ts                # Firefox tab-mode Playwright test
```

### Modified files

```
src/
  entrypoints/
    background.ts                      # Use SidebarHost factory

wxt.config.ts                          # Add gecko.id, sidebar options
justfile                               # Firefox-first dev/build defaults
```

---

## What This Does NOT Do

- No Safari support (future, would use content script UI injection as SidebarHost adapter)
- No Firefox-specific ML optimizations (Phase 4 concern -- Firefox's experimental `browser.trial.ml` API)
- No Firefox extension store publishing (Phase 6 polish)
- No `web-ext` integration beyond what WXT provides
