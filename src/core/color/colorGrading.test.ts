import { describe, it, expect } from 'vitest';
import {
  NEUTRAL_GRADING,
  isNeutralGrading,
  clampGrading,
  canvasFilter,
  ffmpegEqFilter,
  COLOR_PRESETS,
} from './colorGrading';

describe('colorGrading', () => {
  it('treats missing and default values as neutral', () => {
    expect(isNeutralGrading(undefined)).toBe(true);
    expect(isNeutralGrading(NEUTRAL_GRADING)).toBe(true);
    expect(isNeutralGrading({ brightness: 0.1, contrast: 1, saturation: 1 })).toBe(false);
  });

  it('emits no filter for a neutral clip', () => {
    expect(canvasFilter(undefined)).toBe('none');
    expect(ffmpegEqFilter(NEUTRAL_GRADING)).toBe('');
  });

  it('builds the canvas filter (brightness is multiplicative) and the FFmpeg eq filter (additive)', () => {
    const g = { brightness: 0.2, contrast: 1.2, saturation: 0.5 };
    expect(canvasFilter(g)).toBe('brightness(1.200) contrast(1.200) saturate(0.500)');
    expect(ffmpegEqFilter(g)).toBe('eq=brightness=0.200:contrast=1.200:saturation=0.500');
  });

  it('clamps values to the eq ranges', () => {
    const g = clampGrading({ brightness: 5, contrast: -1, saturation: 9 });
    expect(g).toEqual({ brightness: 1, contrast: 0, saturation: 3 });
  });

  it('ships a black and white preset that removes saturation and an original preset that is neutral', () => {
    expect(COLOR_PRESETS.find((p) => p.id === 'bw')!.grading.saturation).toBe(0);
    expect(isNeutralGrading(COLOR_PRESETS.find((p) => p.id === 'original')!.grading)).toBe(true);
  });
});
