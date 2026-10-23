import { describe, it, expect } from 'vitest';
import {
  coversWholeFrame,
  effectStrengthAt,
  sharpenKernel,
  strengthOfSlice,
  strengthSliceCount,
  tintAlpha,
  VIGNETTE_INNER,
  vignetteAlpha,
} from './regionEffects';

describe('strength ramp', () => {
  const ramp = { strength: 0, strengthEnd: 1 };

  it('has one slice when the strength does not change', () => {
    expect(strengthSliceCount({ strength: 0.5 }, 3)).toBe(1);
    expect(strengthSliceCount({ strength: 0.5, strengthEnd: 0.5 }, 3)).toBe(1);
  });

  it('cuts a ramp into 0.2 s slices, at least 2 and at most 16', () => {
    expect(strengthSliceCount(ramp, 0.3)).toBe(2);
    expect(strengthSliceCount(ramp, 2)).toBe(10);
    expect(strengthSliceCount(ramp, 60)).toBe(16);
  });

  it('takes each slice at its middle', () => {
    expect(strengthOfSlice(ramp, 0, 4)).toBeCloseTo(0.125, 6);
    expect(strengthOfSlice(ramp, 3, 4)).toBeCloseTo(0.875, 6);
  });

  it('is constant inside a slice and steps at its edges', () => {
    // 2 s -> 10 slices of 0.2 s
    expect(effectStrengthAt(ramp, 0.05, 2)).toBe(effectStrengthAt(ramp, 0.15, 2));
    expect(effectStrengthAt(ramp, 0.25, 2)).toBeGreaterThan(effectStrengthAt(ramp, 0.15, 2));
    expect(effectStrengthAt(ramp, 2, 2)).toBeCloseTo(0.95, 6);
  });

  it('follows the easing curve', () => {
    const eased = { ...ramp, strengthEasing: 'ease-in-out' as const };
    expect(effectStrengthAt(eased, 0.1, 2)).toBeLessThan(effectStrengthAt(ramp, 0.1, 2));
  });

  it('keeps a falling ramp in range', () => {
    const falling = { strength: 1, strengthEnd: 0 };
    expect(effectStrengthAt(falling, 0, 2)).toBeCloseTo(0.95, 6);
    expect(effectStrengthAt(falling, 1.99, 2)).toBeCloseTo(0.05, 6);
  });
});

describe('new effect kinds', () => {
  it('always covers the whole frame for a vignette, and on request for others', () => {
    expect(coversWholeFrame({ kind: 'vignette' })).toBe(true);
    expect(coversWholeFrame({ kind: 'blur' })).toBe(false);
    expect(coversWholeFrame({ kind: 'blur', fullFrame: true })).toBe(true);
  });

  it('keeps the sharpen kernel normalized (sums to 1) and neutral at strength 0', () => {
    for (const s of [0, 0.3, 1]) expect(sharpenKernel(s).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(sharpenKernel(0)[4]).toBe(1);
    expect(sharpenKernel(1)[4]).toBeCloseTo(7, 9);
    expect(sharpenKernel(1)[1]).toBeCloseTo(-1.5, 9);
  });

  it('darkens a vignette only outside the inner radius, up to the strength at the corner', () => {
    expect(vignetteAlpha(0, 1)).toBe(0);
    expect(vignetteAlpha(VIGNETTE_INNER, 1)).toBe(0);
    expect(vignetteAlpha(1, 1)).toBe(1);
    expect(vignetteAlpha(1, 0.5)).toBe(0.5);
    expect(vignetteAlpha(0.7, 1)).toBeGreaterThan(vignetteAlpha(0.6, 1));
  });

  it('washes a tint at up to 60% opacity', () => {
    expect(tintAlpha(1)).toBeCloseTo(0.6, 9);
    expect(tintAlpha(0)).toBe(0);
  });
});
