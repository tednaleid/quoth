import { createSidebarHost } from '../adapters/sidebar-host-factory';

// The background script's only job is browser-specific sidebar initialization.
// Message routing between content script and side panel happens directly:
//   content -> sidebar:  browser.runtime.sendMessage() broadcasts to all extension contexts
//   sidebar -> content:  browser.tabs.sendMessage(tabId) targets the content script directly
export default defineBackground(() => {
  console.log('[quoth] background started');
  const sidebarHost = createSidebarHost(import.meta.env.BROWSER);
  sidebarHost.initialize();
});
