import { describe, it, expect } from 'vitest';
import { extractVideoId } from '../../../src/core/youtube';

describe('extractVideoId', () => {
  it('should extract video ID from standard YouTube URL', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=YwZR6tc7qYg')).toBe('YwZR6tc7qYg');
  });

  it('should extract video ID when other params present', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=abc123&t=120')).toBe('abc123');
  });

  it('should extract video ID from youtube.com without www', () => {
    expect(extractVideoId('https://youtube.com/watch?v=abc123')).toBe('abc123');
  });

  it('should return null for non-YouTube URLs', () => {
    expect(extractVideoId('https://www.example.com/watch?v=abc123')).toBeNull();
  });

  it('should return null for YouTube URLs without video ID', () => {
    expect(extractVideoId('https://www.youtube.com/')).toBeNull();
  });

  it('should return null for YouTube channel pages', () => {
    expect(extractVideoId('https://www.youtube.com/channel/UCxyz')).toBeNull();
  });
});
