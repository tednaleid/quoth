<script lang="ts">
  import { parseWatchParams } from '../../core/watch-url';

  const params = parseWatchParams(window.location.search);
</script>

<main>
  {#if !params.videoId}
    <p class="placeholder">No video id provided. Add <code>?v=VIDEO_ID</code> to the URL.</p>
  {:else}
    <p class="placeholder">Loading video {params.videoId}…</p>
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
</style>
