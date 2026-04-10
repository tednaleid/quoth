/**
 * ABOUTME: Pure state machine for handling ContentMessages in the side panel.
 * ABOUTME: No browser APIs -- maps messages to TranscriptState transitions.
 */

import type { TimedWord, VideoInfo, Chapter } from './types';
import type { WordSegment } from './playback-sync';
import { findActiveSegmentIndex, groupWordsIntoSegments } from './playback-sync';
import type { ContentMessage } from '../messages';

const SEGMENT_GAP_MS = 2000;

export interface TranscriptState {
  videoInfo: VideoInfo | null;
  words: TimedWord[];
  segments: WordSegment[];
  chapters: Chapter[];
  currentTimeMs: number;
  activeSegmentIndex: number;
  status: string;
}

export function createInitialState(): TranscriptState {
  return {
    videoInfo: null,
    words: [],
    segments: [],
    chapters: [],
    currentTimeMs: 0,
    activeSegmentIndex: -1,
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
      const chapters = message.chapters ?? [];
      return { ...state, words, segments, chapters, status: `${words.length} words loaded` };
    }

    case 'captions-error':
      return { ...state, status: `Error: ${message.error}` };

    case 'video-left':
      return createInitialState();

    case 'time-update':
      if (state.words.length === 0) return state;
      return {
        ...state,
        currentTimeMs: message.currentTimeMs,
        activeSegmentIndex: findActiveSegmentIndex(state.segments, message.currentTimeMs),
      };
  }
}
