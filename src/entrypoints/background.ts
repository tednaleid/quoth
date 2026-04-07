import { createSidebarHost } from '../adapters/sidebar-host-factory';

const YOUTUBE_WATCH_PATTERN = /youtube\.com\/watch/;

// Message routing between content script and side panel happens directly:
//   content -> sidebar:  browser.runtime.sendMessage() broadcasts to all extension contexts
//   sidebar -> content:  browser.tabs.sendMessage(tabId) targets the content script directly
export default defineBackground(() => {
  console.log('[quoth] background started', browser.runtime.getURL('/'));
  const sidebarHost = createSidebarHost(import.meta.env.BROWSER);
  sidebarHost.initialize();

  // Context menu on the extension icon: "Open in new tab"
  const menuContext = import.meta.env.BROWSER === 'firefox' ? 'browser_action' : 'action';
  browser.contextMenus.create({
    id: 'open-in-tab',
    title: 'Open in new tab',
    contexts: [menuContext as Browser.contextMenus.ContextType],
  });

  browser.contextMenus.onClicked.addListener(async (info) => {
    if (info.menuItemId !== 'open-in-tab') return;

    // Find the active YouTube tab to pin the popout to
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const ytTab = tabs.find((t) => t.url && YOUTUBE_WATCH_PATTERN.test(t.url));
    if (!ytTab?.id) return;

    const url = browser.runtime.getURL(`/popout.html?tabId=${ytTab.id}`);
    await browser.tabs.create({ url });
  });

  // Handle open-page requests (from content script, used by smoke tests in Firefox)
  browser.runtime.onMessage.addListener((message: { type?: string; page?: string }, sender) => {
    if (message?.type !== 'open-page' || !sender.tab?.id) return false;
    const tabId = sender.tab.id;

    if (message.page === 'sidepanel') {
      const url = browser.runtime.getURL('/sidepanel.html');
      browser.tabs.create({ url });
    } else if (message.page === 'popout') {
      const url = browser.runtime.getURL(`/popout.html?tabId=${tabId}`);
      browser.tabs.create({ url });
    }
    return true;
  });
});
