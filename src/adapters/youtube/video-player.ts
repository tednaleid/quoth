/**
 * ABOUTME: YouTube video player adapter for the content script isolated world.
 * ABOUTME: Wraps DOM polling and postMessage seeking behind the VideoPlayer port.
 */
import type { VideoPlayer, VideoPlayerState } from '../../ports/video-player';

interface VideoPlayerDeps {
  getVideoElement: () => HTMLVideoElement | null;
  postSeek: (timeSeconds: number) => void;
}

export class YouTubeVideoPlayer implements VideoPlayer {
  constructor(private deps: VideoPlayerDeps) {}

  getState(): VideoPlayerState {
    const video = this.deps.getVideoElement();
    if (!video) return { currentTimeMs: 0, isPlaying: false, durationMs: 0 };
    return {
      currentTimeMs: Math.round(video.currentTime * 1000),
      isPlaying: !video.paused,
      durationMs: Math.round(video.duration * 1000),
    };
  }

  seekTo(timeMs: number): void {
    this.deps.postSeek(timeMs / 1000);
  }

  onTimeUpdate(callback: (state: VideoPlayerState) => void): () => void {
    // 100ms poll for smooth fade-horizon sweep in the sidepanel.
    const interval = setInterval(() => {
      if (!this.deps.getVideoElement()) return;
      callback(this.getState());
    }, 100);
    return () => clearInterval(interval);
  }
}
