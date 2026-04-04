import { extractVideoId } from '../core/youtube';

export default defineContentScript({
  matches: ['*://*.youtube.com/watch*'],
  main() {
    const videoId = extractVideoId(window.location.href);
    console.log('[quoth] Content script loaded. Video ID:', videoId);
  },
});
