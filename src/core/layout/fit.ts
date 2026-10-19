import { FitMode } from '@/types/timeline';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where footage of size `srcW` x `srcH` is drawn inside a `dstW` x `dstH` frame (frame origin at 0,0).
 * stretch fills the frame ignoring the aspect ratio, contain fits inside (bars), cover fills and crops.
 * `cover` may extend beyond the frame; callers clip to the frame.
 */
export const fitRect = (fit: FitMode, srcW: number, srcH: number, dstW: number, dstH: number): Rect => {
  if (fit === 'stretch' || srcW <= 0 || srcH <= 0) return { x: 0, y: 0, w: dstW, h: dstH };

  const scale = fit === 'contain' ? Math.min(dstW / srcW, dstH / srcH) : Math.max(dstW / srcW, dstH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h };
};

/** The part of `rect` that lies inside the frame 0,0,dstW,dstH (what is actually visible) */
export const clipToFrame = (rect: Rect, dstW: number, dstH: number): Rect => {
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const x1 = Math.min(dstW, rect.x + rect.w);
  const y1 = Math.min(dstH, rect.y + rect.h);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
};

/**
 * FFmpeg filters that bring any input to exactly `width` x `height` the same way `fitRect` draws it.
 * contain pads with transparency so the bars show what is behind the clip.
 */
export const ffmpegFitFilter = (fit: FitMode | undefined, width: number, height: number): string => {
  if (fit === 'contain') {
    return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black@0`;
  }
  if (fit === 'cover') {
    return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
  }
  return `scale=${width}:${height}`;
};
