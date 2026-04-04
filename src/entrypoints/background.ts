export default defineBackground(() => {
  console.log('[quoth] Background service worker started');

  // Open side panel when the extension icon is clicked
  // @ts-expect-error -- chrome.sidePanel not in WXT's browser types yet
  globalThis.chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Route messages between content script and side panel
  browser.runtime.onMessage.addListener((message, sender) => {
    if (sender.tab) {
      // Message from content script -- forward to all extension contexts (side panel)
      browser.runtime.sendMessage(message).catch(() => {
        // Side panel may not be open
      });
    } else {
      // Message from side panel -- forward to active tab's content script
      browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        if (tabs[0]?.id) {
          browser.tabs.sendMessage(tabs[0].id, message).catch(() => {
            // Content script may not be loaded
          });
        }
      });
    }
    return false;
  });
});
