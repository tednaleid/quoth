import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'Quoth',
    description: 'YouTube transcript viewer with client-side formatting',
    permissions: ['activeTab', 'tabs', 'storage', 'unlimitedStorage'],
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
