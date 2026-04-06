import { createSidebarHost } from '../adapters/sidebar-host-factory';

// The background script's only job is browser-specific sidebar initialization
// and Firefox header modification for the watch page.
// Message routing between content script and side panel happens directly:
//   content -> sidebar:  browser.runtime.sendMessage() broadcasts to all extension contexts
//   sidebar -> content:  browser.tabs.sendMessage(tabId) targets the content script directly
export default defineBackground(() => {
  console.log(`[quoth] background started, extension URL: ${browser.runtime.getURL('')}`);

  // Firefox MV2: strip the moz-extension:// Origin header on Innertube API requests.
  // YouTube returns 403 when Origin is moz-extension://. The YouTube embed itself
  // goes through a GitHub Pages intermediary (real HTTPS origin), but the watch page's
  // direct Innertube fetch for captions still needs this fix.
  if (import.meta.env.BROWSER === 'firefox') {
    browser.webRequest.onBeforeSendHeaders.addListener(
      (details) => {
        if (!details.requestHeaders) return { requestHeaders: details.requestHeaders };
        const originUrl = (details as { originUrl?: string }).originUrl;
        if (!originUrl || !originUrl.startsWith('moz-extension://')) {
          return { requestHeaders: details.requestHeaders };
        }
        for (const header of details.requestHeaders) {
          if (header.name.toLowerCase() === 'origin') {
            header.value = 'https://www.youtube.com';
          }
        }
        return { requestHeaders: details.requestHeaders };
      },
      { urls: ['*://*.youtube.com/youtubei/*'] },
      ['blocking', 'requestHeaders'],
    );
  }

  const sidebarHost = createSidebarHost(import.meta.env.BROWSER);
  sidebarHost.initialize();
});
