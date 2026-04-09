/**
 * ABOUTME: Port interface for fetching transcript/caption data from a video source.
 * ABOUTME: Implementations: YouTubeCaptionAdapter (content script), FixtureTranscriptAdapter (tests).
 */
import type { TimedWord, CaptionTrack, VideoInfo, Chapter } from '../core/types';

export interface VideoMetadata {
  videoInfo: VideoInfo | null;
  captionTracks: CaptionTrack[];
}

export interface TranscriptSource {
  getVideoMetadata(videoId: string): Promise<VideoMetadata>;
  fetchTranscript(captionTrack: CaptionTrack): Promise<TimedWord[]>;
  fetchChapters(videoId: string): Promise<Chapter[]>;
}
