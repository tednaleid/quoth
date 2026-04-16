/**
 * ABOUTME: Pure helper to detect seeks from consecutive time-update deltas.
 * ABOUTME: Used by sidepanel to re-enable autoscroll when the user jumps in the video.
 */

export const DEFAULT_SEEK_THRESHOLD_MS = 750;

export function isSeek(
  previousTimeMs: number | null,
  currentTimeMs: number,
  deltaThresholdMs = DEFAULT_SEEK_THRESHOLD_MS,
): boolean {
  if (previousTimeMs === null) return false;
  return Math.abs(currentTimeMs - previousTimeMs) > deltaThresholdMs;
}
