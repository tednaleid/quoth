/**
 * ABOUTME: Formats millisecond timestamps into human-readable time strings.
 * ABOUTME: Used for transcript timestamp display and YouTube URL parameters.
 */
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const paddedSeconds = seconds.toString().padStart(2, '0');
  if (hours > 0) {
    const paddedMinutes = minutes.toString().padStart(2, '0');
    return `${hours}:${paddedMinutes}:${paddedSeconds}`;
  }
  return `${minutes}:${paddedSeconds}`;
}

export function timeToSeconds(ms: number): number {
  return Math.floor(ms / 1000);
}
