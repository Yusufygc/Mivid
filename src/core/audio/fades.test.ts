import { describe, it, expect } from 'vitest';
import { fadeGain, previewVolume, maxFade, buildFadeFilters } from './fades';

describe('fadeGain', () => {
  it('ramps linearly in and out and is 1 in between', () => {
    expect(fadeGain(0, 10, 2, 2)).toBe(0);
    expect(fadeGain(1, 10, 2, 2)).toBe(0.5);
    expect(fadeGain(5, 10, 2, 2)).toBe(1);
    expect(fadeGain(9, 10, 2, 2)).toBe(0.5);
    expect(fadeGain(10, 10, 2, 2)).toBe(0);
  });

  it('is 1 without fades and never leaves 0..1', () => {
    expect(fadeGain(0, 10, 0, 0)).toBe(1);
    expect(fadeGain(-1, 10, 2, 0)).toBe(0);
    expect(fadeGain(11, 10, 0, 2)).toBe(0);
  });

  it('uses the lower of overlapping fades', () => {
    expect(fadeGain(1, 2, 2, 2)).toBe(0.5);
  });
});

describe('previewVolume', () => {
  const audio = { volume: 0.8, muted: false, fadeIn: 2, fadeOut: 0 };

  it('multiplies volume with the fade', () => {
    expect(previewVolume(audio, false, 1, 10)).toBeCloseTo(0.4);
    expect(previewVolume(audio, false, 5, 10)).toBeCloseTo(0.8);
  });

  it('is silent when the clip or track is muted', () => {
    expect(previewVolume({ ...audio, muted: true }, false, 5, 10)).toBe(0);
    expect(previewVolume(audio, true, 5, 10)).toBe(0);
  });

  it('caps at 1 for HTMLMediaElement and defaults when audio settings are missing', () => {
    expect(previewVolume({ ...audio, volume: 2, fadeIn: 0 }, false, 5, 10)).toBe(1);
    expect(previewVolume(undefined, false, 5, 10)).toBe(1);
  });
});

describe('maxFade / buildFadeFilters', () => {
  it('leaves room for the other fade', () => {
    expect(maxFade(10, 3)).toBe(7);
    expect(maxFade(2, 5)).toBe(0);
  });

  it('builds afade filters relative to the clip start', () => {
    expect(buildFadeFilters({ volume: 1, muted: false, fadeIn: 1, fadeOut: 2 }, 10)).toBe(
      'afade=t=in:st=0:d=1.00,afade=t=out:st=8.00:d=2.00,'
    );
    expect(buildFadeFilters({ volume: 1, muted: false, fadeIn: 0, fadeOut: 0 }, 10)).toBe('');
    expect(buildFadeFilters(undefined, 10)).toBe('');
  });
});
