/**
 * ABOUTME: Background script -- handles extension icon clicks and Firefox header fixes.
 * ABOUTME: Icon click extracts videoId from YouTube URL, grabs playback time, navigates to watch page.
 */
import { extractVideoId } from '../core/youtube';

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

  // Disable the icon by default; enable it only on YouTube /watch pages.
  if (import.meta.env.BROWSER === 'firefox') {
    browser.browserAction?.disable();
  } else {
    browser.action.disable();
  }

  const extUrl = browser.runtime.getURL('');

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!changeInfo.url && changeInfo.status !== 'complete') return;
    const videoId = tab.url ? extractVideoId(tab.url) : null;
    if (import.meta.env.BROWSER === 'firefox') {
      if (videoId) {
        browser.browserAction?.enable(tabId);
        // Tag the page with the extension URL so Playwright can discover the UUID.
        browser.tabs
          .executeScript(tabId, {
            code: `document.documentElement.dataset.quothExtUrl = ${JSON.stringify(extUrl)}`,
          })
          .catch(() => {});
      } else {
        browser.browserAction?.disable(tabId);
      }
    } else {
      if (videoId) {
        browser.action.enable(tabId);
      } else {
        browser.action.disable(tabId);
      }
    }
  });

  // Icon click: navigate the current tab to the watch page with videoId and currentTime.
  const handleIconClick = async (tab: { id?: number; url?: string }) => {
    if (!tab.id || !tab.url) return;
    const videoId = extractVideoId(tab.url);
    if (!videoId) return;

    let currentTime = 0;
    try {
      if (import.meta.env.BROWSER === 'firefox') {
        const results = await browser.tabs.executeScript(tab.id, {
          code: "document.querySelector('video')?.currentTime ?? 0",
        });
        currentTime = typeof results?.[0] === 'number' ? results[0] : 0;
      } else {
        const results = await browser.scripting.executeScript({
          target: { tabId: tab.id },
          func: () =>
            (document.querySelector('video') as HTMLVideoElement | null)?.currentTime ?? 0,
        });
        currentTime = typeof results?.[0]?.result === 'number' ? results[0].result : 0;
      }
    } catch {
      // If script injection fails (e.g., restricted page), navigate without a timestamp.
    }

    const seconds = Math.floor(currentTime);
    const watchUrl = browser.runtime.getURL(`/watch.html?v=${videoId}&t=${seconds}`);
    await browser.tabs.update(tab.id, { url: watchUrl });
  };

  if (import.meta.env.BROWSER === 'firefox') {
    browser.browserAction?.onClicked.addListener(handleIconClick);
  } else {
    browser.action.onClicked.addListener(handleIconClick);
  }
});
