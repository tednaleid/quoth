/**
 * ABOUTME: YouTube content script (isolated world) - wires adapters to extension messaging.
 * ABOUTME: Instantiates TranscriptSource and VideoPlayer adapters, handles page navigation events.
 */
import { YouTubeTranscriptSource } from '../adapters/youtube/transcript-source';
import { YouTubeVideoPlayer } from '../adapters/youtube/video-player';
import { extractVideoId } from '../core/youtube';
import type { ContentMessage, SidePanelMessage } from '../messages';

export default defineContentScript({
  matches: ['*://*.youtube.com/watch*'],
  main() {
    let currentVideoId: string | null = null;
    let stopTimeUpdates: (() => void) | null = null;

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

      const englishTrack = captionTracks.find((t) => t.languageCode === 'en');
      if (englishTrack) {
        try {
          const words = await transcriptSource.fetchTranscript(englishTrack);
          sendMessage({ type: 'captions-loaded', videoId, words });
        } catch (err) {
          sendMessage({
            type: 'captions-error',
            videoId,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      } else {
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

    browser.runtime.onMessage.addListener((message: SidePanelMessage) => {
      if (message.type === 'seek-to') {
        player.seekTo(message.timeMs);
      }
      if (message.type === 'request-state') {
        currentVideoId = null;
        handleVideoPage();
      }
    });

    handleVideoPage();

    document.addEventListener('yt-navigate-finish', () => {
      handleVideoPage();
    });
  },
});
