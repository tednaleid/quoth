import { defineConfig } from 'wxt';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Persistent profiles so cookies, consent popups, and ad state carry across dev runs
const firefoxProfilePath = resolve('.wxt/profiles/firefox');
const chromiumProfilePath = resolve('.wxt/profiles/chrome');
mkdirSync(firefoxProfilePath, { recursive: true });
mkdirSync(chromiumProfilePath, { recursive: true });

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  webExt: {
    startUrls: process.env.QUOTH_START_URL ? [process.env.QUOTH_START_URL] : undefined,
    firefoxProfile: firefoxProfilePath,
    chromiumProfile: chromiumProfilePath,
    keepProfileChanges: true,
  },
  manifest: ({ browser }) => ({
    name: 'Quoth',
    description: 'YouTube transcript viewer with client-side formatting',
    permissions: [
      'activeTab',
      'tabs',
      'storage',
      'unlimitedStorage',
      ...(browser === 'firefox'
        ? ['webRequest', 'webRequestBlocking']
        : ['declarativeNetRequestWithHostAccess', 'scripting']),
    ],
    host_permissions: ['*://*.youtube.com/*'],
    ...(browser !== 'firefox' && {
      declarative_net_request: {
        rule_resources: [
          {
            id: 'innertube_rules',
            enabled: true,
            path: 'dnr-rules.json',
          },
        ],
      },
    }),
    action: {},
    browser_specific_settings: {
      gecko: {
        id: 'quoth@tednaleid.com',
        strict_min_version: '109.0',
      },
    },
  }),
});
