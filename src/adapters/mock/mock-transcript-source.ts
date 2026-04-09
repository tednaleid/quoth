/**
 * ABOUTME: Test adapter that returns fixture data without network calls.
 * ABOUTME: Implements TranscriptSource port for use in unit and integration tests.
 */
import type { TranscriptSource, VideoMetadata } from '../../ports/transcript-source';
import type { CaptionTrack, Chapter, TimedWord } from '../../core/types';

export class FixtureTranscriptSource implements TranscriptSource {
  constructor(
    private metadata: VideoMetadata,
    private words: TimedWord[],
  ) {}

  async getVideoMetadata(_videoId: string): Promise<VideoMetadata> {
    return this.metadata;
  }

  async fetchTranscript(_captionTrack: CaptionTrack): Promise<TimedWord[]> {
    return this.words;
  }

  async fetchChapters(_videoId: string): Promise<Chapter[]> {
    return [];
  }
}
