import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, hexToRgbString } from '../../../src/core/settings';

describe('DEFAULT_SETTINGS', () => {
  it('defaults to Dracula red palette', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      bg: '#282a36',
      text: '#f8f8f2',
      peak: '#ff5555',
      current: '#ffffff',
      peakCap: 0.65,
    });
  });
});

describe('hexToRgbString', () => {
  it('converts a six-digit hex to "r, g, b"', () => {
    expect(hexToRgbString('#ff5555')).toBe('255, 85, 85');
  });

  it('converts lowercase and uppercase hex identically', () => {
    expect(hexToRgbString('#FF5555')).toBe('255, 85, 85');
    expect(hexToRgbString('#ff5555')).toBe('255, 85, 85');
  });

  it('handles hex without leading hash', () => {
    expect(hexToRgbString('ff5555')).toBe('255, 85, 85');
  });

  it('converts pure colors correctly', () => {
    expect(hexToRgbString('#ffffff')).toBe('255, 255, 255');
    expect(hexToRgbString('#000000')).toBe('0, 0, 0');
    expect(hexToRgbString('#ff0000')).toBe('255, 0, 0');
    expect(hexToRgbString('#00ff00')).toBe('0, 255, 0');
    expect(hexToRgbString('#0000ff')).toBe('0, 0, 255');
  });
});
