export default defineBackground(() => {
  console.log('[quoth] Background service worker started');

  // Open side panel when the extension icon is clicked
  // @ts-expect-error -- chrome.sidePanel not in WXT's browser types yet
  globalThis.chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  browser.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
    console.log('[quoth] Message received:', message);
    return false;
  });
});
