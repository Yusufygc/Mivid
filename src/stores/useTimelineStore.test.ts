import { describe, it, expect, beforeEach } from 'vitest';
import { useTimelineStore, clearClipboard } from './useTimelineStore';
import { useProjectStore } from './useProjectStore';
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

describe('useTimelineStore - color adjustment', () => {
  beforeEach(() => setTracks([makeClip('a', 0, 4), { ...makeClip('t', 0, 2), type: 'text' }]));

  it('stores a partial update on top of the neutral values', () => {
    useTimelineStore.getState().updateClipColor('a', { saturation: 0 });
    expect(getClip('a')!.colorGrading).toEqual({ brightness: 0, contrast: 1, saturation: 0 });
  });

  it('clamps and merges successive edits', () => {
    useTimelineStore.getState().updateClipColor('a', { brightness: 9 });
    useTimelineStore.getState().updateClipColor('a', { contrast: 1.5 });
    expect(getClip('a')!.colorGrading).toEqual({ brightness: 1, contrast: 1.5, saturation: 1 });
  });

  it('removes the grading when every value returns to neutral', () => {
    useTimelineStore.getState().updateClipColor('a', { contrast: 1.4 });
    useTimelineStore.getState().updateClipColor('a', { contrast: 1 });
    expect(getClip('a')!.colorGrading).toBeUndefined();
  });

  it('ignores text clips', () => {
    useTimelineStore.getState().updateClipColor('t', { contrast: 1.4 });
    expect(getClip('t')!.colorGrading).toBeUndefined();
  });
});

describe('useTimelineStore - region effects and fit', () => {
  const clips = (): Clip[] => useTimelineStore.getState().tracks.flatMap((t) => t.clips);

  beforeEach(() => {
    useProjectStore.getState().loadProject({
      id: 'p',
      name: 'p',
      width: 1920,
      height: 1080,
      fps: 30,
      aspectRatio: '16:9',
      duration: 30,
      backgroundColor: '#000000',
    });
    setTracks([makeClip('a', 0, 10)]);
    useTimelineStore.setState({
      tracks: [
        { id: 'track-t1', name: 'T1', type: 'text', isMuted: false, isLocked: false, isHidden: false, clips: [] },
        ...useTimelineStore.getState().tracks,
      ],
    });
  });

  it('adds a blur over the middle of the frame at the playhead, on a new effect track below the text track', () => {
    useTimelineStore.setState({ currentTime: 2 });
    const clip = useTimelineStore.getState().addEffectClip('blur')!;

    expect(clip.type).toBe('effect');
    expect(clip.startTime).toBe(2);
    expect(clip.duration).toBe(3);
    expect(clip.effect).toMatchObject({ kind: 'blur', shape: 'rect', width: 768, height: 432 });
    expect(clip.transform).toMatchObject({ x: 0, y: 0 });
    expect(useTimelineStore.getState().selectedClipId).toBe(clip.id);

    const order = useTimelineStore.getState().tracks.map((t) => t.type);
    expect(order).toEqual(['text', 'effect', 'video']);
  });

  it('places a drawn region by its center offset and size', () => {
    const clip = useTimelineStore
      .getState()
      .addEffectClip('pixelate', { centerX: -200, centerY: 100, width: 300, height: 150 })!;
    expect(clip.effect).toMatchObject({ kind: 'pixelate', width: 300, height: 150 });
    expect(clip.transform).toMatchObject({ x: -200, y: 100 });
  });

  it('puts overlapping effects on separate effect tracks', () => {
    useTimelineStore.getState().addEffectClip('blur');
    useTimelineStore.getState().addEffectClip('blackbox');
    expect(useTimelineStore.getState().tracks.filter((t) => t.type === 'effect')).toHaveLength(2);
  });

  it('updates and clamps the effect and renames the clip with its default kind name', () => {
    const clip = useTimelineStore.getState().addEffectClip('blur')!;
    useTimelineStore.getState().updateClipEffect(clip.id, { kind: 'pixelate', strength: 9, width: 1 });
    const updated = clips().find((c) => c.id === clip.id)!;
    expect(updated.effect).toMatchObject({ kind: 'pixelate', strength: 1, width: 8 });
    expect(updated.name).toBe('Mozaik');
  });

  it('keeps a custom name when the effect kind changes', () => {
    const clip = useTimelineStore.getState().addEffectClip('blur')!;
    useTimelineStore.setState((state) => ({
      tracks: state.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => (c.id === clip.id ? { ...c, name: 'Plaka' } : c)),
      })),
    }));
    useTimelineStore.getState().updateClipEffect(clip.id, { kind: 'blackbox' });
    expect(clips().find((c) => c.id === clip.id)!.name).toBe('Plaka');
  });

  it('sets fit and backdrop blur on video clips only', () => {
    useTimelineStore.getState().updateClipFit('a', 'cover');
    useTimelineStore.getState().updateClipBackdrop('a', 0.6);
    expect(clips().find((c) => c.id === 'a')).toMatchObject({ fit: 'cover', backdropBlur: 0.6 });

    useTimelineStore.getState().updateClipBackdrop('a', 0);
    expect(clips().find((c) => c.id === 'a')!.backdropBlur).toBeUndefined();

    const effect = useTimelineStore.getState().addEffectClip('blur')!;
    useTimelineStore.getState().updateClipFit(effect.id, 'cover');
    expect(clips().find((c) => c.id === effect.id)!.fit).toBeUndefined();
  });

  it('new footage fits its frame by default while audio does not', () => {
    const video = useTimelineStore
      .getState()
      .addClipFromAsset({ id: 'v1', name: 'v', path: 'C:/v.mp4', url: '', type: 'video', duration: 5, size: 1, createdAt: 0 })!;
    const audio = useTimelineStore
      .getState()
      .addClipFromAsset({ id: 'a1', name: 'a', path: 'C:/a.mp3', url: '', type: 'audio', duration: 5, size: 1, createdAt: 0 })!;
    expect(video.fit).toBe('contain');
    expect(audio.fit).toBeUndefined();
  });
});

describe('useTimelineStore - chroma key', () => {
  beforeEach(() => setTracks([makeClip('a', 0, 4), { ...makeClip('t', 0, 2), type: 'text' }]));

  it('turns the key on with the green defaults and edits it', () => {
    useTimelineStore.getState().updateClipChroma('a', {});
    expect(getClip('a')!.chromaKey).toEqual({ color: '#00ff00', similarity: 0.3, blend: 0.1 });

    useTimelineStore.getState().updateClipChroma('a', { color: '#0000FF', similarity: 5 });
    expect(getClip('a')!.chromaKey).toEqual({ color: '#0000ff', similarity: 1, blend: 0.1 });
  });

  it('removes the key with null and ignores text clips', () => {
    useTimelineStore.getState().updateClipChroma('a', {});
    useTimelineStore.getState().updateClipChroma('a', null);
    expect(getClip('a')!.chromaKey).toBeUndefined();

    useTimelineStore.getState().updateClipChroma('t', {});
    expect(getClip('t')!.chromaKey).toBeUndefined();
  });
});

describe('useTimelineStore - group move', () => {
  const clips = (): Clip[] => useTimelineStore.getState().tracks.flatMap((t) => t.clips);

  beforeEach(() => setTracks([makeClip('a', 1, 2), makeClip('b', 4, 2), makeClip('c', 10, 2)]));

  it('moves the given clips together and keeps their distance', () => {
    expect(useTimelineStore.getState().moveClipsBy(['a', 'b'], 2)).toBe(true);
    expect(getClip('a')!.startTime).toBe(3);
    expect(getClip('b')!.startTime).toBe(6);
    expect(getClip('c')!.startTime).toBe(10);
  });

  it('stops at the start of the timeline instead of pushing a clip below zero', () => {
    useTimelineStore.getState().moveClipsBy(['a', 'b'], -5);
    expect(getClip('a')!.startTime).toBe(0);
    expect(getClip('b')!.startTime).toBe(3); // same distance as before (3s)
  });

  it('is rejected when a moved clip would run into one that stays', () => {
    expect(useTimelineStore.getState().moveClipsBy(['a', 'b'], 5)).toBe(false); // b would hit c at 10
    expect(getClip('a')!.startTime).toBe(1);
    expect(getClip('b')!.startTime).toBe(4);
  });

  it('is rejected for clips on a locked track and for a zero move', () => {
    useTimelineStore.setState((state) => ({ tracks: state.tracks.map((t) => ({ ...t, isLocked: true })) }));
    expect(useTimelineStore.getState().moveClipsBy(['a'], 1)).toBe(false);
    useTimelineStore.setState((state) => ({ tracks: state.tracks.map((t) => ({ ...t, isLocked: false })) }));
    expect(useTimelineStore.getState().moveClipsBy(['a'], 0)).toBe(false);
    expect(clips()).toHaveLength(3);
  });

  it('keeps the project duration in sync', () => {
    useTimelineStore.getState().moveClipsBy(['c'], 20);
    expect(useProjectStore.getState().project.duration).toBe(32);
  });
});

describe('useTimelineStore - freeze frame', () => {
  const clips = (): Clip[] =>
    useTimelineStore
      .getState()
      .tracks.flatMap((t) => t.clips)
      .sort((a, b) => a.startTime - b.startTime);

  beforeEach(() => {
    setTracks([makeClip('a', 0, 10), makeClip('b', 12, 3)]);
    useTimelineStore.setState({ selectedClipId: 'a', currentTime: 4 });
  });

  it('splits the clip at the playhead and inserts a held frame, pushing later clips', () => {
    expect(useTimelineStore.getState().insertFreezeFrame(2)).toBe(true);

    const [left, frozen, right, later] = clips();
    expect(left).toMatchObject({ startTime: 0, duration: 4, outPoint: 4 });
    expect(frozen).toMatchObject({ freeze: true, startTime: 4, duration: 2, inPoint: 4, speed: 1 });
    expect(frozen.audio.muted).toBe(true);
    expect(right).toMatchObject({ startTime: 6, duration: 6, inPoint: 4 });
    expect(later).toMatchObject({ id: 'b', startTime: 14 }); // 12 + 2
    expect(useTimelineStore.getState().selectedClipId).toBe(frozen.id);
  });

  it('holds the right source frame of a sped-up clip', () => {
    setTracks([makeClip('a', 0, 5, { speed: 2, outPoint: 10 })]);
    useTimelineStore.setState({ selectedClipId: 'a', currentTime: 2 });
    useTimelineStore.getState().insertFreezeFrame(1);
    const frozen = clips().find((c) => c.freeze)!;
    expect(frozen.inPoint).toBe(4); // 2s on the timeline at 2x = 4s of source
  });

  it('bakes the animated transform at that moment into the held frame', () => {
    setTracks([
      makeClip('a', 0, 10, {
        keyframes: { x: [{ id: 'k1', time: 0, value: 0, easing: 'linear' }, { id: 'k2', time: 10, value: 100, easing: 'linear' }] },
      }),
    ]);
    useTimelineStore.setState({ selectedClipId: 'a', currentTime: 5 });
    useTimelineStore.getState().insertFreezeFrame(2);
    const frozen = clips().find((c) => c.freeze)!;
    expect(frozen.transform.x).toBeCloseTo(50);
    expect(frozen.keyframes).toBeUndefined();
  });

  it('inserts before the clip when the playhead is on its first frame', () => {
    useTimelineStore.setState({ currentTime: 0 });
    useTimelineStore.getState().insertFreezeFrame(2);
    const [frozen, original] = clips();
    expect(frozen).toMatchObject({ freeze: true, startTime: 0, duration: 2, inPoint: 0 });
    expect(original).toMatchObject({ id: 'a', startTime: 2, duration: 10 });
  });

  it('holds the last frame when the playhead is at the end of the clip', () => {
    useTimelineStore.setState({ currentTime: 10 });
    useTimelineStore.getState().insertFreezeFrame(2);
    const [original, frozen] = clips();
    expect(original).toMatchObject({ id: 'a', duration: 10 });
    expect(frozen).toMatchObject({ freeze: true, startTime: 10, duration: 2 });
    expect(frozen.inPoint).toBeCloseTo(9.95);
  });

  it('refuses audio, text, frozen and out-of-range cases', () => {
    useTimelineStore.setState({ currentTime: 40 });
    expect(useTimelineStore.getState().insertFreezeFrame()).toBe(false); // playhead outside the clip

    useTimelineStore.setState({ currentTime: 4, selectedClipId: null });
    expect(useTimelineStore.getState().insertFreezeFrame()).toBe(false);

    setTracks([makeClip('m', 0, 5, { type: 'audio' })]);
    useTimelineStore.setState({ selectedClipId: 'm', currentTime: 2 });
    expect(useTimelineStore.getState().insertFreezeFrame()).toBe(false);

    setTracks([makeClip('a', 0, 10)]);
    useTimelineStore.setState({ selectedClipId: 'a', currentTime: 4 });
    useTimelineStore.getState().insertFreezeFrame();
    // the new frozen clip is selected now, freezing it again is not allowed
    expect(useTimelineStore.getState().insertFreezeFrame()).toBe(false);
  });

  it('ignores speed changes on a frozen clip', () => {
    useTimelineStore.getState().insertFreezeFrame(2);
    const frozen = clips().find((c) => c.freeze)!;
    useTimelineStore.getState().setClipSpeed(frozen.id, 2);
    expect(clips().find((c) => c.id === frozen.id)).toMatchObject({ speed: 1, duration: 2 });
  });
});

describe('useTimelineStore - auto keyframe', () => {
  beforeEach(() => {
    setTracks([makeClip('a', 2, 6)]);
    useTimelineStore.setState({ autoKeyframe: false, currentTime: 2 });
  });

  it('is off by default: moving a clip changes the static position only', () => {
    useTimelineStore.setState({ currentTime: 4 });
    useTimelineStore.getState().updateClipTransform('a', { x: 100 });
    expect(getClip('a')!.transform.x).toBe(100);
    expect(getClip('a')!.keyframes).toBeUndefined();
  });

  it('when on, the first move at a later time keys the old value at the start and the new one at the playhead', () => {
    useTimelineStore.getState().setAutoKeyframe(true);
    useTimelineStore.setState({ currentTime: 4 }); // clip-local 2
    useTimelineStore.getState().updateClipTransform('a', { x: 100, y: 40 });

    const clip = getClip('a')!;
    expect(clip.keyframes!.x!.map((k) => [k.time, k.value])).toEqual([[0, 0], [2, 100]]);
    expect(clip.keyframes!.y!.map((k) => [k.time, k.value])).toEqual([[0, 0], [2, 40]]);
    expect(clip.transform.x).toBe(0); // the static value stays, the keyframes carry the motion
  });

  it('follows a subject: a second move at another time adds a second key without touching the first', () => {
    useTimelineStore.getState().setAutoKeyframe(true);
    useTimelineStore.setState({ currentTime: 4 });
    useTimelineStore.getState().updateClipTransform('a', { x: 100 });
    useTimelineStore.setState({ currentTime: 6 });
    useTimelineStore.getState().updateClipTransform('a', { x: 250 });

    expect(getClip('a')!.keyframes!.x!.map((k) => [k.time, k.value])).toEqual([[0, 0], [2, 100], [4, 250]]);
  });

  it('a drag (many moves at the same time) keeps one key at that time', () => {
    useTimelineStore.getState().setAutoKeyframe(true);
    useTimelineStore.setState({ currentTime: 4 });
    for (const x of [10, 20, 30, 40]) useTimelineStore.getState().updateClipTransform('a', { x });
    expect(getClip('a')!.keyframes!.x).toHaveLength(2);
    expect(getClip('a')!.keyframes!.x![1].value).toBe(40);
  });

  it('at the very start only one key is needed', () => {
    useTimelineStore.getState().setAutoKeyframe(true);
    useTimelineStore.getState().updateClipTransform('a', { x: 30 }); // playhead on the clip start
    expect(getClip('a')!.keyframes!.x).toHaveLength(1);
  });

  it('works for scale and rotation too', () => {
    useTimelineStore.getState().setAutoKeyframe(true);
    useTimelineStore.setState({ currentTime: 5 });
    useTimelineStore.getState().updateClipTransform('a', { scaleX: 2, scaleY: 2, rotation: 30 });
    const clip = getClip('a')!;
    expect(clip.keyframes!.scale!.map((k) => k.value)).toEqual([1, 2]);
    expect(clip.keyframes!.rotation!.map((k) => k.value)).toEqual([0, 30]);
  });
});
