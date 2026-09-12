/**
 * ABOUTME: YouTube content script (isolated world) - wires adapters to extension messaging.
 * ABOUTME: Instantiates TranscriptSource and VideoPlayer adapters, handles page navigation events.
 */
import { YouTubeTranscriptSource } from '../adapters/youtube/transcript-source';
import { YouTubeVideoPlayer } from '../adapters/youtube/video-player';
import { extractVideoId } from '../core/youtube';
import { shouldReplayCached } from '../core/replay';
import type { TimedWord, VideoInfo, Chapter, CaptionTrack } from '../core/types';
import type { ContentMessage, SidePanelMessage } from '../messages';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  main() {
    // Expose extension URL on the DOM so Playwright smoke tests can discover it
    document.documentElement.dataset.quothExtUrl = browser.runtime.getURL('/');

    let currentVideoId: string | null = null;
    let stopTimeUpdates: (() => void) | null = null;

    // In-memory replay cache: the last fully-loaded transcript for this tab.
    // Tab switches send `request-state`; replaying the cache answers instantly
    // with zero network instead of refetching metadata + captions + chapters.
    let loaded: {
      videoId: string;
      videoInfo: VideoInfo | null;
      captionTracks: CaptionTrack[];
      words: TimedWord[] | null;
      chapters: Chapter[];
      error: string | null;
    } | null = null;

    function sendMessage(message: ContentMessage) {
      // "Receiving end does not exist" is expected when the side panel is closed -- swallow it silently
      browser.runtime.sendMessage(message).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('Receiving end does not exist')) {
          console.warn('[quoth] runtime.sendMessage failed:', msg);
        }
      });
    }

    const transcriptSource = new YouTubeTranscriptSource();

    const player = new YouTubeVideoPlayer({
      getVideoElement: () =>
        document.querySelector('video.html5-main-video') as HTMLVideoElement | null,
      postSeek: (timeSeconds) => window.postMessage({ type: 'quoth-seek', timeSeconds }, '*'),
    });

    async function handleVideoPage() {
      const videoId = extractVideoId(window.location.href);
      if (!videoId || videoId === currentVideoId) return;
      currentVideoId = videoId;

      const { videoInfo, captionTracks } = await transcriptSource.getVideoMetadata(videoId);

      if (videoInfo) {
        sendMessage({
          type: 'video-detected',
          videoId,
          videoInfo,
          captionTracks,
        });
      }

      const englishTrack = captionTracks.find((t) => t.languageCode.startsWith('en'));
      if (englishTrack) {
        try {
          const [words, chapters] = await Promise.all([
            transcriptSource.fetchTranscript(englishTrack),
            transcriptSource.fetchChapters(videoId),
          ]);
          loaded = { videoId, videoInfo, captionTracks, words, chapters, error: null };
          sendMessage({ type: 'captions-loaded', videoId, words, chapters });
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          loaded = { videoId, videoInfo, captionTracks, words: null, chapters: [], error };
          sendMessage({
            type: 'captions-error',
            videoId,
            error,
          });
        }
      } else {
        loaded = {
          videoId,
          videoInfo,
          captionTracks,
          words: null,
          chapters: [],
          error: 'No English captions available',
        };
        sendMessage({
          type: 'captions-error',
          videoId,
          error: 'No English captions available',
        });
      }

      if (stopTimeUpdates) stopTimeUpdates();
      stopTimeUpdates = player.onTimeUpdate((state) => {
        sendMessage({
          type: 'time-update',
          currentTimeMs: state.currentTimeMs,
          isPlaying: state.isPlaying,
        });
      });
    }

    function replayLoaded(): void {
      if (!loaded) return;
      const { videoId, videoInfo, captionTracks, words, chapters, error } = loaded;
      if (videoInfo) {
        sendMessage({ type: 'video-detected', videoId, videoInfo, captionTracks });
      }
      if (words) {
        sendMessage({ type: 'captions-loaded', videoId, words, chapters });
      } else {
        sendMessage({ type: 'captions-error', videoId, error: error ?? 'Unknown error' });
      }
    }

    browser.runtime.onMessage.addListener((message: SidePanelMessage) => {
      if (message.type === 'seek-to') {
        player.seekTo(message.timeMs);
      }
      if (message.type === 'request-state') {
        // Fast path: same video already loaded in this tab -- replay instantly.
        if (
          shouldReplayCached(
            loaded?.videoId ?? null,
            loaded !== null,
            extractVideoId(window.location.href),
          )
        ) {
          replayLoaded();
        } else {
          loaded = null;
          currentVideoId = null;
          handleVideoPage();
        }
      }
    });

    handleVideoPage();

    document.addEventListener('yt-navigate-finish', () => {
      handleVideoPage();
    });

    // Listen for page-open requests via postMessage (used by smoke tests in Firefox
    // where Playwright cannot navigate directly to moz-extension:// URLs).
    // Uses retry because content scripts can initialize before the background
    // script registers its onMessage listener (Firefox bug #1369841).
    window.addEventListener('message', async (e) => {
      if (e.data?.type === 'quoth-open-page') {
        const page = e.data.page;
        if (page !== 'sidepanel' && page !== 'popout') return;
        for (let attempt = 0; attempt < 10; attempt++) {
          try {
            await browser.runtime.sendMessage({ type: 'open-page', page });
            return;
          } catch {
            await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
          }
        }
      }
    });
  },
});
