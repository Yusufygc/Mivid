import { describe, it, expect, beforeEach } from 'vitest';
import { useTimelineStore } from './useTimelineStore';
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

const setTracks = (clips: Clip[]) => {
  const track: Track = {
    id: 'track-v1',
    name: 'V1',
    type: 'video',
    isMuted: false,
    isLocked: false,
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

describe('useTimelineStore - speed', () => {
  beforeEach(() => setTracks([makeClip('a', 0, 4), makeClip('b', 4, 2)]));

  it('2x halves the timeline length, keeps the source range and ripples later clips', () => {
    useTimelineStore.getState().setClipSpeed('a', 2);
    const a = getClip('a');
    expect(a.speed).toBe(2);
    expect(a.duration).toBe(2);
    expect(a.inPoint).toBe(0);
    expect(a.outPoint).toBe(4);
    expect(getClip('b').startTime).toBe(2);
  });

  it('0.5x doubles the timeline length and pushes later clips', () => {
    useTimelineStore.getState().setClipSpeed('a', 0.5);
    expect(getClip('a').duration).toBe(8);
    expect(getClip('b').startTime).toBe(8);
  });

  it('clamps speed to 0.25x..4x', () => {
    useTimelineStore.getState().setClipSpeed('a', 100);
    expect(getClip('a').speed).toBe(4);
    useTimelineStore.getState().setClipSpeed('a', 0.01);
    expect(getClip('a').speed).toBe(0.25);
  });

  it('does not exactly drift back and forth across many slider steps', () => {
    for (const s of [1.3, 1.65, 0.8, 2.35, 1]) {
      useTimelineStore.getState().setClipSpeed('a', s);
    }
    const a = getClip('a');
    expect(a.speed).toBe(1);
    expect(a.duration).toBe(4);
    expect(getClip('b').startTime).toBe(4);
  });

  it('rescales keyframe times with the clip duration', () => {
    setTracks([makeClip('a', 0, 4, { keyframes: { x: [{ id: 'k', time: 2, value: 10, easing: 'linear' }] } })]);
    useTimelineStore.getState().setClipSpeed('a', 2);
    expect(getClip('a').keyframes!.x![0].time).toBe(1);
  });

  it('ignores text clips', () => {
    setTracks([makeClip('t', 0, 3, { type: 'text' })]);
    useTimelineStore.getState().setClipSpeed('t', 2);
    expect(getClip('t').speed).toBe(1);
  });
});

describe('useTimelineStore - keyframes', () => {
  beforeEach(() => setTracks([makeClip('a', 2, 4)]));

  it('toggleKeyframe adds one at the playhead (clip-local time) with the current value', () => {
    useTimelineStore.setState({ currentTime: 3 });
    useTimelineStore.getState().toggleKeyframe('a', 'opacity');
    expect(getClip('a').keyframes!.opacity).toMatchObject([{ time: 1, value: 1 }]);
  });

  it('toggleKeyframe on an existing keyframe removes it and bakes the value', () => {
    useTimelineStore.setState({ currentTime: 3 });
    useTimelineStore.getState().updateClipTransform('a', { opacity: 0.4 });
    useTimelineStore.getState().toggleKeyframe('a', 'opacity');
    useTimelineStore.getState().updateClipTransform('a', { opacity: 0.3 }); // auto-key at the same time
    expect(getClip('a').keyframes!.opacity![0].value).toBe(0.3);

    useTimelineStore.getState().toggleKeyframe('a', 'opacity');
    expect(getClip('a').keyframes).toBeUndefined();
    expect(getClip('a').transform.opacity).toBe(0.3);
  });

  it('editing an animated property writes a keyframe, not the static value', () => {
    useTimelineStore.setState({ currentTime: 2 });
    useTimelineStore.getState().toggleKeyframe('a', 'scale'); // keyframe at local 0 (value 1)
    useTimelineStore.setState({ currentTime: 4 });
    useTimelineStore.getState().updateClipTransform('a', { scaleX: 2, scaleY: 2 });

    const clip = getClip('a');
    expect(clip.keyframes!.scale).toHaveLength(2);
    expect(clip.keyframes!.scale![1]).toMatchObject({ time: 2, value: 2 });
    expect(clip.transform.scaleX).toBe(1); // static value untouched
  });

  it('editing a non-animated property still edits the static transform', () => {
    useTimelineStore.getState().updateClipTransform('a', { x: 50 });
    expect(getClip('a').transform.x).toBe(50);
    expect(getClip('a').keyframes).toBeUndefined();
  });

  it('splitting keeps the animation continuous on both halves', () => {
    useTimelineStore.setState({ currentTime: 2 });
    useTimelineStore.getState().toggleKeyframe('a', 'x'); // local 0, value 0
    useTimelineStore.setState({ currentTime: 6 });
    useTimelineStore.getState().updateClipTransform('a', { x: 100 }); // local 4, value 100

    expect(useTimelineStore.getState().splitClipById('a', 4)).toBe(true); // local 2 -> value 50

    const clips = useTimelineStore.getState().tracks[0].clips;
    expect(clips).toHaveLength(2);
    const [left, right] = clips;
    const leftLast = left.keyframes!.x![left.keyframes!.x!.length - 1];
    expect(leftLast).toMatchObject({ time: 2, value: 50 });
    expect(right.keyframes!.x![0]).toMatchObject({ time: 0, value: 50 });
    expect(right.keyframes!.x![right.keyframes!.x!.length - 1]).toMatchObject({ time: 2, value: 100 });
  });

  it('left trim keeps keyframes anchored to the content', () => {
    useTimelineStore.setState({ currentTime: 2 });
    useTimelineStore.getState().toggleKeyframe('a', 'x'); // local 0, value 0
    useTimelineStore.setState({ currentTime: 6 });
    useTimelineStore.getState().updateClipTransform('a', { x: 100 }); // local 4, value 100

    // trim 2s from the left: start 2 -> 4, duration 4 -> 2, inPoint 0 -> 2
    useTimelineStore.getState().updateClipTiming('a', 4, 2, 2);

    const clip = getClip('a');
    expect(clip.outPoint).toBe(4);
    const xs = clip.keyframes!.x!;
    expect(xs[0]).toMatchObject({ time: 0, value: 50 });
    expect(xs[xs.length - 1]).toMatchObject({ time: 2, value: 100 });
  });

  it('inspector reset keeps outPoint consistent with duration * speed', () => {
    setTracks([makeClip('a', 0, 4, { inPoint: 3, outPoint: 7 })]);
    useTimelineStore.getState().updateClipTiming('a', 0, 4, 0);
    expect(getClip('a').outPoint).toBe(4);
  });
});
