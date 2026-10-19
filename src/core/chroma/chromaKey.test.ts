import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CHROMA_KEY,
  applyChromaKey,
  clampChroma,
  ffmpegChromakeyFilter,
  hexToRgb,
  keyAlpha,
  rgbToUV,
} from './chromaKey';

describe('chroma key math', () => {
  it('parses hex colors and computes U/V like FFmpeg', () => {
    expect(hexToRgb('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
    expect(hexToRgb('#102030')).toEqual({ r: 16, g: 32, b: 48 });
    const green = rgbToUV(0, 255, 0);
    expect(green.u).toBeLessThan(128); // green has low blue difference
    expect(green.v).toBeLessThan(128);
    const gray = rgbToUV(128, 128, 128);
    expect(gray.u).toBe(128);
    expect(gray.v).toBe(128);
  });

  it('is fully transparent on the key color and opaque far away from it', () => {
    const key = rgbToUV(0, 255, 0);
    expect(keyAlpha(key.u, key.v, key.u, key.v, 0.3, 0.1)).toBe(0);

    const red = rgbToUV(255, 0, 0);
    expect(keyAlpha(red.u, red.v, key.u, key.v, 0.3, 0.1)).toBe(1);
  });

  it('is a hard edge without blend and soft with it', () => {
    const key = rgbToUV(0, 255, 0);
    const slightlyOff = rgbToUV(40, 255, 40);
    const hard = keyAlpha(slightlyOff.u, slightlyOff.v, key.u, key.v, 0.05, 0);
    expect([0, 1]).toContain(hard);

    // a color a little outside similarity falls inside the blend band
    let found = false;
    for (let g = 255; g > 60 && !found; g -= 5) {
      const px = rgbToUV(0, g, 0);
      const a = keyAlpha(px.u, px.v, key.u, key.v, 0.15, 0.3);
      if (a > 0.05 && a < 0.95) found = true;
    }
    expect(found).toBe(true);
  });

  it('keys RGBA data in place and keeps existing alpha', () => {
    // green, red, half-transparent green
    const data = new Uint8ClampedArray([0, 255, 0, 255, 255, 0, 0, 255, 0, 255, 0, 128]);
    applyChromaKey(data, DEFAULT_CHROMA_KEY);
    expect(data[3]).toBe(0);
    expect(data[7]).toBe(255);
    expect(data[11]).toBe(0);
  });

  it('clamps parameters and falls back to green for an invalid color', () => {
    expect(clampChroma({ color: 'red', similarity: 9, blend: -2 })).toEqual({
      color: '#00ff00',
      similarity: 1,
      blend: 0,
    });
    expect(clampChroma({ color: '#ABCDEF', similarity: 0, blend: 0.5 })).toEqual({
      color: '#abcdef',
      similarity: 0.01,
      blend: 0.5,
    });
  });

  it('builds the FFmpeg filter', () => {
    expect(ffmpegChromakeyFilter({ color: '#00ff00', similarity: 0.3, blend: 0.1 })).toBe(
      'chromakey=color=0x00ff00:similarity=0.300:blend=0.100'
    );
  });
});
