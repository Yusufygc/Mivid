import { Clip, Easing, Transition, TransitionDirection, TransitionType } from '@/types/timeline';
import { applyEasing } from '@/core/animation/keyframes';

/**
 * Transitions between clips. A transition lives on the clip that comes in (`transitionIn`) or goes out (`transitionOut`):
 * for the length of the transition the clip is shown with partial visibility, `p` runs 0 -> 1 on the way in and
 * 1 -> 0 on the way out. The preview (canvas) and the export (FFmpeg) both read these numbers and formulas.
 */

export const TRANSITION_TYPES: TransitionType[] = ['cross-dissolve', 'fade-to-black', 'slide', 'wipe', 'iris', 'zoom', 'flash', 'blur'];

export const TRANSITION_LABELS: Record<TransitionType, string> = {
  'cross-dissolve': 'Çapraz Geçiş',
  'fade-to-black': 'Kararma',
  slide: 'Kaydırma',
  wipe: 'Silme',
  iris: 'Daire Açılma',
  zoom: 'Yakınlaşma',
  flash: 'Flaş',
  blur: 'Bulanık Geçiş',
};

export const TRANSITION_DESCRIPTIONS: Record<TransitionType, string> = {
  'cross-dissolve': 'Yumuşak bir şekilde iki klibi birleştirir.',
  'fade-to-black': 'Klibi şeffaflaştırarak geçer.',
  slide: 'Klip ekrana kayarak girer ya da çıkar.',
  wipe: 'Klip bir kenardan silinerek açılır.',
  iris: 'Klip merkezden büyüyen bir daireyle açılır.',
  zoom: 'Klip yakından uzaklaşarak yerine oturur.',
  flash: 'Beyaz bir parlamayla geçer.',
  blur: 'Bulanıktan netleşerek çözülür.',
};

export const DEFAULT_TRANSITION_SECONDS = 1;
export const MIN_TRANSITION_SECONDS = 0.2;
export const MAX_TRANSITION_SECONDS = 3;
export const DEFAULT_TRANSITION_DIRECTION: TransitionDirection = 'left';

/** Scale of a clip at the start of a zoom transition (it settles to 1) */
export const ZOOM_TRANSITION_FROM = 1.5;
/** Gaussian sigma of the blur transition, relative to the project height */
export const BLUR_TRANSITION_SIGMA_RATIO = 0.025;

export const transitionUsesDirection = (type: TransitionType): boolean => type === 'slide' || type === 'wipe';

/** Keeps a transition between the minimum, the maximum and half the shortest clip it touches */
export const clampTransitionSeconds = (seconds: number, ...clipDurations: number[]): number => {
  const halves = clipDurations.filter((d) => d > 0).map((d) => d / 2);
  const upper = Math.max(MIN_TRANSITION_SECONDS, Math.min(MAX_TRANSITION_SECONDS, ...halves));
  return Math.round(Math.min(upper, Math.max(MIN_TRANSITION_SECONDS, seconds)) * 100) / 100;
};

export type TransitionSide = 'in' | 'out';

export interface TransitionPhase {
  side: TransitionSide;
  transition: Transition;
  /** Visibility progress: 0 = just entering / about to leave, 1 = the transition is over */
  p: number;
  /** `p` through the transition's easing curve */
  e: number;
}

const phaseOf = (side: TransitionSide, transition: Transition, p: number): TransitionPhase => ({
  side,
  transition,
  p,
  e: applyEasing(p, transition.easing ?? 'linear'),
});

type TransitionClip = Pick<Clip, 'startTime' | 'duration' | 'transitionIn' | 'transitionOut'>;

/** The transitions that are running at a timeline time (none, the in-transition, the out-transition or both) */
export const transitionPhases = (clip: TransitionClip, time: number): TransitionPhase[] => {
  const phases: TransitionPhase[] = [];
  const timeInClip = time - clip.startTime;
  const timeLeft = clip.startTime + clip.duration - time;

  const tin = clip.transitionIn;
  if (tin && tin.duration > 0 && timeInClip >= 0 && timeInClip < tin.duration) {
    phases.push(phaseOf('in', tin, timeInClip / tin.duration));
  }
  const tout = clip.transitionOut;
  if (tout && tout.duration > 0 && timeLeft >= 0 && timeLeft < tout.duration) {
    phases.push(phaseOf('out', tout, timeLeft / tout.duration));
  }
  return phases;
};

/** Which part of the frame a wipe keeps: the high side (right / bottom) or the low side (left / top) of one axis */
export const wipeKeep = (side: TransitionSide, direction: TransitionDirection): { axis: 'x' | 'y'; keep: 'high' | 'low' } => {
  const axis = direction === 'left' || direction === 'right' ? 'x' : 'y';
  // The edge travels in `direction`. Coming in, the clip appears behind the edge: for "left" the right side is kept first.
  const towardLow = direction === 'left' || direction === 'up';
  const keepsHigh = side === 'in' ? towardLow : !towardLow;
  return { axis, keep: keepsHigh ? 'high' : 'low' };
};

export interface WipeRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface TransitionVisual {
  alpha: number;
  /** Offset in project pixels */
  dx: number;
  dy: number;
  scale: number;
  /** Visible part of the layer for a wipe, as fractions of the frame */
  rect?: WipeRect;
  /** Visible circle radius for an iris, in project pixels (centered on the layer) */
  irisRadius?: number;
  blurPx: number;
  /** White overlay alpha for a flash */
  flash: number;
}

export const NEUTRAL_VISUAL: TransitionVisual = { alpha: 1, dx: 0, dy: 0, scale: 1, blurPx: 0, flash: 0 };

export const transitionVisual = (phase: TransitionPhase, width: number, height: number): TransitionVisual => {
  const { side, transition, e } = phase;
  const direction = transition.direction ?? DEFAULT_TRANSITION_DIRECTION;
  const visual: TransitionVisual = { ...NEUTRAL_VISUAL };

  switch (transition.type) {
    case 'cross-dissolve':
    case 'fade-to-black':
      visual.alpha = e;
      break;
    case 'slide': {
      // The clip moves in `direction`: coming in it starts one frame behind, going out it ends one frame ahead
      const sign = (direction === 'left' || direction === 'up' ? 1 : -1) * (side === 'in' ? 1 : -1);
      if (direction === 'left' || direction === 'right') visual.dx = sign * width * (1 - e);
      else visual.dy = sign * height * (1 - e);
      break;
    }
    case 'wipe': {
      const { axis, keep } = wipeKeep(side, direction);
      const lo = keep === 'high' ? 1 - e : 0;
      const hi = keep === 'high' ? 1 : e;
      visual.rect = axis === 'x' ? { x0: lo, x1: hi, y0: 0, y1: 1 } : { x0: 0, x1: 1, y0: lo, y1: hi };
      break;
    }
    case 'iris':
      visual.irisRadius = e * Math.hypot(width / 2, height / 2);
      break;
    case 'zoom':
      visual.alpha = e;
      visual.scale = 1 + (ZOOM_TRANSITION_FROM - 1) * (1 - e);
      break;
    case 'blur':
      visual.alpha = e;
      visual.blurPx = height * BLUR_TRANSITION_SIGMA_RATIO;
      break;
    case 'flash':
      visual.flash = 1 - e;
      break;
  }
  return visual;
};

/** All running transitions of a clip as one visual (alphas and scales multiply, offsets add) plus the masks and flashes */
export const combineTransitionVisuals = (
  clip: TransitionClip,
  time: number,
  width: number,
  height: number
): { visual: TransitionVisual; rects: WipeRect[]; irisRadii: number[]; flashes: number[] } => {
  const visual: TransitionVisual = { ...NEUTRAL_VISUAL };
  const rects: WipeRect[] = [];
  const irisRadii: number[] = [];
  const flashes: number[] = [];

  for (const phase of transitionPhases(clip, time)) {
    const v = transitionVisual(phase, width, height);
    visual.alpha *= v.alpha;
    visual.dx += v.dx;
    visual.dy += v.dy;
    visual.scale *= v.scale;
    visual.blurPx = Math.max(visual.blurPx, v.blurPx);
    if (v.rect) rects.push(v.rect);
    if (v.irisRadius !== undefined) irisRadii.push(v.irisRadius);
    if (v.flash > 0) flashes.push(v.flash);
  }
  return { visual, rects, irisRadii, flashes };
};

// ---------------------------------------------------------------------------------------------------------------
// FFmpeg expressions. `timeVar` is `t` for overlay / scale and `T` for geq. They mirror the functions above.
// ---------------------------------------------------------------------------------------------------------------

const num = (n: number): string => String(Math.round(n * 10000) / 10000);

/** `p` of a transition as an FFmpeg expression of time; 1 outside the transition window */
export const progressExpr = (
  side: TransitionSide,
  timeVar: 't' | 'T',
  clipStart: number,
  clipEnd: number,
  duration: number
): string =>
  side === 'in'
    ? `clip((${timeVar}-${num(clipStart)})/${num(duration)},0,1)`
    : `clip((${num(clipEnd)}-${timeVar})/${num(duration)},0,1)`;

/** Same curve as applyEasing() */
export const easedExpr = (p: string, easing: Easing | undefined): string =>
  easing === 'ease-in-out' ? `(${p})*(${p})*(3-2*(${p}))` : `(${p})`;

/** Whether the transition's alpha is `e` (dissolve, fade, zoom, blur) */
export const fadesAlpha = (type: TransitionType): boolean =>
  type === 'cross-dissolve' || type === 'fade-to-black' || type === 'zoom' || type === 'blur';

/**
 * Factor for geq's alpha plane: `alpha(X,Y)*<factor>`. Null when the transition does not touch the alpha plane.
 * `e` is the eased progress expression.
 */
export const alphaFactorExpr = (transition: Transition, side: TransitionSide, e: string): string | null => {
  const direction = transition.direction ?? DEFAULT_TRANSITION_DIRECTION;
  switch (transition.type) {
    case 'cross-dissolve':
    case 'fade-to-black':
    case 'zoom':
    case 'blur':
      return e;
    case 'wipe': {
      const { axis, keep } = wipeKeep(side, direction);
      const pos = axis === 'x' ? 'X' : 'Y';
      const size = axis === 'x' ? 'W' : 'H';
      return keep === 'high' ? `gte(${pos},${size}*(1-(${e})))` : `lt(${pos},${size}*(${e}))`;
    }
    case 'iris':
      return `lt(hypot(X+0.5-W/2,Y+0.5-H/2),(${e})*hypot(W/2,H/2))`;
    default:
      return null;
  }
};

/** Offset a slide adds to the overlay position, as FFmpeg expressions (`W`/`H` are overlay's main-frame size) */
export const slideOffsetExpr = (
  transition: Transition,
  side: TransitionSide,
  e: string
): { x: string; y: string } => {
  const direction = transition.direction ?? DEFAULT_TRANSITION_DIRECTION;
  const sign = (direction === 'left' || direction === 'up' ? 1 : -1) * (side === 'in' ? 1 : -1);
  const amount = (size: string) => `${sign < 0 ? '-' : ''}${size}*(1-(${e}))`;
  return direction === 'left' || direction === 'right' ? { x: amount('W'), y: '0' } : { x: '0', y: amount('H') };
};

/** Scale factor of a zoom transition as an FFmpeg expression */
export const zoomFactorExpr = (e: string): string => `(1+${num(ZOOM_TRANSITION_FROM - 1)}*(1-(${e})))`;
