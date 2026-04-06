import { createSidebarHost } from '../adapters/sidebar-host-factory';

// The background script's only job is browser-specific sidebar initialization
// and Firefox header modification for the watch page.
// Message routing between content script and side panel happens directly:
//   content -> sidebar:  browser.runtime.sendMessage() broadcasts to all extension contexts
//   sidebar -> content:  browser.tabs.sendMessage(tabId) targets the content script directly
export default defineBackground(() => {
  console.log(`[quoth] background started, extension URL: ${browser.runtime.getURL('')}`);

  // Register webRequest handler FIRST (before sidebar init which may fail).
  // Firefox MV2: webRequest API for header modifications (Chrome uses declarativeNetRequest rules).
  // Firefox MV2 does not support declarativeNetRequest, so we use the older webRequest API
  // to apply the same header modifications: strip Origin on Innertube, set Referer for embeds.
  if (import.meta.env.BROWSER === 'firefox') {
    const extensionOrigin = browser.runtime.getURL('');
    console.log('[quoth] registering Firefox webRequest header handler');
    browser.webRequest.onBeforeSendHeaders.addListener(
      (details) => {
        if (!details.requestHeaders) return { requestHeaders: details.requestHeaders };
        // Only modify requests originating from our extension (moz-extension://...).
        // Leave normal YouTube browsing untouched. When originUrl is absent
        // (e.g. top-level navigations), do NOT modify — safe default is pass-through.
        const originUrl = (details as { originUrl?: string }).originUrl;
        if (!originUrl || !originUrl.startsWith(extensionOrigin)) {
          return { requestHeaders: details.requestHeaders };
        }
        console.log(`[quoth] modifying headers for: ${details.url.slice(0, 80)}`);
        const headers = details.requestHeaders.filter((h) => h.name.toLowerCase() !== 'origin');
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

  const sidebarHost = createSidebarHost(import.meta.env.BROWSER);
  sidebarHost.initialize();
});
