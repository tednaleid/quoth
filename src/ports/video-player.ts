/**
 * ABOUTME: Port interface for interacting with the video player.
 * ABOUTME: Implementations: YouTubePlayerAdapter (content script), MockPlayerAdapter (tests).
 */
export interface VideoPlayerState {
  currentTimeMs: number;
  isPlaying: boolean;
  durationMs: number;
}

export interface VideoPlayer {
  getState(): VideoPlayerState;
  seekTo(timeMs: number): void;
  onTimeUpdate(callback: (state: VideoPlayerState) => void): () => void;
}
