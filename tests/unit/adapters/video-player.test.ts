/**
 * ABOUTME: Tests for the YouTubeVideoPlayer adapter.
 * ABOUTME: Verifies DOM polling, postMessage seeking, and interval-based time updates.
 */
import { describe, it, expect, vi } from 'vitest';
import { YouTubeVideoPlayer } from '../../../src/adapters/youtube/video-player';

function makePlayer(videoElement: HTMLVideoElement | null = null) {
  const postSeek = vi.fn();
  const getVideoElement = vi.fn().mockReturnValue(videoElement);
  const player = new YouTubeVideoPlayer({ getVideoElement, postSeek });
  return { player, postSeek, getVideoElement };
}

function mockVideo(
  overrides: Partial<Pick<HTMLVideoElement, 'currentTime' | 'paused' | 'duration'>> = {},
) {
  return {
    currentTime: 0,
    paused: true,
    duration: 0,
    ...overrides,
  } as HTMLVideoElement;
}

describe('YouTubeVideoPlayer.getState', () => {
  it('returns zeroed state when no video element is present', () => {
    const { player } = makePlayer(null);
    expect(player.getState()).toEqual({ currentTimeMs: 0, isPlaying: false, durationMs: 0 });
  });

  it('converts currentTime from seconds to milliseconds and rounds', () => {
    const video = mockVideo({ currentTime: 5.6, paused: false, duration: 120.0 });
    const { player } = makePlayer(video);
    expect(player.getState().currentTimeMs).toBe(5600);
  });

  it('sets isPlaying to true when video is not paused', () => {
    const video = mockVideo({ paused: false });
    const { player } = makePlayer(video);
    expect(player.getState().isPlaying).toBe(true);
  });

  it('sets isPlaying to false when video is paused', () => {
    const video = mockVideo({ paused: true });
    const { player } = makePlayer(video);
    expect(player.getState().isPlaying).toBe(false);
  });

  it('converts duration from seconds to milliseconds and rounds', () => {
    const video = mockVideo({ duration: 120.7 });
    const { player } = makePlayer(video);
    expect(player.getState().durationMs).toBe(120700);
  });

  it('rounds fractional milliseconds', () => {
    const video = mockVideo({ currentTime: 5.6789, duration: 99.9994 });
    const { player } = makePlayer(video);
    const state = player.getState();
    expect(state.currentTimeMs).toBe(5679);
    expect(state.durationMs).toBe(99999);
  });
});

describe('YouTubeVideoPlayer.seekTo', () => {
  it('calls postSeek with time converted from milliseconds to seconds', () => {
    const { player, postSeek } = makePlayer();
    player.seekTo(5000);
    expect(postSeek).toHaveBeenCalledOnce();
    expect(postSeek).toHaveBeenCalledWith(5);
  });

  it('handles non-round millisecond values', () => {
    const { player, postSeek } = makePlayer();
    player.seekTo(1500);
    expect(postSeek).toHaveBeenCalledWith(1.5);
  });
});

describe('YouTubeVideoPlayer.onTimeUpdate', () => {
  it('calls callback with current state after 250ms', () => {
    vi.useFakeTimers();
    const video = mockVideo({ currentTime: 10.0, paused: false, duration: 60.0 });
    const { player } = makePlayer(video);
    const callback = vi.fn();

    const cleanup = player.onTimeUpdate(callback);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(250);
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith({
      currentTimeMs: 10000,
      isPlaying: true,
      durationMs: 60000,
    });

    cleanup();
    vi.useRealTimers();
  });

  it('calls callback repeatedly at 250ms intervals', () => {
    vi.useFakeTimers();
    const { player } = makePlayer(mockVideo());
    const callback = vi.fn();

    const cleanup = player.onTimeUpdate(callback);
    vi.advanceTimersByTime(750);
    expect(callback).toHaveBeenCalledTimes(3);

    cleanup();
    vi.useRealTimers();
  });

  it('stops calling callback after cleanup is called', () => {
    vi.useFakeTimers();
    const { player } = makePlayer(mockVideo());
    const callback = vi.fn();

    const cleanup = player.onTimeUpdate(callback);
    vi.advanceTimersByTime(250);
    expect(callback).toHaveBeenCalledTimes(1);

    cleanup();
    vi.advanceTimersByTime(250);
    expect(callback).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('skips callback when no video element is present', () => {
    vi.useFakeTimers();
    const { player } = makePlayer(null);
    const callback = vi.fn();

    const cleanup = player.onTimeUpdate(callback);
    vi.advanceTimersByTime(500);
    expect(callback).not.toHaveBeenCalled();

    cleanup();
    vi.useRealTimers();
  });

  it('returns a cleanup function', () => {
    vi.useFakeTimers();
    const { player } = makePlayer(mockVideo());
    const cleanup = player.onTimeUpdate(vi.fn());
    expect(typeof cleanup).toBe('function');
    cleanup();
    vi.useRealTimers();
  });
});
