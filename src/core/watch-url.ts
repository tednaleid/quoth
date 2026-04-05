/**
 * ABOUTME: Parses watch-page URL parameters (v, t) into structured values.
 * ABOUTME: Handles YouTube's "t=147s" format and defaults.
 */

export interface WatchParams {
  videoId: string | null;
  initialTimeMs: number;
}

export function parseWatchParams(queryString: string): WatchParams {
  const normalized = queryString.startsWith('?') ? queryString : '?' + queryString;
  const params = new URLSearchParams(normalized);
  const videoId = params.get('v');
  const tRaw = params.get('t');
  let initialTimeMs = 0;
  if (tRaw) {
    const stripped = tRaw.endsWith('s') ? tRaw.slice(0, -1) : tRaw;
    const seconds = parseInt(stripped, 10);
    if (!isNaN(seconds)) initialTimeMs = seconds * 1000;
  }
  return { videoId, initialTimeMs };
}
