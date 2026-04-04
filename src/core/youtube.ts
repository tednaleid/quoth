/**
 * ABOUTME: YouTube URL parsing utilities.
 * ABOUTME: Extracts video IDs from YouTube watch page URLs.
 */

export function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const isYouTube = parsed.hostname === 'www.youtube.com' || parsed.hostname === 'youtube.com';

    if (!isYouTube) return null;
    if (!parsed.pathname.startsWith('/watch')) return null;

    return parsed.searchParams.get('v') ?? null;
  } catch {
    return null;
  }
}
