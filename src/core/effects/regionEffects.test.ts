import { describe, it, expect } from 'vitest';
import {
  blurSigmaPx,
  pixelBlockPx,
  featherSigmaPx,
  backdropSigmaPx,
  defaultEffect,
  clampEffect,
  MIN_REGION_SIZE,
} from './regionEffects';
import { fitRect, clipToFrame, ffmpegFitFilter } from '@/core/layout/fit';

const project = { width: 1920, height: 1080 };

describe('region effect numbers', () => {
  it('scales strength with the project height', () => {
    expect(blurSigmaPx(1, 1080)).toBeCloseTo(54);
    expect(blurSigmaPx(0.5, 1080)).toBeCloseTo(27);
    expect(blurSigmaPx(0.5, 540)).toBeCloseTo(13.5);
    expect(blurSigmaPx(0, 1080)).toBe(0.5); // never zero, a blur effect always does something
  });

  it('derives mosaic block size, feather and backdrop sigma', () => {
    expect(pixelBlockPx(1, 1080)).toBe(65);
    expect(pixelBlockPx(0, 1080)).toBe(2);
    expect(featherSigmaPx(0, 400, 300)).toBe(0);
    expect(featherSigmaPx(1, 400, 300)).toBe(75);
    expect(backdropSigmaPx(0.5, 1080)).toBeCloseTo(32.4);
    expect(backdropSigmaPx(0, 1080)).toBe(2);
  });
});

describe('defaultEffect / clampEffect', () => {
  it('covers the middle 40% of the frame', () => {
    const e = defaultEffect(project, 'blur');
    expect(e).toMatchObject({ kind: 'blur', shape: 'rect', width: 768, height: 432 });
    expect(e.feather).toBeGreaterThan(0);
    expect(defaultEffect(project, 'blackbox')).toMatchObject({ strength: 1, feather: 0 });
    expect(defaultEffect(project, 'pixelate', 'ellipse').shape).toBe('ellipse');
  });

  it('keeps values in range', () => {
    const e = clampEffect({ kind: 'blur', shape: 'rect', strength: 4, feather: -1, width: 1, height: 99999 }, project);
    expect(e.strength).toBe(1);
    expect(e.feather).toBe(0);
    expect(e.width).toBe(MIN_REGION_SIZE);
    expect(e.height).toBe(1080 * 3);
  });
});

describe('fitRect', () => {
  it('stretch ignores the aspect ratio', () => {
    expect(fitRect('stretch', 1000, 500, 1920, 1080)).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
  });

  it('contain letterboxes a wide source in a vertical frame', () => {
    const r = fitRect('contain', 1920, 1080, 1080, 1920);
    expect(r.w).toBeCloseTo(1080);
    expect(r.h).toBeCloseTo(607.5);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo((1920 - 607.5) / 2);
  });

  it('cover fills the frame and overflows on one axis', () => {
    const r = fitRect('cover', 1920, 1080, 1080, 1920);
    expect(r.h).toBeCloseTo(1920);
    expect(r.w).toBeCloseTo(3413.33, 1);
    expect(r.x).toBeLessThan(0);
    const visible = clipToFrame(r, 1080, 1920);
    expect(visible).toEqual({ x: 0, y: 0, w: 1080, h: 1920 });
  });

  it('falls back to stretch when the source size is unknown', () => {
    expect(fitRect('contain', 0, 0, 1280, 720)).toEqual({ x: 0, y: 0, w: 1280, h: 720 });
  });
});

describe('ffmpegFitFilter', () => {
  it('maps each mode to the matching filters', () => {
    expect(ffmpegFitFilter(undefined, 1280, 720)).toBe('scale=1280:720');
    expect(ffmpegFitFilter('stretch', 1280, 720)).toBe('scale=1280:720');
    expect(ffmpegFitFilter('contain', 1080, 1920)).toBe(
      'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black@0'
    );
    expect(ffmpegFitFilter('cover', 1080, 1920)).toBe(
      'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920'
    );
  });
});
