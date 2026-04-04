import { describe, it, expect } from 'vitest';
import { formatTime } from '../../../src/core/time-format';

describe('formatTime', () => {
  it('formats 0ms as 0:00', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  it('formats 23000ms as 0:23', () => {
    expect(formatTime(23000)).toBe('0:23');
  });

  it('formats 125000ms as 2:05', () => {
    expect(formatTime(125000)).toBe('2:05');
  });

  it('formats 3661000ms as 1:01:01', () => {
    expect(formatTime(3661000)).toBe('1:01:01');
  });

  it('formats 60000ms as 1:00', () => {
    expect(formatTime(60000)).toBe('1:00');
  });
});
