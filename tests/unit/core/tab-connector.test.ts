/**
 * ABOUTME: Tests for the tab connector module.
 * ABOUTME: Verifies YouTube tab discovery, switching, and callback invocation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { setupTabConnector } from '../../../src/core/tab-connector';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('setupTabConnector - initial connection', () => {
  it('connects to the first YouTube tab found', async () => {
    await fakeBrowser.tabs.create({
      id: 1,
      url: 'https://www.youtube.com/watch?v=abc',
    });

    const onConnect = vi.fn();
    const cleanup = await setupTabConnector({ onConnect });

    expect(onConnect).toHaveBeenCalledOnce();
    expect(onConnect).toHaveBeenCalledWith(1);

    cleanup();
  });

  it('ignores non-YouTube tabs when looking for initial connection', async () => {
    await fakeBrowser.tabs.create({
      id: 1,
      url: 'https://www.example.com/',
    });
    await fakeBrowser.tabs.create({
      id: 2,
      url: 'https://www.youtube.com/watch?v=xyz',
    });

    const onConnect = vi.fn();
    const cleanup = await setupTabConnector({ onConnect });

    expect(onConnect).toHaveBeenCalledOnce();
    expect(onConnect).toHaveBeenCalledWith(2);

    cleanup();
  });

  it('does not call onConnect when no YouTube tabs exist', async () => {
    await fakeBrowser.tabs.create({
      id: 1,
      url: 'https://www.example.com/',
    });

    const onConnect = vi.fn();
    const cleanup = await setupTabConnector({ onConnect });

    expect(onConnect).not.toHaveBeenCalled();

    cleanup();
  });

  it('does not call onConnect when no tabs exist at all', async () => {
    const onConnect = vi.fn();
    const cleanup = await setupTabConnector({ onConnect });

    expect(onConnect).not.toHaveBeenCalled();

    cleanup();
  });
});

describe('setupTabConnector - tab switching', () => {
  it('calls onConnect when user activates a YouTube tab', async () => {
    // Start with no YouTube tabs so initial connection does not fire
    const onConnect = vi.fn();
    const cleanup = await setupTabConnector({ onConnect });

    // Now a YouTube tab is created and activated
    const tab = await fakeBrowser.tabs.create({
      url: 'https://www.youtube.com/watch?v=abc',
    });

    await fakeBrowser.tabs.onActivated.trigger({ tabId: tab.id!, windowId: 1 });

    expect(onConnect).toHaveBeenCalledOnce();
    expect(onConnect).toHaveBeenCalledWith(tab.id);

    cleanup();
  });

  it('does not call onConnect when user activates a non-YouTube tab', async () => {
    await fakeBrowser.tabs.create({
      id: 1,
      url: 'https://www.example.com/',
    });

    const onConnect = vi.fn();
    const cleanup = await setupTabConnector({ onConnect });

    onConnect.mockClear();

    await fakeBrowser.tabs.onActivated.trigger({ tabId: 1, windowId: 1 });

    expect(onConnect).not.toHaveBeenCalled();

    cleanup();
  });

  it('does not call onConnect again when switching to the already-connected tab', async () => {
    await fakeBrowser.tabs.create({
      id: 1,
      url: 'https://www.youtube.com/watch?v=abc',
    });

    const onConnect = vi.fn();
    const cleanup = await setupTabConnector({ onConnect });

    // Initial connection fires onConnect once
    expect(onConnect).toHaveBeenCalledOnce();
    onConnect.mockClear();

    // Activating the same tab should not fire again
    await fakeBrowser.tabs.onActivated.trigger({ tabId: 1, windowId: 1 });

    expect(onConnect).not.toHaveBeenCalled();

    cleanup();
  });

  it('calls onConnect when switching from one YouTube tab to another', async () => {
    await fakeBrowser.tabs.create({
      id: 1,
      url: 'https://www.youtube.com/watch?v=abc',
    });
    await fakeBrowser.tabs.create({
      id: 2,
      url: 'https://www.youtube.com/watch?v=xyz',
    });

    const onConnect = vi.fn();
    const cleanup = await setupTabConnector({ onConnect });

    // Connected to tab 1 (first YouTube tab found)
    expect(onConnect).toHaveBeenCalledWith(1);
    onConnect.mockClear();

    // Switch to tab 2
    await fakeBrowser.tabs.onActivated.trigger({ tabId: 2, windowId: 1 });

    expect(onConnect).toHaveBeenCalledOnce();
    expect(onConnect).toHaveBeenCalledWith(2);

    cleanup();
  });
});

describe('setupTabConnector - cleanup', () => {
  it('stops listening for tab activation after cleanup', async () => {
    await fakeBrowser.tabs.create({
      id: 1,
      url: 'https://www.youtube.com/watch?v=abc',
    });

    const onConnect = vi.fn();
    const cleanup = await setupTabConnector({ onConnect });

    cleanup();
    onConnect.mockClear();

    await fakeBrowser.tabs.onActivated.trigger({ tabId: 1, windowId: 1 });

    expect(onConnect).not.toHaveBeenCalled();
  });
});

describe('setupTabConnector - sendMessage', () => {
  it('calls sendMessage on initial connect', async () => {
    await fakeBrowser.tabs.create({
      id: 1,
      url: 'https://www.youtube.com/watch?v=abc',
    });

    const onConnect = vi.fn();
    const sendMessage = vi.fn();
    const cleanup = await setupTabConnector({ onConnect, sendMessage });

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith(1, { type: 'request-state' });

    cleanup();
  });

  it('calls sendMessage on tab switch', async () => {
    await fakeBrowser.tabs.create({
      id: 1,
      url: 'https://www.youtube.com/watch?v=abc',
    });

    const onConnect = vi.fn();
    const sendMessage = vi.fn();
    const cleanup = await setupTabConnector({ onConnect, sendMessage });

    sendMessage.mockClear();

    await fakeBrowser.tabs.onActivated.trigger({ tabId: 1, windowId: 1 });

    // Same tab was already connected, so no new sendMessage
    expect(sendMessage).not.toHaveBeenCalled();

    cleanup();
  });

  it('calls sendMessage when switching to a different YouTube tab', async () => {
    await fakeBrowser.tabs.create({
      id: 1,
      url: 'https://www.youtube.com/watch?v=abc',
    });
    await fakeBrowser.tabs.create({
      id: 2,
      url: 'https://www.youtube.com/watch?v=xyz',
    });

    const onConnect = vi.fn();
    const sendMessage = vi.fn();
    const cleanup = await setupTabConnector({ onConnect, sendMessage });

    sendMessage.mockClear();

    await fakeBrowser.tabs.onActivated.trigger({ tabId: 2, windowId: 1 });

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith(2, { type: 'request-state' });

    cleanup();
  });

  it('does not call sendMessage when no YouTube tabs exist', async () => {
    const onConnect = vi.fn();
    const sendMessage = vi.fn();
    const cleanup = await setupTabConnector({ onConnect, sendMessage });

    expect(sendMessage).not.toHaveBeenCalled();

    cleanup();
  });
});
