import { describe, it, expect } from 'vitest';
import {
  evaluateKeyframes,
  evaluateProp,
  resolveTransform,
  upsertKeyframe,
  removeKeyframe,
  splitKeyframes,
  scaleKeyframeTimes,
  shiftKeyframesForStartTrim,
  nextKeyframeTime,
  prevKeyframeTime,
  getKeyframeTimes,
} from './keyframes';
import { Clip, Keyframe } from '@/types/timeline';

const kf = (time: number, value: number, easing: Keyframe['easing'] = 'linear'): Keyframe => ({
  id: `kf-${time}`,
  time,
  value,
  easing,
});

const mockClip = (overrides: Partial<Clip> = {}): Clip => ({
  id: 'c1',
  trackId: 't1',
  assetId: 'a1',
  name: 'Clip',
  type: 'video',
  startTime: 0,
  duration: 4,
  inPoint: 0,
  outPoint: 4,
  speed: 1,
  transform: { x: 10, y: 20, scaleX: 1.5, scaleY: 1.5, rotation: 0, opacity: 0.8, zIndex: 1 },
  audio: { volume: 1, muted: false, fadeIn: 0, fadeOut: 0 },
  ...overrides,
});

describe('evaluateKeyframes', () => {
  it('returns null for an empty list', () => {
    expect(evaluateKeyframes([], 1)).toBeNull();
  });

  it('holds the first and last value outside the range', () => {
    const list = [kf(1, 10), kf(3, 30)];
    expect(evaluateKeyframes(list, 0)).toBe(10);
    expect(evaluateKeyframes(list, 5)).toBe(30);
  });

  it('interpolates linearly between keyframes', () => {
    const list = [kf(0, 0), kf(2, 100)];
    expect(evaluateKeyframes(list, 1)).toBeCloseTo(50);
    expect(evaluateKeyframes(list, 0.5)).toBeCloseTo(25);
  });

  it('uses the easing of the segment start keyframe', () => {
    const list = [kf(0, 0, 'ease-in-out'), kf(2, 100)];
    expect(evaluateKeyframes(list, 0)).toBe(0);
    expect(evaluateKeyframes(list, 1)).toBeCloseTo(50);
    // smoothstep: slower than linear at the start
    expect(evaluateKeyframes(list, 0.5)).toBeCloseTo(15.625);
    expect(evaluateKeyframes(list, 2)).toBe(100);
  });

  it('handles a single keyframe as a constant', () => {
    expect(evaluateKeyframes([kf(1, 7)], 0)).toBe(7);
    expect(evaluateKeyframes([kf(1, 7)], 9)).toBe(7);
  });
});

describe('evaluateProp / resolveTransform', () => {
  it('falls back to the static transform without keyframes', () => {
    const clip = mockClip();
    expect(evaluateProp(clip, 'x', 1)).toBe(10);
    expect(evaluateProp(clip, 'scale', 1)).toBe(1.5);
    expect(resolveTransform(clip, 1)).toBe(clip.transform);
  });

  it('resolves only the animated properties', () => {
    const clip = mockClip({
      keyframes: {
        scale: [kf(0, 1), kf(2, 2)],
        opacity: [kf(0, 0), kf(2, 1)],
      },
    });
    const t = resolveTransform(clip, 1);
    expect(t.scaleX).toBeCloseTo(1.5);
    expect(t.scaleY).toBeCloseTo(1.5);
    expect(t.opacity).toBeCloseTo(0.5);
    expect(t.x).toBe(10);
    expect(t.y).toBe(20);
  });
});

describe('upsert / remove / navigation', () => {
  it('inserts keyframes sorted by time', () => {
    let kfs = upsertKeyframe(undefined, 'x', 2, 200);
    kfs = upsertKeyframe(kfs, 'x', 1, 100);
    expect(kfs.x!.map((k) => k.time)).toEqual([1, 2]);
  });

  it('updates the keyframe at the same time instead of duplicating', () => {
    let kfs = upsertKeyframe(undefined, 'opacity', 1, 0.5);
    kfs = upsertKeyframe(kfs, 'opacity', 1.005, 0.9);
    expect(kfs.opacity).toHaveLength(1);
    expect(kfs.opacity![0].value).toBe(0.9);
  });

  it('removes a keyframe and drops empty properties', () => {
    const kfs = upsertKeyframe(undefined, 'y', 1, 5);
    const id = kfs.y![0].id;
    expect(removeKeyframe(kfs, 'y', id)).toBeUndefined();
  });

  it('finds next and previous keyframe times across properties', () => {
    let kfs = upsertKeyframe(undefined, 'x', 1, 1);
    kfs = upsertKeyframe(kfs, 'scale', 2, 2);
    kfs = upsertKeyframe(kfs, 'x', 3, 3);
    expect(getKeyframeTimes(kfs)).toEqual([1, 2, 3]);
    expect(nextKeyframeTime(kfs, 1)).toBe(2);
    expect(prevKeyframeTime(kfs, 2)).toBe(1);
    expect(nextKeyframeTime(kfs, 3)).toBeNull();
    expect(prevKeyframeTime(kfs, 1)).toBeNull();
  });
});

describe('splitKeyframes', () => {
  it('keeps the animation continuous across the cut', () => {
    const keyframes = { scale: [kf(0, 1), kf(4, 3)] };
    const { left, right } = splitKeyframes(keyframes, 1);

    // value at the cut is 1 + (3-1) * 1/4 = 1.5 on both sides
    expect(left!.scale![left!.scale!.length - 1]).toMatchObject({ time: 1, value: 1.5 });
    expect(right!.scale![0]).toMatchObject({ time: 0, value: 1.5 });
    expect(right!.scale![right!.scale!.length - 1]).toMatchObject({ time: 3, value: 3 });
  });

  it('re-bases the right half to start at 0', () => {
    const keyframes = { x: [kf(0, 0), kf(2, 20), kf(6, 60)] };
    const { left, right } = splitKeyframes(keyframes, 3);
    expect(left!.x!.map((k) => k.time)).toEqual([0, 2, 3]);
    expect(right!.x!.map((k) => k.time)).toEqual([0, 3]);
  });

  it('returns undefined halves without keyframes', () => {
    expect(splitKeyframes(undefined, 1)).toEqual({ left: undefined, right: undefined });
  });
});

describe('scaleKeyframeTimes', () => {
  it('scales times by the factor (speed 1x -> 2x halves the timeline length)', () => {
    const scaled = scaleKeyframeTimes({ x: [kf(0, 0), kf(4, 40)] }, 0.5);
    expect(scaled!.x!.map((k) => k.time)).toEqual([0, 2]);
  });
});

describe('shiftKeyframesForStartTrim', () => {
  it('trimming into the clip inserts a boundary keyframe at 0', () => {
    const shifted = shiftKeyframesForStartTrim({ opacity: [kf(0, 0), kf(4, 1)] }, 1);
    expect(shifted!.opacity![0]).toMatchObject({ time: 0, value: 0.25 });
    expect(shifted!.opacity![shifted!.opacity!.length - 1]).toMatchObject({ time: 3, value: 1 });
  });

  it('extending the clip earlier pushes keyframes later', () => {
    const shifted = shiftKeyframesForStartTrim({ opacity: [kf(1, 0.2), kf(2, 1)] }, -0.5);
    expect(shifted!.opacity!.map((k) => k.time)).toEqual([1.5, 2.5]);
  });
});
