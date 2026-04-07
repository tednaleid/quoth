/**
 * ABOUTME: Tests for the pinned tab connector module.
 * ABOUTME: Verifies pinned connection, disconnection detection, and cleanup.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { setupPinnedTabConnector } from '../../../src/adapters/browser/pinned-tab-connector';

beforeEach(() => {
  fakeBrowser.reset();
});

/** Build a minimal tab object for onUpdated.trigger (only id and url matter for the adapter). */
function tabInfo(id: number, url: string) {
  return {
    id,
    url,
    index: 0,
    pinned: false,
    highlighted: false,
    active: true,
    incognito: false,
    windowId: 1,
  } as Browser.tabs.Tab;
}

describe('setupPinnedTabConnector - initial connection', () => {
  it('calls onConnect immediately with the pinned tabId', async () => {
    await fakeBrowser.tabs.create({ id: 5, url: 'https://www.youtube.com/watch?v=abc' });

    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const cleanup = await setupPinnedTabConnector(5, { onConnect, onDisconnect });

    expect(onConnect).toHaveBeenCalledOnce();
    expect(onConnect).toHaveBeenCalledWith(5);

    cleanup();
  });

  it('sends request-state via sendMessage on connect', async () => {
    await fakeBrowser.tabs.create({ id: 5, url: 'https://www.youtube.com/watch?v=abc' });

    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const sendMessage = vi.fn();
    const cleanup = await setupPinnedTabConnector(5, { onConnect, onDisconnect, sendMessage });

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith(5, { type: 'request-state' });

    cleanup();
  });
});

describe('setupPinnedTabConnector - tab closed', () => {
  it('calls onDisconnect with tab-closed when pinned tab is removed', async () => {
    await fakeBrowser.tabs.create({ id: 5, url: 'https://www.youtube.com/watch?v=abc' });

    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const cleanup = await setupPinnedTabConnector(5, { onConnect, onDisconnect });

    await fakeBrowser.tabs.onRemoved.trigger(5, { windowId: 1, isWindowClosing: false });

    expect(onDisconnect).toHaveBeenCalledOnce();
    expect(onDisconnect).toHaveBeenCalledWith('tab-closed');

    cleanup();
  });

  it('does not call onDisconnect when a different tab is removed', async () => {
    await fakeBrowser.tabs.create({ id: 5, url: 'https://www.youtube.com/watch?v=abc' });
    await fakeBrowser.tabs.create({ id: 10, url: 'https://www.example.com/' });

    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const cleanup = await setupPinnedTabConnector(5, { onConnect, onDisconnect });

    await fakeBrowser.tabs.onRemoved.trigger(10, { windowId: 1, isWindowClosing: false });

    expect(onDisconnect).not.toHaveBeenCalled();

    cleanup();
  });
});

describe('setupPinnedTabConnector - navigated away', () => {
  it('calls onDisconnect when pinned tab navigates to a non-YouTube URL', async () => {
    await fakeBrowser.tabs.create({ id: 5, url: 'https://www.youtube.com/watch?v=abc' });

    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const cleanup = await setupPinnedTabConnector(5, { onConnect, onDisconnect });

    await fakeBrowser.tabs.onUpdated.trigger(
      5,
      { url: 'https://www.example.com/' },
      tabInfo(5, 'https://www.example.com/'),
    );

    expect(onDisconnect).toHaveBeenCalledOnce();
    expect(onDisconnect).toHaveBeenCalledWith('navigated-away');

    cleanup();
  });

  it('does not call onDisconnect when pinned tab navigates to a different YouTube video', async () => {
    await fakeBrowser.tabs.create({ id: 5, url: 'https://www.youtube.com/watch?v=abc' });

    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const cleanup = await setupPinnedTabConnector(5, { onConnect, onDisconnect });

    await fakeBrowser.tabs.onUpdated.trigger(
      5,
      { url: 'https://www.youtube.com/watch?v=xyz' },
      tabInfo(5, 'https://www.youtube.com/watch?v=xyz'),
    );

    expect(onDisconnect).not.toHaveBeenCalled();

    cleanup();
  });

  it('does not call onDisconnect when a different tab navigates away', async () => {
    await fakeBrowser.tabs.create({ id: 5, url: 'https://www.youtube.com/watch?v=abc' });
    await fakeBrowser.tabs.create({ id: 10, url: 'https://www.youtube.com/watch?v=xyz' });

    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const cleanup = await setupPinnedTabConnector(5, { onConnect, onDisconnect });

    await fakeBrowser.tabs.onUpdated.trigger(
      10,
      { url: 'https://www.example.com/' },
      tabInfo(10, 'https://www.example.com/'),
    );

    expect(onDisconnect).not.toHaveBeenCalled();

    cleanup();
  });

  it('ignores onUpdated events without a URL change', async () => {
    await fakeBrowser.tabs.create({ id: 5, url: 'https://www.youtube.com/watch?v=abc' });

    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const cleanup = await setupPinnedTabConnector(5, { onConnect, onDisconnect });

    // title change, no URL change
    await fakeBrowser.tabs.onUpdated.trigger(
      5,
      { title: 'New Title' },
      tabInfo(5, 'https://www.youtube.com/watch?v=abc'),
    );

    expect(onDisconnect).not.toHaveBeenCalled();

    cleanup();
  });
});

describe('setupPinnedTabConnector - cleanup', () => {
  it('stops listening for tab removal after cleanup', async () => {
    await fakeBrowser.tabs.create({ id: 5, url: 'https://www.youtube.com/watch?v=abc' });

    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const cleanup = await setupPinnedTabConnector(5, { onConnect, onDisconnect });

    cleanup();

    await fakeBrowser.tabs.onRemoved.trigger(5, { windowId: 1, isWindowClosing: false });

    expect(onDisconnect).not.toHaveBeenCalled();
  });

  it('stops listening for tab URL changes after cleanup', async () => {
    await fakeBrowser.tabs.create({ id: 5, url: 'https://www.youtube.com/watch?v=abc' });

    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const cleanup = await setupPinnedTabConnector(5, { onConnect, onDisconnect });

    cleanup();

    await fakeBrowser.tabs.onUpdated.trigger(
      5,
      { url: 'https://www.example.com/' },
      tabInfo(5, 'https://www.example.com/'),
    );

    expect(onDisconnect).not.toHaveBeenCalled();
  });
});
