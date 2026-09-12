/**
 * ABOUTME: Tests for the tab connector module.
 * ABOUTME: Verifies YouTube tab discovery, switching, pinning, and callback invocation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { setupTabConnector, listYouTubeTabs } from '../../../src/adapters/browser/tab-connector';

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
});

// fake-browser cannot mark a tab active (duplicate drops the tab) and its
// tabs.remove crashes, so these helpers emulate both through tabs.query.
function makeActive(tabId: number) {
  const original = fakeBrowser.tabs.query.bind(fakeBrowser.tabs);
  vi.spyOn(fakeBrowser.tabs, 'query').mockImplementation(
    async (queryInfo: Browser.tabs.QueryInfo) => {
      const tabs = (await original({ ...queryInfo, active: undefined })).map(
        (t: Browser.tabs.Tab) => ({
          ...t,
          active: t.id === tabId,
        }),
      );
      return queryInfo.active == null
        ? tabs
        : tabs.filter((t: Browser.tabs.Tab) => t.active === queryInfo.active);
    },
  );
}

async function closeTab(tabId: number) {
  const original = fakeBrowser.tabs.query.bind(fakeBrowser.tabs);
  vi.spyOn(fakeBrowser.tabs, 'query').mockImplementation(
    async (queryInfo: Browser.tabs.QueryInfo) =>
      (await original(queryInfo)).filter((t: Browser.tabs.Tab) => t.id !== tabId),
  );
  await fakeBrowser.tabs.onRemoved.trigger(tabId, { isWindowClosing: false, windowId: 0 });
}

describe('setupTabConnector - initial connection', () => {
  it('connects to the first YouTube tab found', async () => {
    await fakeBrowser.tabs.create({
      url: 'https://www.youtube.com/watch?v=abc',
    });

    const onConnect = vi.fn();
    const conn = await setupTabConnector({ onConnect });

    expect(onConnect).toHaveBeenCalledOnce();
    expect(onConnect).toHaveBeenCalledWith(1);

    conn.cleanup();
  });

  it('ignores non-YouTube tabs when looking for initial connection', async () => {
    await fakeBrowser.tabs.create({
      url: 'https://www.example.com/',
    });
    await fakeBrowser.tabs.create({
      url: 'https://www.youtube.com/watch?v=xyz',
    });

    const onConnect = vi.fn();
    const conn = await setupTabConnector({ onConnect });

    expect(onConnect).toHaveBeenCalledOnce();
    expect(onConnect).toHaveBeenCalledWith(2);

    conn.cleanup();
  });

  it('does not call onConnect when no YouTube tabs exist', async () => {
    await fakeBrowser.tabs.create({
      url: 'https://www.example.com/',
    });

    const onConnect = vi.fn();
    const conn = await setupTabConnector({ onConnect });

    expect(onConnect).not.toHaveBeenCalled();

    conn.cleanup();
  });

  it('does not call onConnect when no tabs exist at all', async () => {
    const onConnect = vi.fn();
    const conn = await setupTabConnector({ onConnect });

    expect(onConnect).not.toHaveBeenCalled();

    conn.cleanup();
  });
});

describe('setupTabConnector - tab switching', () => {
  it('calls onConnect when user activates a YouTube tab', async () => {
    // Start with no YouTube tabs so initial connection does not fire
    const onConnect = vi.fn();
    const conn = await setupTabConnector({ onConnect });

    // Now a YouTube tab is created and activated
    const tab = await fakeBrowser.tabs.create({
      url: 'https://www.youtube.com/watch?v=abc',
    });

    await fakeBrowser.tabs.onActivated.trigger({ tabId: tab.id!, windowId: 1 });

    expect(onConnect).toHaveBeenCalledOnce();
    expect(onConnect).toHaveBeenCalledWith(tab.id);

    conn.cleanup();
  });

  it('does not call onConnect when user activates a non-YouTube tab', async () => {
    await fakeBrowser.tabs.create({
      url: 'https://www.example.com/',
    });

    const onConnect = vi.fn();
    const conn = await setupTabConnector({ onConnect });

    onConnect.mockClear();

    await fakeBrowser.tabs.onActivated.trigger({ tabId: 1, windowId: 1 });

    expect(onConnect).not.toHaveBeenCalled();

    conn.cleanup();
  });

  it('does not call onConnect again when switching to the already-connected tab', async () => {
    await fakeBrowser.tabs.create({
      url: 'https://www.youtube.com/watch?v=abc',
    });

    const onConnect = vi.fn();
    const conn = await setupTabConnector({ onConnect });

    // Initial connection fires onConnect once
    expect(onConnect).toHaveBeenCalledOnce();
    onConnect.mockClear();

    // Activating the same tab should not fire again
    await fakeBrowser.tabs.onActivated.trigger({ tabId: 1, windowId: 1 });

    expect(onConnect).not.toHaveBeenCalled();

    conn.cleanup();
  });

  it('calls onConnect when switching from one YouTube tab to another', async () => {
    await fakeBrowser.tabs.create({
      url: 'https://www.youtube.com/watch?v=abc',
    });
    await fakeBrowser.tabs.create({
      url: 'https://www.youtube.com/watch?v=xyz',
    });

    const onConnect = vi.fn();
    const conn = await setupTabConnector({ onConnect });

    // Connected to tab 1 (first YouTube tab found)
    expect(onConnect).toHaveBeenCalledWith(1);
    onConnect.mockClear();

    // Switch to tab 2
    await fakeBrowser.tabs.onActivated.trigger({ tabId: 2, windowId: 1 });

    expect(onConnect).toHaveBeenCalledOnce();
    expect(onConnect).toHaveBeenCalledWith(2);

    conn.cleanup();
  });
});

describe('setupTabConnector - tab navigation (onUpdated)', () => {
  it('calls onConnect when an existing tab navigates to YouTube', async () => {
    // Start with a non-YouTube tab
    const tab = await fakeBrowser.tabs.create({
      url: 'https://www.example.com/',
    });

    const onConnect = vi.fn();
    const conn = await setupTabConnector({ onConnect });

    // Initial connect should not fire (no YouTube tabs)
    expect(onConnect).not.toHaveBeenCalled();

    // Navigate the existing tab to YouTube -- fires onUpdated, not onActivated
    const updatedTab = { ...tab, url: 'https://www.youtube.com/watch?v=abc' };
    await fakeBrowser.tabs.onUpdated.trigger(
      1,
      { url: 'https://www.youtube.com/watch?v=abc' },
      updatedTab,
    );

    expect(onConnect).toHaveBeenCalledOnce();
    expect(onConnect).toHaveBeenCalledWith(1);

    conn.cleanup();
  });

  it('does not call onConnect when a tab navigates away from YouTube', async () => {
    await fakeBrowser.tabs.create({
      url: 'https://www.youtube.com/watch?v=abc',
    });

    const onConnect = vi.fn();
    const conn = await setupTabConnector({ onConnect });

    expect(onConnect).toHaveBeenCalledOnce();
    onConnect.mockClear();

    // Navigate away from YouTube
    await fakeBrowser.tabs.onUpdated.trigger(1, { url: 'https://www.example.com/' }, {
      id: 1,
      url: 'https://www.example.com/',
    } as Browser.tabs.Tab);

    expect(onConnect).not.toHaveBeenCalled();

    conn.cleanup();
  });
});

describe('setupTabConnector - cleanup', () => {
  it('stops listening for tab activation after cleanup', async () => {
    await fakeBrowser.tabs.create({
      url: 'https://www.youtube.com/watch?v=abc',
    });

    const onConnect = vi.fn();
    const conn = await setupTabConnector({ onConnect });

    conn.cleanup();
    onConnect.mockClear();

    await fakeBrowser.tabs.onActivated.trigger({ tabId: 1, windowId: 1 });

    expect(onConnect).not.toHaveBeenCalled();
  });
});

describe('setupTabConnector - sendMessage', () => {
  it('calls sendMessage on initial connect', async () => {
    await fakeBrowser.tabs.create({
      url: 'https://www.youtube.com/watch?v=abc',
    });

    const onConnect = vi.fn();
    const sendMessage = vi.fn();
    const conn = await setupTabConnector({ onConnect, sendMessage });

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith(1, { type: 'request-state' });

    conn.cleanup();
  });

  it('calls sendMessage on tab switch', async () => {
    await fakeBrowser.tabs.create({
      url: 'https://www.youtube.com/watch?v=abc',
    });

    const onConnect = vi.fn();
    const sendMessage = vi.fn();
    const conn = await setupTabConnector({ onConnect, sendMessage });

    sendMessage.mockClear();

    await fakeBrowser.tabs.onActivated.trigger({ tabId: 1, windowId: 1 });

    // Same tab was already connected, so no new sendMessage
    expect(sendMessage).not.toHaveBeenCalled();

    conn.cleanup();
  });

  it('calls sendMessage when switching to a different YouTube tab', async () => {
    await fakeBrowser.tabs.create({
      url: 'https://www.youtube.com/watch?v=abc',
    });
    await fakeBrowser.tabs.create({
      url: 'https://www.youtube.com/watch?v=xyz',
    });

    const onConnect = vi.fn();
    const sendMessage = vi.fn();
    const conn = await setupTabConnector({ onConnect, sendMessage });

    sendMessage.mockClear();

    await fakeBrowser.tabs.onActivated.trigger({ tabId: 2, windowId: 1 });

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith(2, { type: 'request-state' });

    conn.cleanup();
  });

  it('does not call sendMessage when no YouTube tabs exist', async () => {
    const onConnect = vi.fn();
    const sendMessage = vi.fn();
    const conn = await setupTabConnector({ onConnect, sendMessage });

    expect(sendMessage).not.toHaveBeenCalled();

    conn.cleanup();
  });
});

describe('listYouTubeTabs', () => {
  it('returns id, title, and url for each open YouTube tab', async () => {
    await fakeBrowser.tabs.create({
      url: 'https://www.youtube.com/watch?v=abc',
      title: 'Video ABC',
    });
    await fakeBrowser.tabs.create({ url: 'https://www.example.com/' });
    await fakeBrowser.tabs.create({
      url: 'https://www.youtube.com/watch?v=xyz',
      title: 'Video XYZ',
    });

    const tabs = await listYouTubeTabs();

    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toMatchObject({
      id: 1,
      url: 'https://www.youtube.com/watch?v=abc',
    });
    expect(tabs[1]).toMatchObject({
      id: 3,
      url: 'https://www.youtube.com/watch?v=xyz',
    });
  });

  it('strips the " - YouTube" suffix from tab titles', async () => {
    await fakeBrowser.tabs.create({ url: 'https://www.youtube.com/watch?v=abc' });
    await fakeBrowser.tabs.update(1, {
      title: 'Video ABC - YouTube',
    } as Browser.tabs.UpdateProperties);

    const tabs = await listYouTubeTabs();

    expect(tabs[0].title).toBe('Video ABC');
  });

  it('returns an empty list when no YouTube tabs are open', async () => {
    await fakeBrowser.tabs.create({ url: 'https://www.example.com/' });

    expect(await listYouTubeTabs()).toEqual([]);
  });
});

describe('setupTabConnector - tab list updates', () => {
  it('emits the tab list on connect via onTabsChanged', async () => {
    await fakeBrowser.tabs.create({
      url: 'https://www.youtube.com/watch?v=abc',
      title: 'Video ABC',
    });

    const onConnect = vi.fn();
    const onTabsChanged = vi.fn();
    const conn = await setupTabConnector({ onConnect, onTabsChanged });

    expect(onTabsChanged).toHaveBeenCalledOnce();
    expect(onTabsChanged.mock.calls[0][0]).toHaveLength(1);
    expect(onTabsChanged.mock.calls[0][0][0]).toMatchObject({ id: 1 });

    conn.cleanup();
  });
});

describe('setupTabConnector - pin and follow', () => {
  it('pin connects to the chosen tab and requests its state', async () => {
    await fakeBrowser.tabs.create({ url: 'https://www.youtube.com/watch?v=abc' });
    await fakeBrowser.tabs.create({ url: 'https://www.youtube.com/watch?v=xyz' });

    const onConnect = vi.fn();
    const sendMessage = vi.fn();
    const conn = await setupTabConnector({ onConnect, sendMessage });
    onConnect.mockClear();
    sendMessage.mockClear();

    conn.pin(2);

    expect(onConnect).toHaveBeenCalledOnce();
    expect(onConnect).toHaveBeenCalledWith(2);
    expect(sendMessage).toHaveBeenCalledWith(2, { type: 'request-state' });

    conn.cleanup();
  });

  it('does not switch on activation while pinned', async () => {
    await fakeBrowser.tabs.create({ url: 'https://www.youtube.com/watch?v=abc' });
    await fakeBrowser.tabs.create({ url: 'https://www.youtube.com/watch?v=xyz' });

    const onConnect = vi.fn();
    const conn = await setupTabConnector({ onConnect });
    conn.pin(2);
    onConnect.mockClear();

    await fakeBrowser.tabs.onActivated.trigger({ tabId: 1, windowId: 1 });

    expect(onConnect).not.toHaveBeenCalled();

    conn.cleanup();
  });

  it('follows activations again after a pin/follow cycle', async () => {
    await fakeBrowser.tabs.create({ url: 'https://www.youtube.com/watch?v=abc' });
    await fakeBrowser.tabs.create({ url: 'https://www.youtube.com/watch?v=xyz' });

    const onConnect = vi.fn();
    const conn = await setupTabConnector({ onConnect });
    conn.pin(2);
    await conn.follow();
    onConnect.mockClear();

    // The connector is on tab 2, so activating tab 1 must switch to it.
    await fakeBrowser.tabs.onActivated.trigger({ tabId: 1, windowId: 1 });

    expect(onConnect).toHaveBeenCalledOnce();
    expect(onConnect).toHaveBeenCalledWith(1);

    conn.cleanup();
  });

  it('follow stays on the current tab when no YouTube tab is active', async () => {
    await fakeBrowser.tabs.create({ url: 'https://www.youtube.com/watch?v=abc' });
    await fakeBrowser.tabs.create({ url: 'https://www.youtube.com/watch?v=xyz' });

    const onConnect = vi.fn();
    const conn = await setupTabConnector({ onConnect });
    conn.pin(2);
    onConnect.mockClear();

    await conn.follow();

    expect(onConnect).not.toHaveBeenCalled();

    conn.cleanup();
  });

  it('follow reconnects to the active YouTube tab', async () => {
    await fakeBrowser.tabs.create({ url: 'https://www.youtube.com/watch?v=abc' });
    await fakeBrowser.tabs.create({ url: 'https://www.youtube.com/watch?v=xyz' });
    makeActive(2);

    const onConnect = vi.fn();
    const conn = await setupTabConnector({ onConnect });
    expect(onConnect).toHaveBeenCalledWith(2);
    conn.pin(1);
    onConnect.mockClear();

    await conn.follow();

    expect(onConnect).toHaveBeenCalledOnce();
    expect(onConnect).toHaveBeenCalledWith(2);

    conn.cleanup();
  });
});

describe('setupTabConnector - connected tab goes away', () => {
  it('connects to another YouTube tab when the followed tab closes', async () => {
    await fakeBrowser.tabs.create({ url: 'https://www.youtube.com/watch?v=abc' });
    await fakeBrowser.tabs.create({ url: 'https://www.youtube.com/watch?v=xyz' });

    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const conn = await setupTabConnector({ onConnect, onDisconnect });
    onConnect.mockClear();

    await closeTab(1);

    expect(onConnect).toHaveBeenCalledOnce();
    expect(onConnect).toHaveBeenCalledWith(2);
    expect(onDisconnect).not.toHaveBeenCalled();

    conn.cleanup();
  });

  it('reports no-tabs when the last YouTube tab closes', async () => {
    await fakeBrowser.tabs.create({ url: 'https://www.youtube.com/watch?v=abc' });

    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const conn = await setupTabConnector({ onConnect, onDisconnect });
    onConnect.mockClear();

    await closeTab(1);

    expect(onDisconnect).toHaveBeenCalledOnce();
    expect(onDisconnect).toHaveBeenCalledWith('no-tabs');
    expect(onConnect).not.toHaveBeenCalled();

    conn.cleanup();
  });

  it('reports no-tabs when the followed tab navigates away and none remain', async () => {
    await fakeBrowser.tabs.create({ url: 'https://www.youtube.com/watch?v=abc' });

    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const conn = await setupTabConnector({ onConnect, onDisconnect });
    onConnect.mockClear();

    await fakeBrowser.tabs.update(1, { url: 'https://www.example.com/' });

    expect(onDisconnect).toHaveBeenCalledOnce();
    expect(onDisconnect).toHaveBeenCalledWith('no-tabs');
    expect(onConnect).not.toHaveBeenCalled();

    conn.cleanup();
  });

  it('follow connects to any YouTube tab when nothing is connected', async () => {
    await fakeBrowser.tabs.create({ url: 'https://www.youtube.com/watch?v=abc' });
    await fakeBrowser.tabs.create({ url: 'https://www.youtube.com/watch?v=xyz' });

    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const conn = await setupTabConnector({ onConnect, onDisconnect });
    conn.pin(2);
    await closeTab(2);
    expect(onDisconnect).toHaveBeenCalledWith('pinned-tab-closed');
    onConnect.mockClear();

    await conn.follow();

    expect(onConnect).toHaveBeenCalledOnce();
    expect(onConnect).toHaveBeenCalledWith(1);

    conn.cleanup();
  });

  it('reports pinned-tab-closed and stays put when the pinned tab closes', async () => {
    await fakeBrowser.tabs.create({ url: 'https://www.youtube.com/watch?v=abc' });
    await fakeBrowser.tabs.create({ url: 'https://www.youtube.com/watch?v=xyz' });

    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const conn = await setupTabConnector({ onConnect, onDisconnect });
    conn.pin(2);
    onConnect.mockClear();

    await closeTab(2);

    expect(onDisconnect).toHaveBeenCalledOnce();
    expect(onDisconnect).toHaveBeenCalledWith('pinned-tab-closed');
    expect(onConnect).not.toHaveBeenCalled();

    conn.cleanup();
  });
});
