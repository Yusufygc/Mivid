import { describe, it, expect } from 'vitest';
import {
  alphaFactorExpr,
  clampTransitionSeconds,
  combineTransitionVisuals,
  easedExpr,
  progressExpr,
  slideOffsetExpr,
  transitionPhases,
  transitionVisual,
  wipeKeep,
  zoomFactorExpr,
} from './transitions';
import { Transition, TransitionDirection } from '@/types/timeline';

const clip = (over: object = {}) => ({ startTime: 10, duration: 5, ...over });
const W = 1080;
const H = 1920;

const phaseAt = (transition: Transition, side: 'in' | 'out', p: number) => ({
  side,
  transition,
  p,
  e: transition.easing === 'ease-in-out' ? p * p * (3 - 2 * p) : p,
});

describe('transitionPhases', () => {
  const c = clip({ transitionIn: { type: 'cross-dissolve', duration: 2 }, transitionOut: { type: 'slide', duration: 1 } });

  it('has no phase before, between and after the transition windows', () => {
    expect(transitionPhases(c, 9.9)).toEqual([]);
    expect(transitionPhases(c, 13)).toEqual([]);
    expect(transitionPhases(c, 15.1)).toEqual([]);
  });

  it('runs the in-transition from 0 to 1 over its duration', () => {
    const [phase] = transitionPhases(c, 11);
    expect(phase.side).toBe('in');
    expect(phase.p).toBeCloseTo(0.5, 6);
    expect(transitionPhases(c, 10)[0].p).toBe(0);
  });

  it('runs the out-transition from 1 to 0 over its duration', () => {
    const [phase] = transitionPhases(c, 14.5);
    expect(phase.side).toBe('out');
    expect(phase.p).toBeCloseTo(0.5, 6);
    expect(transitionPhases(c, 14.9)[0].p).toBeCloseTo(0.1, 6);
  });

  it('is linear without an easing and smoothstep with ease-in-out', () => {
    const linear = transitionPhases(clip({ transitionIn: { type: 'slide', duration: 2 } }), 10.5)[0];
    const eased = transitionPhases(clip({ transitionIn: { type: 'slide', duration: 2, easing: 'ease-in-out' } }), 10.5)[0];
    expect(linear.e).toBeCloseTo(0.25, 6);
    expect(eased.e).toBeCloseTo(0.25 * 0.25 * (3 - 2 * 0.25), 6);
  });

  it('can run both transitions at once on a very short clip', () => {
    const short = clip({
      duration: 1,
      transitionIn: { type: 'cross-dissolve', duration: 0.8 },
      transitionOut: { type: 'cross-dissolve', duration: 0.8 },
    });
    expect(transitionPhases(short, 10.5)).toHaveLength(2);
  });
});

describe('transitionVisual', () => {
  it('dissolves alpha with the eased progress', () => {
    const t: Transition = { type: 'cross-dissolve', duration: 1 };
    expect(transitionVisual(phaseAt(t, 'in', 0.25), W, H).alpha).toBeCloseTo(0.25, 6);
    expect(transitionVisual(phaseAt({ ...t, easing: 'ease-in-out' }, 'in', 0.25), W, H).alpha).toBeCloseTo(0.15625, 6);
  });

  it('keeps the old slide: in from the right, out to the left, by default', () => {
    const t: Transition = { type: 'slide', duration: 1 };
    expect(transitionVisual(phaseAt(t, 'in', 0.25), W, H).dx).toBeCloseTo(W * 0.75, 6);
    expect(transitionVisual(phaseAt(t, 'out', 0.25), W, H).dx).toBeCloseTo(-W * 0.75, 6);
  });

  it('moves the clip in the chosen direction', () => {
    const at = (direction: TransitionDirection, side: 'in' | 'out') =>
      transitionVisual(phaseAt({ type: 'slide', duration: 1, direction }, side, 0), W, H);
    expect(at('right', 'in').dx).toBe(-W);
    expect(at('right', 'out').dx).toBe(W);
    expect(at('up', 'in').dy).toBe(H);
    expect(at('up', 'out').dy).toBe(-H);
    expect(at('down', 'in').dy).toBe(-H);
    expect(at('down', 'out').dy).toBe(H);
    expect(at('up', 'in').dx).toBe(0);
  });

  it('is settled (no offset, full alpha) at the end of the transition', () => {
    for (const type of ['slide', 'cross-dissolve', 'zoom'] as const) {
      const v = transitionVisual(phaseAt({ type, duration: 1 }, 'in', 1), W, H);
      expect(Math.abs(v.dx) + Math.abs(v.dy)).toBe(0);
      expect(v.alpha).toBe(1);
      expect(v.scale).toBe(1);
    }
  });

  describe('wipe', () => {
    const rect = (direction: TransitionDirection, side: 'in' | 'out', p: number) =>
      transitionVisual(phaseAt({ type: 'wipe', duration: 1, direction }, side, p), W, H).rect!;

    it('reveals from the right edge for "left" when coming in (the edge travels left)', () => {
      expect(rect('left', 'in', 0.25)).toEqual({ x0: 0.75, x1: 1, y0: 0, y1: 1 });
    });

    it('covers the other three directions', () => {
      expect(rect('right', 'in', 0.25)).toEqual({ x0: 0, x1: 0.25, y0: 0, y1: 1 });
      expect(rect('up', 'in', 0.25)).toEqual({ x0: 0, x1: 1, y0: 0.75, y1: 1 });
      expect(rect('down', 'in', 0.25)).toEqual({ x0: 0, x1: 1, y0: 0, y1: 0.25 });
    });

    it('erases from the opposite side when going out', () => {
      expect(rect('left', 'out', 0.25)).toEqual({ x0: 0, x1: 0.25, y0: 0, y1: 1 });
      expect(rect('down', 'out', 0.25)).toEqual({ x0: 0, x1: 1, y0: 0.75, y1: 1 });
    });

    it('shows everything when finished and nothing at the start', () => {
      expect(rect('left', 'in', 1)).toEqual({ x0: 0, x1: 1, y0: 0, y1: 1 });
      const start = rect('left', 'in', 0);
      expect(start.x1 - start.x0).toBe(0);
    });
  });

  it('opens an iris from the center to the corners', () => {
    const t: Transition = { type: 'iris', duration: 1 };
    expect(transitionVisual(phaseAt(t, 'in', 0), W, H).irisRadius).toBe(0);
    expect(transitionVisual(phaseAt(t, 'in', 1), W, H).irisRadius).toBeCloseTo(Math.hypot(W / 2, H / 2), 6);
    expect(transitionVisual(phaseAt(t, 'in', 0.5), W, H).irisRadius).toBeCloseTo(Math.hypot(W / 2, H / 2) / 2, 6);
  });

  it('zooms from 1.5x down to 1x while fading in', () => {
    const t: Transition = { type: 'zoom', duration: 1 };
    const start = transitionVisual(phaseAt(t, 'in', 0), W, H);
    expect(start.scale).toBeCloseTo(1.5, 6);
    expect(start.alpha).toBe(0);
    expect(transitionVisual(phaseAt(t, 'in', 0.5), W, H).scale).toBeCloseTo(1.25, 6);
  });

  it('blurs with a constant radius while fading', () => {
    const v = transitionVisual(phaseAt({ type: 'blur', duration: 1 }, 'in', 0.5), W, H);
    expect(v.blurPx).toBeCloseTo(H * 0.025, 6);
    expect(v.alpha).toBe(0.5);
  });

  it('flashes white that fades away, leaving the clip untouched', () => {
    const v = transitionVisual(phaseAt({ type: 'flash', duration: 1 }, 'in', 0.25), W, H);
    expect(v.flash).toBeCloseTo(0.75, 6);
    expect(v.alpha).toBe(1);
  });
});

describe('combineTransitionVisuals', () => {
  it('multiplies the alphas of an in and an out transition', () => {
    const c = clip({
      duration: 1,
      transitionIn: { type: 'cross-dissolve', duration: 0.8 },
      transitionOut: { type: 'cross-dissolve', duration: 0.8 },
    });
    const { visual } = combineTransitionVisuals(c, 10.5, W, H);
    expect(visual.alpha).toBeCloseTo((0.5 / 0.8) * (0.5 / 0.8), 6);
  });

  it('collects wipe rectangles and flashes', () => {
    const c = clip({ transitionIn: { type: 'wipe', duration: 2 }, transitionOut: { type: 'flash', duration: 2 } });
    const early = combineTransitionVisuals(c, 11, W, H);
    expect(early.rects).toHaveLength(1);
    expect(early.flashes).toHaveLength(0);
    const late = combineTransitionVisuals(c, 14, W, H);
    expect(late.flashes).toHaveLength(1);
  });
});

describe('clampTransitionSeconds', () => {
  it('keeps the duration between 0.2 s, 3 s and half of the shortest clip', () => {
    expect(clampTransitionSeconds(0.05)).toBe(0.2);
    expect(clampTransitionSeconds(10)).toBe(3);
    expect(clampTransitionSeconds(2, 6, 3)).toBe(1.5);
    expect(clampTransitionSeconds(1, 0.3)).toBe(0.2);
  });
});

describe('FFmpeg expressions', () => {
  it('builds the progress of an in and an out transition', () => {
    expect(progressExpr('in', 'T', 10, 15, 2)).toBe('clip((T-10)/2,0,1)');
    expect(progressExpr('out', 't', 10, 15, 2)).toBe('clip((15-t)/2,0,1)');
  });

  it('uses the same smoothstep as applyEasing', () => {
    expect(easedExpr('p', 'ease-in-out')).toBe('(p)*(p)*(3-2*(p))');
    expect(easedExpr('p', undefined)).toBe('(p)');
  });

  it('gives each type its alpha factor (or none)', () => {
    expect(alphaFactorExpr({ type: 'cross-dissolve', duration: 1 }, 'in', 'E')).toBe('E');
    expect(alphaFactorExpr({ type: 'blur', duration: 1 }, 'in', 'E')).toBe('E');
    expect(alphaFactorExpr({ type: 'slide', duration: 1 }, 'in', 'E')).toBeNull();
    expect(alphaFactorExpr({ type: 'flash', duration: 1 }, 'in', 'E')).toBeNull();
    expect(alphaFactorExpr({ type: 'iris', duration: 1 }, 'in', 'E')).toBe('lt(hypot(X+0.5-W/2,Y+0.5-H/2),(E)*hypot(W/2,H/2))');
  });

  it('writes the wipe like wipeKeep() decides', () => {
    expect(alphaFactorExpr({ type: 'wipe', duration: 1, direction: 'left' }, 'in', 'E')).toBe('gte(X,W*(1-(E)))');
    expect(alphaFactorExpr({ type: 'wipe', duration: 1, direction: 'left' }, 'out', 'E')).toBe('lt(X,W*(E))');
    expect(alphaFactorExpr({ type: 'wipe', duration: 1, direction: 'down' }, 'in', 'E')).toBe('lt(Y,H*(E))');
    expect(wipeKeep('in', 'down')).toEqual({ axis: 'y', keep: 'low' });
  });

  it('writes slide offsets that match transitionVisual()', () => {
    expect(slideOffsetExpr({ type: 'slide', duration: 1 }, 'in', 'E')).toEqual({ x: 'W*(1-(E))', y: '0' });
    expect(slideOffsetExpr({ type: 'slide', duration: 1 }, 'out', 'E')).toEqual({ x: '-W*(1-(E))', y: '0' });
    expect(slideOffsetExpr({ type: 'slide', duration: 1, direction: 'up' }, 'in', 'E')).toEqual({ x: '0', y: 'H*(1-(E))' });
  });

  it('writes the zoom factor from 1.5 to 1', () => {
    expect(zoomFactorExpr('E')).toBe('(1+0.5*(1-(E)))');
  });
});
