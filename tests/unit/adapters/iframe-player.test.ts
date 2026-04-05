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

describe('IFramePlayer.initialize', () => {
  it('subscribes to messages', () => {
    const deps = makeDeps();
    const player = new IFramePlayer(deps);
    player.initialize();
    expect(deps.subscribeToMessages).toHaveBeenCalledOnce();
    expect(deps.isSubscribed()).toBe(true);
  });

  it('posts a listening event on initialize', () => {
    const deps = makeDeps();
    const player = new IFramePlayer(deps);
    player.initialize();
    const listeningMsg = deps.postMessage.mock.calls
      .map((c) => JSON.parse(c[0]))
      .find((m) => m.event === 'listening');
    expect(listeningMsg).toEqual({
      event: 'listening',
      id: 'quoth-player',
      channel: 'widget',
    });
  });
});

describe('IFramePlayer state updates', () => {
  it('updates currentTimeMs when infoDelivery contains currentTime', () => {
    const deps = makeDeps();
    const player = new IFramePlayer(deps);
    player.initialize();
    deps.fireMessage(
      JSON.stringify({
        event: 'infoDelivery',
        info: { currentTime: 12.34 },
      }),
    );
    expect(player.getState().currentTimeMs).toBe(12340);
  });

  it('updates isPlaying from playerState=1 (playing)', () => {
    const deps = makeDeps();
    const player = new IFramePlayer(deps);
    player.initialize();
    deps.fireMessage(
      JSON.stringify({
        event: 'infoDelivery',
        info: { currentTime: 0, playerState: 1 },
      }),
    );
    expect(player.getState().isPlaying).toBe(true);
  });

  it('updates isPlaying=false from playerState=2 (paused)', () => {
    const deps = makeDeps();
    const player = new IFramePlayer(deps);
    player.initialize();
    deps.fireMessage(
      JSON.stringify({
        event: 'infoDelivery',
        info: { currentTime: 0, playerState: 2 },
      }),
    );
    expect(player.getState().isPlaying).toBe(false);
  });

  it('updates durationMs when infoDelivery contains duration', () => {
    const deps = makeDeps();
    const player = new IFramePlayer(deps);
    player.initialize();
    deps.fireMessage(
      JSON.stringify({
        event: 'infoDelivery',
        info: { currentTime: 0, duration: 120.5 },
      }),
    );
    expect(player.getState().durationMs).toBe(120500);
  });

  it('accepts object messages directly (not just JSON strings)', () => {
    const deps = makeDeps();
    const player = new IFramePlayer(deps);
    player.initialize();
    deps.fireMessage({
      event: 'infoDelivery',
      info: { currentTime: 7 },
    });
    expect(player.getState().currentTimeMs).toBe(7000);
  });

  it('ignores non-infoDelivery events', () => {
    const deps = makeDeps();
    const player = new IFramePlayer(deps);
    player.initialize();
    deps.fireMessage(JSON.stringify({ event: 'onReady' }));
    expect(player.getState().currentTimeMs).toBe(0);
  });

  it('preserves duration when a later infoDelivery omits it', () => {
    const deps = makeDeps();
    const player = new IFramePlayer(deps);
    player.initialize();
    deps.fireMessage(JSON.stringify({ event: 'infoDelivery', info: { duration: 99.9 } }));
    deps.fireMessage(JSON.stringify({ event: 'infoDelivery', info: { currentTime: 1 } }));
    expect(player.getState().durationMs).toBe(99900);
  });

  it('handles malformed JSON gracefully', () => {
    const deps = makeDeps();
    const player = new IFramePlayer(deps);
    player.initialize();
    expect(() => deps.fireMessage('not-json{{{')).not.toThrow();
    expect(player.getState().currentTimeMs).toBe(0);
  });
});
