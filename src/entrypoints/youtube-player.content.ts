/**
 * ABOUTME: Runs in YouTube's main world to control the video player.
 * ABOUTME: Receives seek commands from the isolated-world content script via postMessage.
 */

export default defineContentScript({
  matches: ['*://*.youtube.com/watch*'],
  world: 'MAIN',
  main() {
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;

      if (event.data?.type === 'quoth-seek') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const player = document.querySelector('#movie_player') as any;
        if (player?.seekTo) {
          player.seekTo(event.data.timeSeconds, true);
          player.playVideo();
        }
      }
    });
  },
});
