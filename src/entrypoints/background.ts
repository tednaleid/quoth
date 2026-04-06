import { createSidebarHost } from '../adapters/sidebar-host-factory';

// The background script's only job is browser-specific sidebar initialization
// and Firefox header modification for the watch page.
// Message routing between content script and side panel happens directly:
//   content -> sidebar:  browser.runtime.sendMessage() broadcasts to all extension contexts
//   sidebar -> content:  browser.tabs.sendMessage(tabId) targets the content script directly
export default defineBackground(() => {
  console.log(`[quoth] background started, extension URL: ${browser.runtime.getURL('')}`);

  // Register webRequest handlers FIRST (before sidebar init which may fail).
  // Firefox MV2 does not support declarativeNetRequest (Chrome uses DNR rules).
  // We use the older webRequest API to rewrite Origin + Referer headers for
  // requests originating from our extension's watch page (moz-extension://).
  if (import.meta.env.BROWSER === 'firefox') {
    console.log('[quoth] registering Firefox webRequest header handlers');

    // Detect whether a request originates from our extension page or an
    // iframe embedded within it. For the initial sub_frame load, originUrl
    // is moz-extension://. For requests INSIDE the YouTube iframe,
    // originUrl is youtube.com — but frameAncestors includes our extension.
    type DetailsWithFirefoxFields = {
      originUrl?: string;
      documentUrl?: string;
      frameAncestors?: Array<{ url: string; frameId: number }>;
    };

    function isFromExtension(details: DetailsWithFirefoxFields): boolean {
      const ext = details as DetailsWithFirefoxFields;
      if (ext.originUrl?.startsWith('moz-extension://')) return true;
      if (ext.documentUrl?.startsWith('moz-extension://')) return true;
      if (ext.frameAncestors?.some((a) => a.url.startsWith('moz-extension://'))) return true;
      return false;
    }

    // Rewrite request headers: replace Origin, add Referer
    browser.webRequest.onBeforeSendHeaders.addListener(
      (details) => {
        if (!details.requestHeaders) return { requestHeaders: details.requestHeaders };
        if (!isFromExtension(details as DetailsWithFirefoxFields)) {
          return { requestHeaders: details.requestHeaders };
        }
        for (const header of details.requestHeaders) {
          const name = header.name.toLowerCase();
          if (name === 'origin') header.value = 'https://www.youtube.com';
          if (name === 'referer') header.value = 'https://www.youtube.com/';
        }
        const hasReferer = details.requestHeaders.some((h) => h.name.toLowerCase() === 'referer');
        if (!hasReferer) {
          details.requestHeaders.push({
            name: 'Referer',
            value: 'https://www.youtube.com/',
          });
        }
        return { requestHeaders: details.requestHeaders };
      },
      {
        urls: ['*://*.youtube.com/*', '*://*.googlevideo.com/*', '*://*.youtube-nocookie.com/*'],
      },
      ['blocking', 'requestHeaders'],
    );

    // Strip X-Frame-Options response headers that block iframe embedding
    browser.webRequest.onHeadersReceived.addListener(
      (details) => {
        if (!isFromExtension(details as DetailsWithFirefoxFields)) {
          return { responseHeaders: details.responseHeaders };
        }
        return {
          responseHeaders: details.responseHeaders?.filter(
            (h) => h.name.toLowerCase() !== 'x-frame-options',
          ),
        };
      },
      { urls: ['*://*.youtube.com/*'] },
      ['blocking', 'responseHeaders'],
    );
  }

  const sidebarHost = createSidebarHost(import.meta.env.BROWSER);
  sidebarHost.initialize();
});
