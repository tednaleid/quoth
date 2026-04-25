import { defineConfig } from 'wxt';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Persistent profiles so cookies, consent popups, and ad state carry across dev runs
const firefoxProfilePath = resolve('.wxt/profiles/firefox');
const chromiumProfilePath = resolve('.wxt/profiles/chrome');
mkdirSync(firefoxProfilePath, { recursive: true });
mkdirSync(chromiumProfilePath, { recursive: true });

// Optional fixed window size for screenshot captures (Chromium honors this; Firefox does not).
const winW = process.env.QUOTH_WINDOW_WIDTH;
const winH = process.env.QUOTH_WINDOW_HEIGHT;
const chromiumArgs =
  winW && winH ? [`--window-size=${winW},${winH}`, '--window-position=0,0'] : undefined;

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  webExt: {
    startUrls: process.env.QUOTH_START_URL ? [process.env.QUOTH_START_URL] : undefined,
    firefoxProfile: firefoxProfilePath,
    chromiumProfile: chromiumProfilePath,
    keepProfileChanges: true,
    chromiumArgs,
  },
  manifest: {
    name: 'Quoth',
    description: 'YouTube transcript viewer with client-side formatting',
    permissions: ['activeTab', 'tabs', 'storage', 'unlimitedStorage', 'contextMenus'],
    host_permissions: ['*://*.youtube.com/*'],
    action: {
      default_title: 'Quoth',
    },
    side_panel: {
      default_path: 'sidepanel/index.html',
    },
    browser_specific_settings: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gecko: {
        id: 'quoth@tednaleid.com',
        strict_min_version: '109.0',
        data_collection_permissions: { required: ['none'] },
      } as any,
    },
  },
});
