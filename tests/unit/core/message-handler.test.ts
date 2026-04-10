import { describe, it, expect } from 'vitest';
import { createInitialState, handleMessage } from '../../../src/core/message-handler';
import type { TranscriptState } from '../../../src/core/message-handler';
import type { ContentMessage } from '../../../src/messages';
import type { TimedWord, VideoInfo } from '../../../src/core/types';

const videoInfo: VideoInfo = {
  videoId: 'abc123',
  title: 'Test Video',
  channelName: 'Test Channel',
  durationMs: 60000,
};

const words: TimedWord[] = [
  { text: 'hello', start: 1000, end: 1500, original: 'hello' },
  { text: 'world', start: 1500, end: 2000, original: 'world' },
  { text: 'foo', start: 5000, end: 5500, original: 'foo' },
  { text: 'bar', start: 5500, end: 6000, original: 'bar' },
];

describe('createInitialState', () => {
  it('returns the default initial state', () => {
    const state = createInitialState();
    expect(state.videoInfo).toBeNull();
    expect(state.words).toEqual([]);
    expect(state.segments).toEqual([]);
    expect(state.currentTimeMs).toBe(0);
    expect(state.status).toBe('Open a YouTube video to see its transcript.');
  });
});

describe('handleMessage', () => {
  describe('video-detected', () => {
    it('sets videoInfo and status to loading', () => {
      const state = createInitialState();
      const message: ContentMessage = {
        type: 'video-detected',
        videoId: 'abc123',
        videoInfo,
        captionTracks: [],
      };
      const next = handleMessage(state, message);
      expect(next.videoInfo).toEqual(videoInfo);
      expect(next.status).toBe('Loading captions...');
    });

    it('does not mutate the original state', () => {
      const state = createInitialState();
      const message: ContentMessage = {
        type: 'video-detected',
        videoId: 'abc123',
        videoInfo,
        captionTracks: [],
      };
      handleMessage(state, message);
      expect(state.videoInfo).toBeNull();
    });
  });

  describe('captions-loaded', () => {
    it('sets words, computes segments, and updates status with word count', () => {
      const state = createInitialState();
      const message: ContentMessage = {
        type: 'captions-loaded',
        videoId: 'abc123',
        words,
      };
      const next = handleMessage(state, message);
      expect(next.words).toEqual(words);
      expect(next.status).toBe('4 words loaded');
      expect(next.segments.length).toBeGreaterThan(0);
    });

    it('groups short word list into a single segment', () => {
      const state = createInitialState();
      const message: ContentMessage = {
        type: 'captions-loaded',
        videoId: 'abc123',
        words,
      };
      const next = handleMessage(state, message);
      // 4 words is too few to split into multiple segments
      expect(next.segments).toHaveLength(1);
      expect(next.segments[0].startIndex).toBe(0);
      expect(next.segments[0].endIndex).toBe(3);
    });

    it('sets segments to empty when words is empty', () => {
      const state = createInitialState();
      const message: ContentMessage = {
        type: 'captions-loaded',
        videoId: 'abc123',
        words: [],
      };
      const next = handleMessage(state, message);
      expect(next.segments).toEqual([]);
    });
  });

  describe('captions-error', () => {
    it('sets error status message', () => {
      const state = createInitialState();
      const message: ContentMessage = {
        type: 'captions-error',
        videoId: 'abc123',
        error: 'Network failure',
      };
      const next = handleMessage(state, message);
      expect(next.status).toBe('Error: Network failure');
    });

    it('does not change other state fields', () => {
      const state: TranscriptState = {
        ...createInitialState(),
        videoInfo,
        words,
      };
      const message: ContentMessage = {
        type: 'captions-error',
        videoId: 'abc123',
        error: 'oops',
      };
      const next = handleMessage(state, message);
      expect(next.videoInfo).toEqual(videoInfo);
      expect(next.words).toEqual(words);
    });
  });

  describe('video-left', () => {
    it('resets all state to initial values', () => {
      const loaded: TranscriptState = {
        videoInfo,
        words,
        segments: [{ startIndex: 0, endIndex: 3, startTime: 1000, endTime: 6000 }],
        chapters: [],
        currentTimeMs: 5000,
        status: '4 words loaded',
      };
      const message: ContentMessage = { type: 'video-left' };
      const next = handleMessage(loaded, message);
      expect(next.videoInfo).toBeNull();
      expect(next.words).toEqual([]);
      expect(next.segments).toEqual([]);
      expect(next.currentTimeMs).toBe(0);
      expect(next.status).toBe('Open a YouTube video to see its transcript.');
    });
  });

  describe('time-update', () => {
    it('updates currentTimeMs when words are loaded', () => {
      const captionsLoadedState = handleMessage(createInitialState(), {
        type: 'captions-loaded',
        videoId: 'abc123',
        words,
      });
      const message: ContentMessage = {
        type: 'time-update',
        currentTimeMs: 1600,
        isPlaying: true,
      };
      const next = handleMessage(captionsLoadedState, message);
      expect(next.currentTimeMs).toBe(1600);
    });

    it('does not change state when words array is empty', () => {
      const state = createInitialState();
      const message: ContentMessage = {
        type: 'time-update',
        currentTimeMs: 5000,
        isPlaying: true,
      };
      const next = handleMessage(state, message);
      expect(next.currentTimeMs).toBe(0);
    });

    it('does not change words or segments', () => {
      const captionsLoadedState = handleMessage(createInitialState(), {
        type: 'captions-loaded',
        videoId: 'abc123',
        words,
      });
      const segmentsBefore = captionsLoadedState.segments;
      const message: ContentMessage = {
        type: 'time-update',
        currentTimeMs: 5200,
        isPlaying: false,
      };
      const next = handleMessage(captionsLoadedState, message);
      expect(next.words).toEqual(words);
      expect(next.segments).toEqual(segmentsBefore);
    });
  });
});
