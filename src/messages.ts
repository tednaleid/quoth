/**
 * ABOUTME: Message types for communication between content script, background, and side panel.
 * ABOUTME: All inter-context communication uses these typed messages.
 */

import type { TimedWord, VideoInfo, CaptionTrack } from './core/types';

// Content script -> Side panel (via background)
export type ContentMessage =
  | { type: 'video-detected'; videoId: string; videoInfo: VideoInfo; captionTracks: CaptionTrack[] }
  | { type: 'video-left' }
  | { type: 'captions-loaded'; videoId: string; words: TimedWord[] }
  | { type: 'captions-error'; videoId: string; error: string }
  | { type: 'time-update'; currentTimeMs: number; isPlaying: boolean };

// Side panel -> Content script (via background)
export type SidePanelMessage = { type: 'seek-to'; timeMs: number } | { type: 'request-state' };

// Messages sent FROM the embed content script TO the watch page
export type EmbedMessage = {
  type: 'embed-time-update';
  currentTimeMs: number;
  isPlaying: boolean;
  durationMs: number;
};

// Messages sent FROM the watch page TO the embed content script
export type WatchPageMessage = { type: 'embed-seek'; timeMs: number };
