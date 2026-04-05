import { createSidebarHost } from '../adapters/sidebar-host-factory';

export default defineBackground(() => {
  console.log('[quoth] Background service worker started');

  const sidebarHost = createSidebarHost(import.meta.env.BROWSER);
  sidebarHost.initialize();

  // Track the most recent tab with a content script
  let contentScriptTabId: number | null = null;

  // Route messages between content script and side panel
  browser.runtime.onMessage.addListener((message, sender) => {
    const msgType = (message as { type?: string })?.type ?? 'unknown';

    if (sender.tab?.id) {
      contentScriptTabId = sender.tab.id;
      console.log(`[quoth-bg] from content (tab ${sender.tab.id}): ${msgType}`);
      browser.runtime.sendMessage(message).catch(() => {});
    } else {
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
