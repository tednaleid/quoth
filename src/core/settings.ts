/**
 * ABOUTME: User-customizable highlight palette + peak cap settings.
 * ABOUTME: Pure data only; storage and UI live in adapters.
 */

export interface HighlightSettings {
  /** Sidepanel background color (hex). */
  bg: string;
  /** Default word text color (hex). */
  text: string;
  /** Fade-horizon peak color (hex). Converted to rgb() at render time. */
  peak: string;
  /** Text color of the word currently being spoken (hex). */
  current: string;
  /** Maximum horizon intensity, 0.0-1.0. Caps peak so text stays readable. */
  peakCap: number;
  /** Total future reach of the fade horizon, in seconds. All knees scale from this. */
  horizonSeconds: number;
}

/** Dracula-inspired red palette, shipped as the out-of-the-box default. */
export const DEFAULT_SETTINGS: HighlightSettings = {
  bg: '#282a36',
  text: '#e7e7e2',
  peak: '#ff5555',
  current: '#ffffff',
  peakCap: 0.53,
  horizonSeconds: 7.5,
};

/**
 * Converts a hex color to an "r, g, b" string suitable for use inside
 * rgba(..., alpha) via a CSS custom property.
 */
export function hexToRgbString(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}
