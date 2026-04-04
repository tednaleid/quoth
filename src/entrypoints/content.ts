import { extractVideoId } from '../core/youtube';
import {
  extractVideoInfo,
  extractCaptionTracks,
  extractPlayerResponseFromHtml,
} from '../adapters/youtube/innertube';
import { parseJson3Captions } from '../core/caption-parser';
import type { ContentMessage, SidePanelMessage } from '../messages';

export default defineContentScript({
  matches: ['*://*.youtube.com/watch*'],
  main() {
    let currentVideoId: string | null = null;
    let timeUpdateInterval: ReturnType<typeof setInterval> | null = null;

    function getYouTubePlayer(): HTMLVideoElement | null {
      return document.querySelector('video.html5-main-video') as HTMLVideoElement | null;
    }

    function sendMessage(message: ContentMessage) {
      browser.runtime.sendMessage(message).catch(() => {
        // Side panel may not be open
      });
    }

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
      if (videoId === currentVideoId) return;
      currentVideoId = videoId;

      if (!videoId) {
        sendMessage({ type: 'video-left' });
        stopTimeUpdates();
        return;
      }

      const playerResponse = extractPlayerResponseFromHtml(document.documentElement.innerHTML);
      const videoInfo = playerResponse ? extractVideoInfo(playerResponse) : null;
      const captionTracks = playerResponse ? extractCaptionTracks(playerResponse) : [];

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
          const response = await fetch(englishTrack.baseUrl);
          const json3 = await response.json();
          const words = parseJson3Captions(json3);
          sendMessage({ type: 'captions-loaded', videoId, words });
        } catch (err) {
          sendMessage({
            type: 'captions-error',
            videoId,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      startTimeUpdates();
    }

    browser.runtime.onMessage.addListener((message: SidePanelMessage) => {
      if (message.type === 'seek-to') {
        const player = getYouTubePlayer();
        if (player) {
          player.currentTime = message.timeMs / 1000;
        }
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
