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
