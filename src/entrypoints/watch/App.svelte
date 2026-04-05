<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { parseWatchParams } from '../../core/watch-url';
  import { IFramePlayer } from '../../adapters/youtube/iframe-player';

  const params = parseWatchParams(window.location.search);

  let iframeEl: HTMLIFrameElement | undefined = $state();
  let player: IFramePlayer | null = null;
  let currentTimeMs = $state(0);
  let isPlaying = $state(false);

  const embedUrl = params.videoId
    ? `https://www.youtube.com/embed/${params.videoId}?enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}&start=${Math.floor(params.initialTimeMs / 1000)}`
    : '';

  onMount(() => {
    if (!iframeEl || !params.videoId) return;

    player = new IFramePlayer({
      postMessage: (msg) => iframeEl!.contentWindow?.postMessage(msg, '*'),
      subscribeToMessages: (handler) => {
        const listener = (e: MessageEvent) => {
          if (e.source === iframeEl!.contentWindow) handler(e.data);
        };
        window.addEventListener('message', listener);
        return () => window.removeEventListener('message', listener);
      },
    });
    player.initialize();
    player.onTimeUpdate((state) => {
      currentTimeMs = state.currentTimeMs;
      isPlaying = state.isPlaying;
    });
  });

  onDestroy(() => {
    player?.destroy();
  });
</script>

<main>
  {#if !params.videoId}
    <p class="placeholder">No video id provided. Add <code>?v=VIDEO_ID</code> to the URL.</p>
  {:else}
    <div class="video-wrap">
      <iframe
        bind:this={iframeEl}
        src={embedUrl}
        title="YouTube video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
      ></iframe>
    </div>
    <div class="status">
      time: {(currentTimeMs / 1000).toFixed(1)}s · {isPlaying ? 'playing' : 'paused'}
    </div>
  {/if}
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    height: 100vh;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
    color: #e0e0e0;
    background: #1a1a2e;
    font-size: 13px;
  }
  .placeholder {
    padding: 24px;
    color: #888;
  }
  .video-wrap {
    position: relative;
    width: 100%;
    max-width: 90vw;
    aspect-ratio: 16 / 9;
    margin: 0 auto;
    background: #000;
  }
  .video-wrap iframe {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
  }
  .status {
    padding: 8px 12px;
    color: #888;
    font-size: 11px;
    border-bottom: 1px solid #2a2a4a;
  }
</style>
