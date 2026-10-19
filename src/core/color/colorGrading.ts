import { ColorGrading } from '@/types/timeline';

/**
 * Color adjustment of a clip.
 * brightness: -1..1 (0 = unchanged), contrast: 0..2 (1 = unchanged), saturation: 0..3 (1 = unchanged).
 * Same ranges as FFmpeg's `eq` filter, which does the export. The preview uses the canvas `filter`
 * property: contrast and saturation match, brightness is an approximation (multiplicative instead of additive).
 */
export const NEUTRAL_GRADING: ColorGrading = { brightness: 0, contrast: 1, saturation: 1 };

export const GRADING_LIMITS = {
  brightness: { min: -1, max: 1 },
  contrast: { min: 0, max: 2 },
  saturation: { min: 0, max: 3 },
} as const;

const EPS = 1e-6;

export const isNeutralGrading = (grading: ColorGrading | undefined): boolean =>
  !grading ||
  (Math.abs(grading.brightness) < EPS && Math.abs(grading.contrast - 1) < EPS && Math.abs(grading.saturation - 1) < EPS);

export const clampGrading = (grading: ColorGrading): ColorGrading => ({
  ...grading,
  brightness: Math.min(GRADING_LIMITS.brightness.max, Math.max(GRADING_LIMITS.brightness.min, grading.brightness)),
  contrast: Math.min(GRADING_LIMITS.contrast.max, Math.max(GRADING_LIMITS.contrast.min, grading.contrast)),
  saturation: Math.min(GRADING_LIMITS.saturation.max, Math.max(GRADING_LIMITS.saturation.min, grading.saturation)),
});

/** Value for `CanvasRenderingContext2D.filter`, or 'none' */
export const canvasFilter = (grading: ColorGrading | undefined): string => {
  if (isNeutralGrading(grading)) return 'none';
  const g = clampGrading(grading!);
  return `brightness(${(1 + g.brightness).toFixed(3)}) contrast(${g.contrast.toFixed(3)}) saturate(${g.saturation.toFixed(3)})`;
};

/** FFmpeg `eq` filter for the grading, or an empty string when nothing changes */
export const ffmpegEqFilter = (grading: ColorGrading | undefined): string => {
  if (isNeutralGrading(grading)) return '';
  const g = clampGrading(grading!);
  return `eq=brightness=${g.brightness.toFixed(3)}:contrast=${g.contrast.toFixed(3)}:saturation=${g.saturation.toFixed(3)}`;
};

export interface ColorPreset {
  id: string;
  name: string;
  grading: ColorGrading;
}

export const COLOR_PRESETS: ColorPreset[] = [
  { id: 'original', name: 'Orijinal', grading: NEUTRAL_GRADING },
  { id: 'vivid', name: 'Canlı', grading: { brightness: 0.02, contrast: 1.1, saturation: 1.45 } },
  { id: 'bright', name: 'Parlak', grading: { brightness: 0.12, contrast: 1.05, saturation: 1.1 } },
  { id: 'cinematic', name: 'Sinematik', grading: { brightness: -0.04, contrast: 1.25, saturation: 0.9 } },
  { id: 'faded', name: 'Soluk', grading: { brightness: 0.06, contrast: 0.85, saturation: 0.7 } },
  { id: 'bw', name: 'Siyah-Beyaz', grading: { brightness: 0, contrast: 1.08, saturation: 0 } },
];
