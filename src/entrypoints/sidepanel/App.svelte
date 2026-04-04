<script lang="ts">
  const title = 'Quoth';
</script>

<main>
  <header>
    <h1>{title}</h1>
  </header>
  <div class="transcript-placeholder">
    <p>Open a YouTube video to see its transcript.</p>
  </div>
  <footer class="status-bar">
    <span>Ready</span>
  </footer>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    height: 100vh;
    font-family: system-ui, -apple-system, sans-serif;
    color: #e0e0e0;
    background: #1a1a2e;
  }

  header {
    padding: 8px 12px;
    border-bottom: 1px solid #2a2a4a;
  }

  h1 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  .transcript-placeholder {
    flex: 1;
    padding: 12px;
    color: #888;
  }

  .status-bar {
    padding: 4px 12px;
    font-size: 11px;
    color: #666;
    border-top: 1px solid #2a2a4a;
  }
</style>
