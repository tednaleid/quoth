/**
 * ABOUTME: Port interface for detecting video pages and navigation events.
 * ABOUTME: Implementations: YouTubePageAdapter (content script), MockPageAdapter (tests).
 */
export interface PageDetector {
  getCurrentVideoId(): string | null;
  onVideoChange(callback: (videoId: string | null) => void): () => void;
}
