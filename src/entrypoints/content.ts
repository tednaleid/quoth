import { extractVideoInfo, extractCaptionTracks } from '../adapters/youtube/innertube';
import { parseJson3Captions } from '../core/caption-parser';
import { extractVideoId } from '../core/youtube';
import type { ContentMessage, SidePanelMessage } from '../messages';

const INNERTUBE_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const ANDROID_CONTEXT = {
  client: {
    clientName: 'ANDROID',
    clientVersion: '20.10.38',
  },
};
const ANDROID_UA = 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)';

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

    // Fetch player response via Innertube ANDROID client (works without page cookies)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async function fetchPlayerResponse(videoId: string): Promise<any> {
      const response = await fetch(INNERTUBE_URL, {
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

      const playerResponse = await fetchPlayerResponse(videoId);
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
