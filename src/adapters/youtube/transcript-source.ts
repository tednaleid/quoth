/**
 * ABOUTME: YouTubeTranscriptSource adapter - fetches video info and captions via the Innertube ANDROID API.
 * ABOUTME: Implements the TranscriptSource port using dependency-injected fetch for testability.
 */
import type { TranscriptSource, VideoMetadata } from '../../ports/transcript-source';
import type { CaptionTrack, TimedWord } from '../../core/types';
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
  // Wrap fetch in an arrow function so calls don't lose the window binding.
  // Chrome's fetch throws "Illegal invocation" when `this` isn't window.
  private readonly fetchFn: typeof fetch;

  constructor(fetchFn: typeof fetch = (...args) => fetch(...args)) {
    this.fetchFn = fetchFn;
  }

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

  async getVideoMetadata(videoId: string): Promise<VideoMetadata> {
    const playerResponse = await this.fetchPlayerResponse(videoId);
    if (!playerResponse) return { videoInfo: null, captionTracks: [] };
    return {
      videoInfo: extractVideoInfo(playerResponse),
      captionTracks: extractCaptionTracks(playerResponse),
    };
  }

  async fetchTranscript(captionTrack: CaptionTrack): Promise<TimedWord[]> {
    const response = await this.fetchFn(captionTrack.baseUrl);
    if (!response.ok) return [];
    const json3 = await response.json();
    return parseJson3Captions(json3);
  }
}
