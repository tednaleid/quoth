/**
 * ABOUTME: Port interface for fetching transcript/caption data from a video source.
 * ABOUTME: Implementations: YouTubeCaptionAdapter (content script), FixtureTranscriptAdapter (tests).
 */
import type { TimedWord, CaptionTrack, VideoInfo } from '../core/types';

export interface TranscriptSource {
  getVideoInfo(videoId: string): Promise<VideoInfo | null>;
  getCaptionTracks(videoId: string): Promise<CaptionTrack[]>;
  fetchTranscript(captionTrack: CaptionTrack): Promise<TimedWord[]>;
}
