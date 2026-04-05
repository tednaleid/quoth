/**
 * ABOUTME: Pure state machine for handling ContentMessages in the side panel.
 * ABOUTME: No browser APIs -- maps messages to TranscriptState transitions.
 */

import type { TimedWord, VideoInfo } from './types';
import type { WordSegment } from './playback-sync';
import {
  findActiveWordIndex,
  findActiveSegmentIndex,
  groupWordsIntoSegments,
} from './playback-sync';
import type { ContentMessage } from '../messages';

const SEGMENT_GAP_MS = 2000;

export interface TranscriptState {
  videoInfo: VideoInfo | null;
  words: TimedWord[];
  segments: WordSegment[];
  activeWordIndex: number;
  activeSegmentIndex: number;
  currentTimeMs: number;
  status: string;
}

export function createInitialState(): TranscriptState {
  return {
    videoInfo: null,
    words: [],
    segments: [],
    activeWordIndex: -1,
    activeSegmentIndex: -1,
    currentTimeMs: 0,
    status: 'Open a YouTube video to see its transcript.',
  };
}

export function handleMessage(state: TranscriptState, message: ContentMessage): TranscriptState {
  switch (message.type) {
    case 'video-detected':
      return { ...state, videoInfo: message.videoInfo, status: 'Loading captions...' };

    case 'captions-loaded': {
      const words = message.words;
      const segments = groupWordsIntoSegments(words, SEGMENT_GAP_MS);
      return { ...state, words, segments, status: `${words.length} words loaded` };
    }

    case 'captions-error':
      return { ...state, status: `Error: ${message.error}` };

    case 'video-left':
      return createInitialState();

    case 'time-update':
      if (state.words.length === 0) return { ...state, currentTimeMs: message.currentTimeMs };
      return {
        ...state,
        currentTimeMs: message.currentTimeMs,
        activeWordIndex: findActiveWordIndex(state.words, message.currentTimeMs),
        activeSegmentIndex: findActiveSegmentIndex(state.segments, message.currentTimeMs),
      };
  }
}
