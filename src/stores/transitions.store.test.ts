import { describe, it, expect, beforeEach } from 'vitest';
import { useTimelineStore } from './useTimelineStore';
import { TimelineEngine } from '@/core/timeline/timelineEngine';
import { Clip, Track } from '@/types/timeline';

const makeClip = (id: string, startTime: number, duration: number, overrides: Partial<Clip> = {}): Clip => ({
  id,
  trackId: 'track-v1',
  assetId: 'asset-1',
  name: id,
  type: 'video',
  startTime,
  duration,
  inPoint: 0,
  outPoint: duration,
  speed: 1,
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, zIndex: 1 },
  audio: { volume: 1, muted: false, fadeIn: 0, fadeOut: 0 },
  ...overrides,
});

const setTracks = (clips: Clip[], locked = false) => {
  const track: Track = {
    id: 'track-v1',
    name: 'V1',
    type: 'video',
    isMuted: false,
    isLocked: locked,
    isHidden: false,
    clips,
  };
  useTimelineStore.setState({ tracks: [track], selectedClipId: null, currentTime: 0 });
};

const getClip = (id: string): Clip =>
  useTimelineStore
    .getState()
    .tracks.flatMap((t) => t.clips)
    .find((c) => c.id === id)!;

describe('transitions in the timeline store', () => {
  beforeEach(() => setTracks([makeClip('a', 0, 10), makeClip('b', 10, 10)]));

  it('adds a transition that eases in and out, 1 s long, and pulls the clip over its neighbor', () => {
    useTimelineStore.getState().addTransition('b', 'in', 'cross-dissolve');
    const b = getClip('b');
    expect(b.transitionIn).toEqual({ type: 'cross-dissolve', duration: 1, easing: 'ease-in-out' });
    expect(b.startTime).toBe(9);
  });

  it('gives slide and wipe a direction and the other types none', () => {
    useTimelineStore.getState().addTransition('b', 'in', 'wipe');
    expect(getClip('b').transitionIn?.direction).toBe('left');
    useTimelineStore.getState().removeTransition('b', 'in');
    useTimelineStore.getState().addTransition('b', 'in', 'iris');
    expect(getClip('b').transitionIn?.direction).toBeUndefined();
  });

  it('adding a transition again only changes its type and does not pull the clip left a second time', () => {
    useTimelineStore.getState().addTransition('b', 'in', 'cross-dissolve');
    useTimelineStore.getState().addTransition('b', 'in', 'iris');
    expect(getClip('b').transitionIn?.type).toBe('iris');
    expect(getClip('b').startTime).toBe(9);
  });

  describe('ripple', () => {
    beforeEach(() => setTracks([makeClip('a', 0, 10), makeClip('b', 10, 10), makeClip('c', 20, 10)]));

    it('an in-transition moves the clips behind the clip too, so no gap opens at the end', () => {
      useTimelineStore.getState().addTransition('b', 'in', 'cross-dissolve');
      expect(getClip('b').startTime).toBe(9);
      expect(getClip('c').startTime).toBe(19);
    });

    it('an out-transition moves the next clip and the ones behind it', () => {
      useTimelineStore.getState().addTransition('a', 'out', 'cross-dissolve');
      expect(getClip('b').startTime).toBe(9);
      expect(getClip('c').startTime).toBe(19);
    });

    it('changing the length keeps following the overlap, and removing the transition gives the time back', () => {
      useTimelineStore.getState().addTransition('b', 'in', 'cross-dissolve');
      useTimelineStore.getState().updateTransition('b', 'in', { duration: 2 });
      expect(getClip('b').startTime).toBeCloseTo(8, 6);
      expect(getClip('c').startTime).toBeCloseTo(18, 6);
      useTimelineStore.getState().removeTransition('b', 'in');
      expect(getClip('b').startTime).toBeCloseTo(10, 6);
      expect(getClip('c').startTime).toBeCloseTo(20, 6);
    });

    it('does not move later clips when the transition did not pull its clip over a neighbor', () => {
      setTracks([makeClip('a', 0, 10), makeClip('b', 12, 10), makeClip('c', 22, 10)]);
      useTimelineStore.getState().addTransition('b', 'in', 'cross-dissolve');
      expect(getClip('b').startTime).toBe(12);
      expect(getClip('c').startTime).toBe(22);
    });
  });

  describe('updateTransition', () => {
    it('a longer in-transition pulls the clip further left and keeps overlap == duration', () => {
      useTimelineStore.getState().addTransition('b', 'in', 'cross-dissolve');
      useTimelineStore.getState().updateTransition('b', 'in', { duration: 2.5 });
      expect(getClip('b').transitionIn?.duration).toBe(2.5);
      expect(getClip('b').startTime).toBeCloseTo(7.5, 6);
      useTimelineStore.getState().updateTransition('b', 'in', { duration: 0.5 });
      expect(getClip('b').startTime).toBeCloseTo(9.5, 6);
    });

    it('a longer out-transition pulls the next clip left', () => {
      useTimelineStore.getState().addTransition('a', 'out', 'cross-dissolve');
      expect(getClip('b').startTime).toBe(9);
      useTimelineStore.getState().updateTransition('a', 'out', { duration: 2 });
      expect(getClip('b').startTime).toBeCloseTo(8, 6);
    });

    it('does not move anything when the clips were not overlapped by the transition', () => {
      setTracks([makeClip('a', 0, 10), makeClip('b', 12, 10, { transitionIn: { type: 'cross-dissolve', duration: 1 } })]);
      useTimelineStore.getState().updateTransition('b', 'in', { duration: 2 });
      expect(getClip('b').startTime).toBe(12);
      expect(getClip('b').transitionIn?.duration).toBe(2);
    });

    it('limits the duration to 0.2 s, 3 s and half of the shortest clip', () => {
      useTimelineStore.getState().addTransition('b', 'in', 'cross-dissolve');
      useTimelineStore.getState().updateTransition('b', 'in', { duration: 0.01 });
      expect(getClip('b').transitionIn?.duration).toBe(0.2);
      useTimelineStore.getState().updateTransition('b', 'in', { duration: 99 });
      expect(getClip('b').transitionIn?.duration).toBe(3);

      setTracks([makeClip('a', 0, 4), makeClip('b', 4, 10)]);
      useTimelineStore.getState().addTransition('b', 'in', 'cross-dissolve');
      useTimelineStore.getState().updateTransition('b', 'in', { duration: 3 });
      expect(getClip('b').transitionIn?.duration).toBe(2); // half of the 4 s clip before it
    });

    it('changes direction and easing without moving clips, and drops the direction for other types', () => {
      useTimelineStore.getState().addTransition('b', 'in', 'slide');
      useTimelineStore.getState().updateTransition('b', 'in', { direction: 'up', easing: 'linear' });
      expect(getClip('b').transitionIn).toMatchObject({ type: 'slide', direction: 'up', easing: 'linear' });
      expect(getClip('b').startTime).toBe(9);
      useTimelineStore.getState().updateTransition('b', 'in', { type: 'iris' });
      expect(getClip('b').transitionIn?.direction).toBeUndefined();
      useTimelineStore.getState().updateTransition('b', 'in', { type: 'wipe' });
      expect(getClip('b').transitionIn?.direction).toBe('left');
    });

    it('never moves a clip before 0', () => {
      setTracks([makeClip('a', 0, 2), makeClip('b', 2, 10)]);
      useTimelineStore.getState().addTransition('b', 'in', 'cross-dissolve');
      useTimelineStore.getState().updateTransition('b', 'in', { duration: 3 });
      expect(getClip('b').startTime).toBeGreaterThanOrEqual(0);
    });

    it('ignores a locked track and a missing transition', () => {
      setTracks([makeClip('a', 0, 10), makeClip('b', 10, 10, { transitionIn: { type: 'slide', duration: 1 } })], true);
      useTimelineStore.getState().updateTransition('b', 'in', { duration: 2 });
      expect(getClip('b').transitionIn?.duration).toBe(1);
      setTracks([makeClip('a', 0, 10)]);
      useTimelineStore.getState().updateTransition('a', 'out', { duration: 2 });
      expect(getClip('a').transitionOut).toBeUndefined();
    });
  });
});

describe('splitting a clip with transitions and a strength ramp', () => {
  it('keeps the way in on the left half and the way out on the right half', () => {
    const clip = makeClip('c', 0, 10, {
      transitionIn: { type: 'slide', duration: 1 },
      transitionOut: { type: 'iris', duration: 1 },
    });
    const { leftClip, rightClip } = TimelineEngine.splitClip(clip, 4)!;
    expect(leftClip.transitionIn?.type).toBe('slide');
    expect(leftClip.transitionOut).toBeUndefined();
    expect(rightClip.transitionIn).toBeUndefined();
    expect(rightClip.transitionOut?.type).toBe('iris');
  });

  it('continues a linear strength ramp across the cut', () => {
    const effect = makeClip('e', 0, 10, {
      type: 'effect',
      effect: { kind: 'blur', shape: 'rect', strength: 0, strengthEnd: 1, feather: 0, width: 100, height: 100 },
    });
    const { leftClip, rightClip } = TimelineEngine.splitClip(effect, 4)!;
    expect(leftClip.effect).toMatchObject({ strength: 0, strengthEnd: 0.4 });
    expect(rightClip.effect).toMatchObject({ strength: 0.4, strengthEnd: 1 });
  });

  it('leaves a constant-strength effect alone', () => {
    const effect = makeClip('e', 0, 10, {
      type: 'effect',
      effect: { kind: 'blur', shape: 'rect', strength: 0.5, feather: 0, width: 100, height: 100 },
    });
    const { leftClip, rightClip } = TimelineEngine.splitClip(effect, 4)!;
    expect(leftClip.effect?.strengthEnd).toBeUndefined();
    expect(rightClip.effect?.strengthEnd).toBeUndefined();
  });
});
