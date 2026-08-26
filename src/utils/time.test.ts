import { describe, it, expect } from 'vitest';
import { formatTimecode, clampTime, snapToFrame } from './time';

describe('Time Utils', () => {
  it('formats timecode correctly without hours', () => {
    expect(formatTimecode(0, 30)).toBe('00:00:00');
    expect(formatTimecode(65.5, 30)).toBe('01:05:15');
  });

  it('formats timecode correctly with hours', () => {
    expect(formatTimecode(3665.2, 30)).toBe('01:01:05:06');
  });

  it('clamps time properly', () => {
    expect(clampTime(-5, 0, 100)).toBe(0);
    expect(clampTime(120, 0, 100)).toBe(100);
    expect(clampTime(50.12345, 0, 100)).toBe(50.123);
  });

  it('snaps time to frame boundary', () => {
    const fps = 30;
    const frameDuration = 1 / fps; // 0.0333...
    expect(snapToFrame(0.01, fps)).toBe(0);
    expect(snapToFrame(0.025, fps)).toBeCloseTo(frameDuration, 3);
  });
});
