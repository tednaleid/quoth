/**
 * ABOUTME: Port interface for caching parsed transcript data keyed by videoId.
 * ABOUTME: Implementations: ChromeStorageLocalCache (prod), in-memory/mock (tests).
 */
import type { TimedWord, VideoInfo } from '../core/types';

export interface CachedTranscript {
  videoInfo: VideoInfo;
  words: TimedWord[];
}

export interface CacheStore {
  get(videoId: string): Promise<CachedTranscript | null>;
  set(videoId: string, data: CachedTranscript): Promise<void>;
}
