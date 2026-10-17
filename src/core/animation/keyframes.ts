import { AnimatableProp, Clip, ClipKeyframes, Easing, Keyframe, Transform } from '@/types/timeline';

export const ANIMATABLE_PROPS: AnimatableProp[] = ['x', 'y', 'scale', 'opacity'];

/** Two keyframes closer than this (seconds) are treated as the same keyframe */
export const KEYFRAME_EPSILON = 0.02;

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** Easing curve on normalized progress. Must stay identical to the FFmpeg expression in ffmpegBuilder. */
export const applyEasing = (progress: number, easing: Easing): number => {
  const p = Math.min(1, Math.max(0, progress));
  return easing === 'ease-in-out' ? p * p * (3 - 2 * p) : p;
};

/** Static (non-animated) value of a property on the clip */
export const getBaseValue = (clip: Clip, prop: AnimatableProp): number => {
  const t = clip.transform;
  switch (prop) {
    case 'x':
      return t?.x ?? 0;
    case 'y':
      return t?.y ?? 0;
    case 'scale':
      return t?.scaleX ?? 1;
    case 'opacity':
      return t?.opacity ?? 1;
  }
};

/** Interpolates a sorted keyframe list at clip-local time. Holds the first/last value outside the range. */
export const evaluateKeyframes = (keyframes: Keyframe[], localTime: number): number | null => {
  if (keyframes.length === 0) return null;
  if (localTime <= keyframes[0].time) return keyframes[0].value;

  const last = keyframes[keyframes.length - 1];
  if (localTime >= last.time) return last.value;

  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (localTime >= a.time && localTime < b.time) {
      const span = b.time - a.time;
      const progress = span > 0 ? (localTime - a.time) / span : 1;
      return a.value + (b.value - a.value) * applyEasing(progress, a.easing);
    }
  }
  return last.value;
};

export const evaluateProp = (clip: Clip, prop: AnimatableProp, localTime: number): number => {
  const list = clip.keyframes?.[prop];
  if (list && list.length > 0) {
    return evaluateKeyframes(list, localTime) ?? getBaseValue(clip, prop);
  }
  return getBaseValue(clip, prop);
};

export const hasKeyframes = (clip: Clip, prop?: AnimatableProp): boolean => {
  if (!clip.keyframes) return false;
  if (prop) return (clip.keyframes[prop]?.length ?? 0) > 0;
  return ANIMATABLE_PROPS.some((p) => (clip.keyframes?.[p]?.length ?? 0) > 0);
};

/** Transform of the clip at clip-local time with every animated property resolved */
export const resolveTransform = (clip: Clip, localTime: number): Transform => {
  const base: Transform = clip.transform ?? {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
  };
  if (!clip.keyframes) return base;

  const resolved = { ...base };
  if (hasKeyframes(clip, 'x')) resolved.x = evaluateProp(clip, 'x', localTime);
  if (hasKeyframes(clip, 'y')) resolved.y = evaluateProp(clip, 'y', localTime);
  if (hasKeyframes(clip, 'opacity')) resolved.opacity = evaluateProp(clip, 'opacity', localTime);
  if (hasKeyframes(clip, 'scale')) {
    const s = evaluateProp(clip, 'scale', localTime);
    resolved.scaleX = s;
    resolved.scaleY = s;
  }
  return resolved;
};

export const findKeyframeAt = (
  keyframes: ClipKeyframes | undefined,
  prop: AnimatableProp,
  localTime: number
): Keyframe | undefined => keyframes?.[prop]?.find((k) => Math.abs(k.time - localTime) < KEYFRAME_EPSILON);

const newKeyframeId = (): string =>
  crypto.randomUUID ? crypto.randomUUID() : `kf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Adds a keyframe, or updates the one already at that time. Returns a new object. */
export const upsertKeyframe = (
  keyframes: ClipKeyframes | undefined,
  prop: AnimatableProp,
  localTime: number,
  value: number,
  easing?: Easing
): ClipKeyframes => {
  const time = round3(Math.max(0, localTime));
  const list = keyframes?.[prop] ?? [];
  const existing = list.find((k) => Math.abs(k.time - time) < KEYFRAME_EPSILON);

  const next: Keyframe[] = existing
    ? list.map((k) => (k.id === existing.id ? { ...k, value, easing: easing ?? k.easing } : k))
    : [...list, { id: newKeyframeId(), time, value, easing: easing ?? 'linear' }].sort((a, b) => a.time - b.time);

  return { ...keyframes, [prop]: next };
};

export const removeKeyframe = (
  keyframes: ClipKeyframes | undefined,
  prop: AnimatableProp,
  keyframeId: string
): ClipKeyframes | undefined => {
  if (!keyframes?.[prop]) return keyframes;
  const remaining = keyframes[prop]!.filter((k) => k.id !== keyframeId);
  const next: ClipKeyframes = { ...keyframes };
  if (remaining.length > 0) {
    next[prop] = remaining;
  } else {
    delete next[prop];
  }
  return Object.keys(next).length > 0 ? next : undefined;
};

/** Sorted, de-duplicated times of every keyframe across all properties */
export const getKeyframeTimes = (keyframes: ClipKeyframes | undefined): number[] => {
  if (!keyframes) return [];
  const times: number[] = [];
  for (const prop of ANIMATABLE_PROPS) {
    for (const k of keyframes[prop] ?? []) {
      if (!times.some((t) => Math.abs(t - k.time) < KEYFRAME_EPSILON)) times.push(k.time);
    }
  }
  return times.sort((a, b) => a - b);
};

export const nextKeyframeTime = (keyframes: ClipKeyframes | undefined, localTime: number): number | null =>
  getKeyframeTimes(keyframes).find((t) => t > localTime + KEYFRAME_EPSILON) ?? null;

export const prevKeyframeTime = (keyframes: ClipKeyframes | undefined, localTime: number): number | null => {
  const earlier = getKeyframeTimes(keyframes).filter((t) => t < localTime - KEYFRAME_EPSILON);
  return earlier.length > 0 ? earlier[earlier.length - 1] : null;
};

const compact = (keyframes: ClipKeyframes): ClipKeyframes | undefined =>
  Object.keys(keyframes).length > 0 ? keyframes : undefined;

/**
 * Splits keyframes at a clip-local time. Both halves get a boundary keyframe at the cut
 * (value interpolated from the original curve) so the animation stays continuous.
 * The right half is re-based so its times start at 0.
 */
export const splitKeyframes = (
  keyframes: ClipKeyframes | undefined,
  splitLocalTime: number
): { left: ClipKeyframes | undefined; right: ClipKeyframes | undefined } => {
  if (!keyframes) return { left: undefined, right: undefined };

  const left: ClipKeyframes = {};
  const right: ClipKeyframes = {};

  for (const prop of ANIMATABLE_PROPS) {
    const list = keyframes[prop];
    if (!list || list.length === 0) continue;

    const boundaryValue = evaluateKeyframes(list, splitLocalTime) as number;
    const segmentStart = [...list].reverse().find((k) => k.time <= splitLocalTime + KEYFRAME_EPSILON);
    const boundaryEasing: Easing = segmentStart?.easing ?? 'linear';

    left[prop] = [
      ...list.filter((k) => k.time < splitLocalTime - KEYFRAME_EPSILON),
      { id: newKeyframeId(), time: round3(splitLocalTime), value: boundaryValue, easing: 'linear' },
    ];
    right[prop] = [
      { id: newKeyframeId(), time: 0, value: boundaryValue, easing: boundaryEasing },
      ...list
        .filter((k) => k.time > splitLocalTime + KEYFRAME_EPSILON)
        .map((k) => ({ ...k, id: newKeyframeId(), time: round3(k.time - splitLocalTime) })),
    ];
  }

  return { left: compact(left), right: compact(right) };
};

/** Multiplies every keyframe time, e.g. when the clip's timeline duration changes because of speed */
export const scaleKeyframeTimes = (keyframes: ClipKeyframes | undefined, factor: number): ClipKeyframes | undefined => {
  if (!keyframes) return undefined;
  const next: ClipKeyframes = {};
  for (const prop of ANIMATABLE_PROPS) {
    const list = keyframes[prop];
    if (list) next[prop] = list.map((k) => ({ ...k, time: round3(k.time * factor) }));
  }
  return compact(next);
};

/**
 * Re-bases keyframes after the clip's left edge moved by `delta` timeline seconds
 * (delta > 0: trimmed into the clip, delta < 0: extended earlier).
 */
export const shiftKeyframesForStartTrim = (
  keyframes: ClipKeyframes | undefined,
  delta: number
): ClipKeyframes | undefined => {
  if (!keyframes || Math.abs(delta) < 0.0005) return keyframes;
  if (delta > 0) return splitKeyframes(keyframes, delta).right;

  const next: ClipKeyframes = {};
  for (const prop of ANIMATABLE_PROPS) {
    const list = keyframes[prop];
    if (list) next[prop] = list.map((k) => ({ ...k, time: round3(k.time - delta) }));
  }
  return compact(next);
};
