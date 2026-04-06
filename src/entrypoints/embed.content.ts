/**
 * ABOUTME: Content script injected into youtube.com/embed/* iframes to poll video state.
 * ABOUTME: Bridges direct DOM access (currentTime, seek) to the extension's watch page via runtime messaging.
 */
import type { EmbedMessage, WatchPageMessage } from '../messages';

export default defineContentScript({
  matches: ['*://*.youtube.com/embed/*'],
  allFrames: true,
  runAt: 'document_start',
  main() {
    // Firefox sets document.referrer to "" for navigations from moz-extension:// pages
    // because moz-extension:// is not an allowed referrer scheme. YouTube's embed player
    // checks document.referrer via JavaScript and rejects embeds with Error 153 when it's
    // empty. Fix: inject a main-world script that overrides document.referrer BEFORE
    // YouTube's player JS reads it. Only override when empty (normal embeds have one).
    const isFirefox = browser.runtime.getURL('').startsWith('moz-extension://');
    if (isFirefox && document.referrer === '') {
      const s = document.createElement('script');
      s.textContent =
        "Object.defineProperty(document,'referrer',{get:()=>'https://www.youtube.com/',configurable:true})";
      (document.documentElement || document).appendChild(s);
      s.remove();
    }

    function findVideo(): HTMLVideoElement | null {
      return document.querySelector('video');
    }

    // Poll the video element and broadcast state via runtime messaging.
    // The watch page listens for these via browser.runtime.onMessage.
    setInterval(() => {
      const video = findVideo();
      if (!video) return;
      const msg: EmbedMessage = {
        type: 'embed-time-update',
        currentTimeMs: Math.round(video.currentTime * 1000),
        isPlaying: !video.paused,
        durationMs: Math.round((video.duration || 0) * 1000),
      };
      browser.runtime.sendMessage(msg).catch((err) => {
        const m = err instanceof Error ? err.message : String(err);
        if (!m.includes('Receiving end does not exist')) {
          console.warn('[quoth embed] sendMessage failed:', m);
        }
      });
    }, 250);

    browser.runtime.onMessage.addListener((message: WatchPageMessage) => {
      if (message.type === 'embed-seek') {
        const video = findVideo();
        if (video) video.currentTime = message.timeMs / 1000;
      }
    });
  },
});
