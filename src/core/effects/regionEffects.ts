import { EffectKind, EffectSettings, EffectShape } from '@/types/timeline';
import { ProjectSettings } from '@/types/project';

/**
 * Region effects (blur, mosaic, black box) drawn on part of the frame.
 * Strengths are expressed relative to the project height so a project looks the same at any resolution.
 * Preview (canvas) and export (FFmpeg) both use these numbers.
 */

export const EFFECT_KIND_LABELS: Record<EffectKind, string> = {
  blur: 'Blur',
  pixelate: 'Mozaik',
  blackbox: 'Siyah Kutu',
};

export const EFFECT_SHAPE_LABELS: Record<EffectShape, string> = {
  rect: 'Dikdörtgen',
  ellipse: 'Elips',
};

export const MIN_REGION_SIZE = 8;
export const DEFAULT_EFFECT_SECONDS = 3;

/** Gaussian sigma in project pixels; strength 1 is about 5% of the frame height */
export const blurSigmaPx = (strength: number, projectHeight: number): number =>
  Math.max(0.5, clamp01(strength) * projectHeight * 0.05);

/** Mosaic block edge in project pixels; strength 1 is about 6% of the frame height */
export const pixelBlockPx = (strength: number, projectHeight: number): number =>
  Math.max(2, Math.round(clamp01(strength) * projectHeight * 0.06));

/** Sigma of the soft edge; 0 means a hard edge. Based on the unscaled region so it does not change while the region is scaled. */
export const featherSigmaPx = (feather: number, width: number, height: number): number =>
  clamp01(feather) * Math.min(width, height) * 0.25;

/** Sigma of the blurred background that fills the frame behind a clip */
export const backdropSigmaPx = (strength: number, projectHeight: number): number =>
  Math.max(2, clamp01(strength) * projectHeight * 0.06);

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export const DEFAULT_STRENGTH: Record<EffectKind, number> = {
  blur: 0.5,
  pixelate: 0.35,
  blackbox: 1,
};

/** A new effect covering the middle 40% of the frame */
export const defaultEffect = (
  project: Pick<ProjectSettings, 'width' | 'height'>,
  kind: EffectKind,
  shape: EffectShape = 'rect'
): EffectSettings => ({
  kind,
  shape,
  strength: DEFAULT_STRENGTH[kind],
  feather: kind === 'blur' ? 0.15 : 0,
  width: Math.round(project.width * 0.4),
  height: Math.round(project.height * 0.4),
});

/** Keeps every value in its valid range; the region may be larger than the frame but not absurdly so */
export const clampEffect = (
  effect: EffectSettings,
  project: Pick<ProjectSettings, 'width' | 'height'>
): EffectSettings => ({
  ...effect,
  strength: clamp01(effect.strength),
  feather: clamp01(effect.feather),
  width: Math.round(Math.min(project.width * 3, Math.max(MIN_REGION_SIZE, effect.width))),
  height: Math.round(Math.min(project.height * 3, Math.max(MIN_REGION_SIZE, effect.height))),
});
