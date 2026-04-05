/**
 * ABOUTME: Tests for the IFramePlayer adapter (YouTube IFrame Player API protocol).
 * ABOUTME: Verifies postMessage command format and infoDelivery parsing.
 */
import { describe, it, expect, vi } from 'vitest';
import { IFramePlayer } from '../../../src/adapters/youtube/iframe-player';

function makeDeps() {
  const postMessage = vi.fn<(msg: string) => void>();
  let messageHandler: ((data: unknown) => void) | null = null;
  const subscribeToMessages = vi.fn((handler: (data: unknown) => void) => {
    messageHandler = handler;
    return () => {
      messageHandler = null;
    };
  });
  return {
    postMessage,
    subscribeToMessages,
    fireMessage: (data: unknown) => messageHandler?.(data),
    isSubscribed: () => messageHandler !== null,
  };
}

describe('IFramePlayer.seekTo', () => {
  it('posts a seekTo command with seconds and allowSeekAhead=true', () => {
    const deps = makeDeps();
    const player = new IFramePlayer(deps);
    player.seekTo(5000);
    expect(deps.postMessage).toHaveBeenCalledOnce();
    const sent = JSON.parse(deps.postMessage.mock.calls[0][0]);
    expect(sent).toEqual({
      event: 'command',
      func: 'seekTo',
      args: [5, true],
      id: 'quoth-player',
      channel: 'widget',
    });
  });

  it('converts milliseconds to seconds with fractional values', () => {
    const deps = makeDeps();
    const player = new IFramePlayer(deps);
    player.seekTo(1500);
    const sent = JSON.parse(deps.postMessage.mock.calls[0][0]);
    expect(sent.args[0]).toBe(1.5);
  });
});
