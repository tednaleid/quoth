/**
 * ABOUTME: Message types for communication between content script, background, and side panel.
 * ABOUTME: All inter-context communication uses these typed messages.
 */

import type { TimedWord, VideoInfo, CaptionTrack, Chapter } from './core/types';

// Content script -> Side panel (via background)
export type ContentMessage =
  | { type: 'video-detected'; videoId: string; videoInfo: VideoInfo; captionTracks: CaptionTrack[] }
  | { type: 'video-left' }
  | { type: 'captions-loaded'; videoId: string; words: TimedWord[]; chapters?: Chapter[] }
  | { type: 'captions-error'; videoId: string; error: string }
  | { type: 'time-update'; currentTimeMs: number; isPlaying: boolean };

// Side panel -> Content script (via background)
export type SidePanelMessage = { type: 'seek-to'; timeMs: number } | { type: 'request-state' };

// Content script -> Background (internal commands)
export type InternalMessage = { type: 'open-page'; page: 'sidepanel' | 'popout'; tabId: number };
