export default defineBackground(() => {
  console.log('[quoth] Background service worker started');

  // Open side panel when the extension icon is clicked
  // @ts-expect-error -- chrome.sidePanel not in WXT's browser types yet
  globalThis.chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Track the most recent tab with a content script
  let contentScriptTabId: number | null = null;

  // Route messages between content script and side panel
  browser.runtime.onMessage.addListener((message, sender) => {
    const msgType = (message as { type?: string })?.type ?? 'unknown';

    if (sender.tab?.id) {
      // Message from content script -- remember its tab and forward to side panel
      contentScriptTabId = sender.tab.id;
      console.log(`[quoth-bg] from content (tab ${sender.tab.id}): ${msgType}`);
      browser.runtime.sendMessage(message).catch(() => {
        // Side panel may not be open
      });
    } else {
      // Message from side panel -- forward to the content script's tab
      console.log(`[quoth-bg] from sidepanel: ${msgType}, forwarding to tab ${contentScriptTabId}`);
      if (contentScriptTabId) {
        browser.tabs.sendMessage(contentScriptTabId, message).catch((err) => {
          console.log(`[quoth-bg] forward failed: ${err}`);
        });
      } else {
        console.log('[quoth-bg] no content script tab known');
      }
    }
    return false;
  });
});
