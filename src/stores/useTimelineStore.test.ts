import { describe, it, expect, beforeEach } from 'vitest';
import { useTimelineStore, clearClipboard } from './useTimelineStore';
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

  it('moveKeyframes retimes every property at that time', () => {
    useTimelineStore.setState({ currentTime: 3 });
    useTimelineStore.getState().toggleKeyframe('a', 'x'); // local 1
    useTimelineStore.getState().toggleKeyframe('a', 'opacity');
    useTimelineStore.getState().moveKeyframes('a', 1, 2.5);
    const clip = getClip('a');
    expect(clip.keyframes!.x![0].time).toBe(2.5);
    expect(clip.keyframes!.opacity![0].time).toBe(2.5);
  });

  it('removeKeyframesAt bakes the value of properties that lose their last keyframe', () => {
    useTimelineStore.setState({ currentTime: 2 });
    useTimelineStore.getState().toggleKeyframe('a', 'x'); // local 0
    useTimelineStore.setState({ currentTime: 4 });
    useTimelineStore.getState().updateClipTransform('a', { x: 80 }); // local 2
    useTimelineStore.setState({ selectedKeyframeTime: 2 });

    useTimelineStore.getState().removeKeyframesAt('a', 2);
    let clip = getClip('a');
    expect(clip.keyframes!.x).toHaveLength(1);
    expect(useTimelineStore.getState().selectedKeyframeTime).toBeNull();

    useTimelineStore.getState().removeKeyframesAt('a', 0);
    clip = getClip('a');
    expect(clip.keyframes).toBeUndefined();
    expect(clip.transform.x).toBe(0); // value of the last removed keyframe
  });

  it('a keyframe selection is dropped when another clip is selected', () => {
    useTimelineStore.setState({ selectedClipId: 'a', selectedKeyframeTime: 1 });
    useTimelineStore.getState().setSelectedClipId('a');
    expect(useTimelineStore.getState().selectedKeyframeTime).toBe(1);
    useTimelineStore.getState().setSelectedClipId('b');
    expect(useTimelineStore.getState().selectedKeyframeTime).toBeNull();
  });

  it('inspector reset keeps outPoint consistent with duration * speed', () => {
    setTracks([makeClip('a', 0, 4, { inPoint: 3, outPoint: 7 })]);
    useTimelineStore.getState().updateClipTiming('a', 0, 4, 0);
    expect(getClip('a').outPoint).toBe(4);
  });
});

describe('useTimelineStore - multi-select, clipboard, ripple delete', () => {
  const ids = () => clips().map((c) => c.id).sort();
  const clips = (): Clip[] => useTimelineStore.getState().tracks.flatMap((t) => t.clips);

  beforeEach(() => {
    clearClipboard();
    setTracks([makeClip('a', 0, 2), makeClip('b', 2, 2), makeClip('c', 4, 2), makeClip('d', 8, 1)]);
  });

  it('toggles clips in and out of the selection; the last clicked is primary', () => {
    const s = useTimelineStore.getState();
    s.setSelectedClipId('a');
    s.toggleClipSelection('b');
    expect(useTimelineStore.getState().getSelectedClipIds()).toEqual(['a', 'b']);
    expect(useTimelineStore.getState().selectedClipId).toBe('b');

    useTimelineStore.getState().toggleClipSelection('a');
    expect(useTimelineStore.getState().getSelectedClipIds()).toEqual(['b']);

    useTimelineStore.getState().toggleClipSelection('b');
    expect(useTimelineStore.getState().selectedClipId).toBeNull();

    useTimelineStore.getState().setSelectedClipId('c');
    expect(useTimelineStore.getState().extraSelectedIds).toEqual([]);
  });

  it('deletes every selected clip', () => {
    useTimelineStore.getState().setSelectedClipId('a');
    useTimelineStore.getState().toggleClipSelection('c');
    expect(useTimelineStore.getState().removeSelectedClips()).toBe(2);
    expect(ids()).toEqual(['b', 'd']);
    expect(getClip('b')!.startTime).toBe(2); // no ripple
    expect(useTimelineStore.getState().getSelectedClipIds()).toEqual([]);
  });

  it('ripple delete closes the gaps left by the deleted clips', () => {
    useTimelineStore.getState().setSelectedClipId('a');
    useTimelineStore.getState().toggleClipSelection('c');
    useTimelineStore.getState().removeSelectedClips(true);

    expect(getClip('b')!.startTime).toBe(0); // a (2s) was before it
    expect(getClip('d')!.startTime).toBe(4); // a and c (2s each) were before it
  });

  it('copy and paste place the clips at the playhead keeping their relative offsets', () => {
    const s = useTimelineStore.getState();
    s.setSelectedClipId('a');
    s.toggleClipSelection('b'); // a: 0-2, b: 2-4
    expect(useTimelineStore.getState().copySelectedClips()).toBe(2);

    useTimelineStore.setState({ currentTime: 20 });
    expect(useTimelineStore.getState().pasteClips()).toBe(2);

    const pasted = clips().filter((c) => !['a', 'b', 'c', 'd'].includes(c.id)).sort((x, y) => x.startTime - y.startTime);
    expect(pasted.map((c) => c.startTime)).toEqual([20, 22]);
    expect(pasted.map((c) => c.duration)).toEqual([2, 2]);
    expect(useTimelineStore.getState().getSelectedClipIds().sort()).toEqual(pasted.map((c) => c.id).sort());
    // the originals are untouched and the pasted clips are independent copies
    expect(getClip('a')!.startTime).toBe(0);
    expect(new Set(clips().map((c) => c.id)).size).toBe(6);
  });

  it('pasting onto an occupied spot moves the clip to a new lane instead of overlapping', () => {
    useTimelineStore.getState().setSelectedClipId('a');
    useTimelineStore.getState().copySelectedClips();
    useTimelineStore.setState({ currentTime: 0 }); // right on top of the original
    useTimelineStore.getState().pasteClips();

    const tracks = useTimelineStore.getState().tracks;
    expect(tracks.length).toBe(2);
    expect(tracks.every((t) => t.clips.every((c, i, arr) => i === 0 || arr[i - 1].startTime + arr[i - 1].duration <= c.startTime + 0.001))).toBe(true);
  });

  it('duplicate puts the copy right after the selection', () => {
    useTimelineStore.getState().setSelectedClipId('a');
    useTimelineStore.getState().toggleClipSelection('b'); // selection ends at 4, c starts at 4 on the same track
    expect(useTimelineStore.getState().duplicateSelectedClips()).toBe(2);

    const copies = clips().filter((c) => !['a', 'b', 'c', 'd'].includes(c.id)).sort((x, y) => x.startTime - y.startTime);
    expect(copies.map((c) => c.startTime)).toEqual([4, 6]); // pushed to a free lane because c sits at 4-6 on V1
    expect(copies.every((c) => c.trackId !== 'track-v1' || c.startTime >= 6)).toBe(true);
  });

  it('paste does nothing with an empty clipboard', () => {
    expect(useTimelineStore.getState().pasteClips()).toBe(0);
    expect(ids()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('undo restores a ripple delete as one step and drops stale selections', async () => {
    const { initTimelineHistory } = await import('@/core/command/timelineHistory');
    const { commandManager } = await import('@/core/command/commandManager');
    commandManager.clear();
    const stop = initTimelineHistory();

    useTimelineStore.getState().setSelectedClipId('a');
    useTimelineStore.getState().toggleClipSelection('c');
    useTimelineStore.getState().removeSelectedClips(true);
    commandManager.undo();

    expect(ids()).toEqual(['a', 'b', 'c', 'd']);
    expect(getClip('d')!.startTime).toBe(8);
    stop();
  });
});
