export default defineContentScript({
  matches: ['*://*.youtube.com/watch*'],
  main() {
    console.log('[quoth] Content script loaded on YouTube video page');
  },
});
