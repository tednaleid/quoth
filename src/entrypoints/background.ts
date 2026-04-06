import { createSidebarHost } from '../adapters/sidebar-host-factory';

// The background script's only job is browser-specific sidebar initialization.
// Message routing between content script and side panel happens directly:
//   content -> sidebar:  browser.runtime.sendMessage() broadcasts to all extension contexts
//   sidebar -> content:  browser.tabs.sendMessage(tabId) targets the content script directly
export default defineBackground(() => {
  console.log('[quoth] background started');
  const sidebarHost = createSidebarHost(import.meta.env.BROWSER);
  sidebarHost.initialize();

  // Firefox MV2: webRequest API for header modifications (Chrome uses declarativeNetRequest rules)
  // Only set up if declarativeNetRequest is not available (i.e., Firefox)
  if (typeof browser.declarativeNetRequest === 'undefined') {
    browser.webRequest.onBeforeSendHeaders.addListener(
      (details) => {
        if (!details.requestHeaders) return {};
        // Only modify requests originating from our extension.
        // Firefox provides originUrl (not in Chrome types), Chrome provides initiator.
        const origin = (details as { originUrl?: string }).originUrl ?? details.initiator;
        if (origin && !origin.startsWith(browser.runtime.getURL(''))) {
          return {};
        }
        const headers = details.requestHeaders.filter((h) => h.name.toLowerCase() !== 'origin');
        // Set Referer for embed playback (YouTube requires it)
        const hasReferer = headers.some((h) => h.name.toLowerCase() === 'referer');
        if (!hasReferer) {
          headers.push({ name: 'Referer', value: 'https://quoth.local/' });
        }
        return { requestHeaders: headers };
      },
      { urls: ['*://*.youtube.com/*'] },
      ['blocking', 'requestHeaders'],
    );
  }
});
