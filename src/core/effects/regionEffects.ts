import { EffectKind, EffectSettings, EffectShape } from '@/types/timeline';
import { ProjectSettings } from '@/types/project';
import { applyEasing } from '@/core/animation/keyframes';

/**
 * Region effects (blur, mosaic, black box) drawn on part of the frame.
 * Strengths are expressed relative to the project height so a project looks the same at any resolution.
 * Preview (canvas) and export (FFmpeg) both use these numbers.
 */

export const EFFECT_KIND_LABELS: Record<EffectKind, string> = {
  blur: 'Blur',
  pixelate: 'Mozaik',
  blackbox: 'Siyah Kutu',
  tint: 'Renk Tonu',
  sharpen: 'Keskinleştir',
  vignette: 'Vinyet',
};

export const EFFECT_KINDS: EffectKind[] = ['blur', 'pixelate', 'blackbox', 'tint', 'sharpen', 'vignette'];

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
  tint: 0.5,
  sharpen: 0.5,
  vignette: 0.6,
};

export const DEFAULT_TINT_COLOR = '#ff9f40';

/**
 * Splits a strength ramp at `fraction` (0..1) of the clip so both halves continue the same curve:
 * the left half ends at the strength of the split point and the right half starts there.
 */
export const splitEffectRamp = (effect: EffectSettings, fraction: number): { left: EffectSettings; right: EffectSettings } => {
  if (effect.strengthEnd === undefined) return { left: effect, right: effect };
  const mid = clamp01(effect.strength + (effect.strengthEnd - effect.strength) * applyEasing(fraction, effect.strengthEasing ?? 'linear'));
  return {
    left: { ...effect, strengthEnd: mid },
    right: { ...effect, strength: mid },
  };
};

/** Whether the effect covers the whole frame instead of a region (the vignette always does) */
export const coversWholeFrame = (effect: Pick<EffectSettings, 'kind' | 'fullFrame'>): boolean =>
  effect.kind === 'vignette' || effect.fullFrame === true;

/** Kinds whose strength means something (a black box is always black) */
export const kindHasStrength = (kind: EffectKind): boolean => kind !== 'blackbox';

/** Opacity of the tint layer; strength 1 is a 60% color wash */
export const tintAlpha = (strength: number): number => clamp01(strength) * 0.6;

/** 3x3 sharpen kernel (row by row); strength 1 adds 1.5 times the difference to a 4-neighbor average */
export const sharpenKernel = (strength: number): number[] => {
  const a = clamp01(strength) * 1.5;
  return [0, -a, 0, -a, 1 + 4 * a, -a, 0, -a, 0];
};

/** Distance from the frame center (as a share of the half diagonal) where the vignette starts to darken */
export const VIGNETTE_INNER = 0.35;

/** Darkness of the vignette at distance `r` (0 = center, 1 = corner): zero inside VIGNETTE_INNER, then a quadratic ramp */
export const vignetteAlpha = (r: number, strength: number): number => {
  const t = clamp01((r - VIGNETTE_INNER) / (1 - VIGNETTE_INNER));
  return t * t * clamp01(strength);
};

/** A strength ramp is played in steps of this length: FFmpeg filters cannot change their strength per frame */
export const STRENGTH_STEP_SECONDS = 0.2;
export const MAX_STRENGTH_STEPS = 16;

/** Number of constant-strength slices of an effect clip: 1 when the strength does not change */
export const strengthSliceCount = (effect: Pick<EffectSettings, 'strength' | 'strengthEnd'>, duration: number): number => {
  if (effect.strengthEnd === undefined || Math.abs(effect.strengthEnd - effect.strength) < 0.005) return 1;
  return Math.min(MAX_STRENGTH_STEPS, Math.max(2, Math.ceil(duration / STRENGTH_STEP_SECONDS)));
};

/** Strength of slice `index` of `count`, taken at the middle of the slice */
export const strengthOfSlice = (
  effect: Pick<EffectSettings, 'strength' | 'strengthEnd' | 'strengthEasing'>,
  index: number,
  count: number
): number => {
  if (count <= 1 || effect.strengthEnd === undefined) return clamp01(effect.strength);
  const eased = applyEasing((index + 0.5) / count, effect.strengthEasing ?? 'linear');
  return clamp01(effect.strength + (effect.strengthEnd - effect.strength) * eased);
};

/** Strength at clip-local time (piecewise constant, the same steps the export renders) */
export const effectStrengthAt = (
  effect: Pick<EffectSettings, 'strength' | 'strengthEnd' | 'strengthEasing'>,
  localTime: number,
  duration: number
): number => {
  const count = strengthSliceCount(effect, duration);
  if (count === 1) return clamp01(effect.strength);
  const index = Math.min(count - 1, Math.max(0, Math.floor((localTime / Math.max(duration, 1e-6)) * count)));
  return strengthOfSlice(effect, index, count);
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
  ...(kind === 'vignette' ? { fullFrame: true } : {}),
  ...(kind === 'tint' ? { color: DEFAULT_TINT_COLOR } : {}),
});

/** Keeps every value in its valid range; the region may be larger than the frame but not absurdly so */
export const clampEffect = (
  effect: EffectSettings,
  project: Pick<ProjectSettings, 'width' | 'height'>
): EffectSettings => ({
  ...effect,
  strength: clamp01(effect.strength),
  feather: clamp01(effect.feather),
  ...(effect.strengthEnd !== undefined ? { strengthEnd: clamp01(effect.strengthEnd) } : {}),
  // A vignette covers the whole frame, so an inverted region means nothing
  ...(effect.kind === 'vignette' ? { fullFrame: true, invert: false } : {}),
  width: Math.round(Math.min(project.width * 3, Math.max(MIN_REGION_SIZE, effect.width))),
  height: Math.round(Math.min(project.height * 3, Math.max(MIN_REGION_SIZE, effect.height))),
});
