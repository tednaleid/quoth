/**
 * ABOUTME: Message types for communication between the watch page and the embed content script.
 * ABOUTME: The only inter-context message channel in the extension.
 */

// Messages sent FROM the embed content script TO the watch page
export type EmbedMessage = {
  type: 'embed-time-update';
  currentTimeMs: number;
  isPlaying: boolean;
  durationMs: number;
};

// Messages sent FROM the watch page TO the embed content script
export type WatchPageMessage = { type: 'embed-seek'; timeMs: number };
