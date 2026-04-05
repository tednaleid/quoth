/**
 * ABOUTME: YouTubeTranscriptSource adapter - fetches video info and captions via the Innertube ANDROID API.
 * ABOUTME: Implements the TranscriptSource port using dependency-injected fetch for testability.
 */
import type { TranscriptSource } from '../../ports/transcript-source';
import type { VideoInfo, CaptionTrack, TimedWord } from '../../core/types';
import { extractVideoInfo, extractCaptionTracks } from './innertube';
import { parseJson3Captions } from '../../core/caption-parser';

const INNERTUBE_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const ANDROID_CONTEXT = {
  client: {
    clientName: 'ANDROID',
    clientVersion: '20.10.38',
  },
};
const ANDROID_UA = 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)';

export class YouTubeTranscriptSource implements TranscriptSource {
  constructor(private fetchFn: typeof fetch = fetch) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async fetchPlayerResponse(videoId: string): Promise<any> {
    const response = await this.fetchFn(INNERTUBE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': ANDROID_UA,
      },
      body: JSON.stringify({
        context: ANDROID_CONTEXT,
        videoId,
      }),
    });
    if (!response.ok) return null;
    return response.json();
  }

  async getVideoInfo(videoId: string): Promise<VideoInfo | null> {
    const playerResponse = await this.fetchPlayerResponse(videoId);
    if (!playerResponse) return null;
    return extractVideoInfo(playerResponse);
  }

  async getCaptionTracks(videoId: string): Promise<CaptionTrack[]> {
    const playerResponse = await this.fetchPlayerResponse(videoId);
    if (!playerResponse) return [];
    return extractCaptionTracks(playerResponse);
  }

  async fetchTranscript(captionTrack: CaptionTrack): Promise<TimedWord[]> {
    const response = await this.fetchFn(captionTrack.baseUrl);
    if (!response.ok) return [];
    const json3 = await response.json();
    return parseJson3Captions(json3);
  }
}
