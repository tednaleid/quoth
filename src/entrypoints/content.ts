import { YouTubeTranscriptSource } from '../adapters/youtube/transcript-source';
import { extractVideoId } from '../core/youtube';
import type { ContentMessage, SidePanelMessage } from '../messages';

export default defineContentScript({
  matches: ['*://*.youtube.com/watch*'],
  main() {
    let currentVideoId: string | null = null;
    let timeUpdateInterval: ReturnType<typeof setInterval> | null = null;

    function getYouTubePlayer(): HTMLVideoElement | null {
      return document.querySelector('video.html5-main-video') as HTMLVideoElement | null;
    }

    // Seek via the main-world player script (uses YouTube's seekTo API)
    function seekYouTubePlayer(timeSeconds: number) {
      window.postMessage({ type: 'quoth-seek', timeSeconds }, '*');
    }

    function sendMessage(message: ContentMessage) {
      browser.runtime.sendMessage(message).catch(() => {});
    }

    const transcriptSource = new YouTubeTranscriptSource();

    function startTimeUpdates() {
      stopTimeUpdates();
      timeUpdateInterval = setInterval(() => {
        const player = getYouTubePlayer();
        if (!player) return;
        sendMessage({
          type: 'time-update',
          currentTimeMs: Math.round(player.currentTime * 1000),
          isPlaying: !player.paused,
        });
      }, 250);
    }

    function stopTimeUpdates() {
      if (timeUpdateInterval) {
        clearInterval(timeUpdateInterval);
        timeUpdateInterval = null;
      }
    }

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

      startTimeUpdates();
    }

    browser.runtime.onMessage.addListener((message: SidePanelMessage) => {
      if (message.type === 'seek-to') {
        seekYouTubePlayer(message.timeMs / 1000);
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
