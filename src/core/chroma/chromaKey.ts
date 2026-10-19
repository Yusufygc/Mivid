import { ChromaKey } from '@/types/timeline';

/**
 * Chroma key (green screen). The math follows FFmpeg's `chromakey` filter so preview and export agree:
 * distance between the pixel's and the key color's U/V (BT.601 integer matrix), scaled to 0..1;
 * pixels closer than `similarity` become transparent, `blend` makes the edge soft.
 */

export const DEFAULT_CHROMA_KEY: ChromaKey = { color: '#00ff00', similarity: 0.3, blend: 0.1 };

export const CHROMA_PRESETS: Array<{ id: string; name: string; color: string }> = [
  { id: 'green', name: 'Yeşil', color: '#00ff00' },
  { id: 'blue', name: 'Mavi', color: '#0000ff' },
];

export const clampChroma = (key: ChromaKey): ChromaKey => ({
  color: /^#[0-9a-fA-F]{6}$/.test(key.color) ? key.color.toLowerCase() : DEFAULT_CHROMA_KEY.color,
  similarity: Math.min(1, Math.max(0.01, key.similarity)),
  blend: Math.min(1, Math.max(0, key.blend)),
});

export const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const value = parseInt(hex.replace('#', ''), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
};

/** U and V as FFmpeg's chromakey computes them for the key color (RGB_TO_U / RGB_TO_V) */
export const rgbToUV = (r: number, g: number, b: number): { u: number; v: number } => ({
  u: ((-38 * r - 74 * g + 112 * b + 128) >> 8) + 128,
  v: ((112 * r - 94 * g - 18 * b + 128) >> 8) + 128,
});

/** Opacity (0..1) of a pixel: 0 where it matches the key color, 1 where it is clearly different */
export const keyAlpha = (u: number, v: number, keyU: number, keyV: number, similarity: number, blend: number): number => {
  const du = u - keyU;
  const dv = v - keyV;
  const diff = Math.sqrt((du * du + dv * dv) / (255 * 255 * 2));

  if (blend > 0.0001) {
    const f = 1 - Math.min(1, Math.max(0, (diff - similarity) / blend));
    return 1 - f * f;
  }
  return diff > similarity ? 1 : 0;
};

/** Writes the key into the alpha channel of RGBA pixel data, in place */
export const applyChromaKey = (data: Uint8ClampedArray, key: ChromaKey): void => {
  const clamped = clampChroma(key);
  const { r, g, b } = hexToRgb(clamped.color);
  const { u: keyU, v: keyV } = rgbToUV(r, g, b);

  for (let i = 0; i < data.length; i += 4) {
    const { u, v } = rgbToUV(data[i], data[i + 1], data[i + 2]);
    const alpha = keyAlpha(u, v, keyU, keyV, clamped.similarity, clamped.blend);
    data[i + 3] = Math.round(data[i + 3] * alpha);
  }
};

/** The FFmpeg filter for the key */
export const ffmpegChromakeyFilter = (key: ChromaKey): string => {
  const clamped = clampChroma(key);
  return `chromakey=color=0x${clamped.color.slice(1)}:similarity=${clamped.similarity.toFixed(3)}:blend=${clamped.blend.toFixed(3)}`;
};
