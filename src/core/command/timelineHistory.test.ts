import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initTimelineHistory, COALESCE_WINDOW_MS, changedIds, describeChange } from './timelineHistory';
import { commandManager } from './commandManager';
import { useTimelineStore } from '@/stores/useTimelineStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { Clip, Track } from '@/types/timeline';

const makeClip = (id: string, startTime: number, duration: number): Clip => ({
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

const clips = (): Clip[] => useTimelineStore.getState().tracks.flatMap((t) => t.clips);
const getClip = (id: string): Clip | undefined => clips().find((c) => c.id === id);

describe('timeline history', () => {
  let cleanup: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    setTracks([makeClip('a', 0, 4)]);
    commandManager.clear();
    cleanup = initTimelineHistory();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('undoes and redoes a transform change', () => {
    useTimelineStore.getState().updateClipTransform('a', { x: 50 });
    expect(getClip('a')!.transform.x).toBe(50);
    expect(commandManager.canUndo()).toBe(true);

    commandManager.undo();
    expect(getClip('a')!.transform.x).toBe(0);
    expect(commandManager.canRedo()).toBe(true);

    commandManager.redo();
    expect(getClip('a')!.transform.x).toBe(50);
  });

  it('merges rapid edits of the same clip (drag) into one undo step', () => {
    for (let x = 10; x <= 100; x += 10) {
      useTimelineStore.getState().updateClipTransform('a', { x });
      vi.advanceTimersByTime(16);
    }
    expect(getClip('a')!.transform.x).toBe(100);

    commandManager.undo();
    expect(getClip('a')!.transform.x).toBe(0);
    expect(commandManager.canUndo()).toBe(false);
  });

  it('keeps edits separate once the coalesce window has passed', () => {
    useTimelineStore.getState().updateClipTransform('a', { x: 10 });
    vi.advanceTimersByTime(COALESCE_WINDOW_MS + 50);
    useTimelineStore.getState().updateClipTransform('a', { x: 20 });

    commandManager.undo();
    expect(getClip('a')!.transform.x).toBe(10);
    commandManager.undo();
    expect(getClip('a')!.transform.x).toBe(0);
  });

  it('never merges structural changes (add / delete / split)', () => {
    useTimelineStore.getState().splitClipById('a', 2);
    expect(clips()).toHaveLength(2);
    useTimelineStore.getState().removeClip(clips()[0].id);
    expect(clips()).toHaveLength(1);

    commandManager.undo(); // delete
    expect(clips()).toHaveLength(2);
    commandManager.undo(); // split
    expect(clips()).toHaveLength(1);
    expect(getClip('a')!.duration).toBe(4);
  });

  it('keeps the project duration in sync when undoing', () => {
    useTimelineStore.getState().updateClipTiming('a', 20, 4);
    expect(useProjectStore.getState().project.duration).toBe(24);

    commandManager.undo();
    expect(useProjectStore.getState().project.duration).toBe(5);
    commandManager.redo();
    expect(useProjectStore.getState().project.duration).toBe(24);
  });

  it('clears a selection that no longer exists after undo', () => {
    useTimelineStore.getState().splitClipById('a', 2);
    expect(useTimelineStore.getState().selectedClipId).toBeTruthy();

    commandManager.undo();
    expect(useTimelineStore.getState().selectedClipId).toBeNull();
  });

  it('starts a new step after an undo instead of merging into the old one', () => {
    useTimelineStore.getState().updateClipTransform('a', { x: 10 });
    commandManager.undo();
    useTimelineStore.getState().updateClipTransform('a', { x: 30 });

    expect(commandManager.canRedo()).toBe(false);
    commandManager.undo();
    expect(getClip('a')!.transform.x).toBe(0);
  });

  it('records speed changes with ripple as one step', () => {
    setTracks([makeClip('a', 0, 4), makeClip('b', 4, 2)]);
    commandManager.clear();
    useTimelineStore.getState().setClipSpeed('a', 2);
    expect(getClip('b')!.startTime).toBe(2);

    commandManager.undo();
    expect(getClip('a')!.speed).toBe(1);
    expect(getClip('a')!.duration).toBe(4);
    expect(getClip('b')!.startTime).toBe(4);
  });

  it('handles Ctrl+Z and Ctrl+Y from the keyboard outside text fields', () => {
    const listeners: Array<(e: KeyboardEvent) => void> = [];
    const fakeWindow = {
      addEventListener: (_: string, fn: (e: KeyboardEvent) => void) => listeners.push(fn),
      removeEventListener: () => {},
    };
    vi.stubGlobal('window', fakeWindow);
    const stop = initTimelineHistory();

    useTimelineStore.getState().updateClipTransform('a', { x: 70 });
    const press = (key: string, shiftKey = false) =>
      listeners.forEach((fn) => fn({ key, ctrlKey: true, shiftKey, altKey: false, target: null, preventDefault() {} } as unknown as KeyboardEvent));

    press('z');
    expect(getClip('a')!.transform.x).toBe(0);
    press('y');
    expect(getClip('a')!.transform.x).toBe(70);
    press('z');
    press('Z', true); // Ctrl+Shift+Z = redo
    expect(getClip('a')!.transform.x).toBe(70);

    stop();
    vi.unstubAllGlobals();
  });
});

describe('changedIds / describeChange', () => {
  const trackOf = (list: Clip[]): Track => ({
    id: 't',
    name: 'T',
    type: 'video',
    isMuted: false,
    isLocked: false,
    isHidden: false,
    clips: list,
  });

  it('lists only the clips that changed by reference', () => {
    const a = makeClip('a', 0, 1);
    const b = makeClip('b', 1, 1);
    const before = [trackOf([a, b])];
    const after = [trackOf([a, { ...b, startTime: 5 }])];
    expect(changedIds(before, after)).toEqual(['b']);
  });

  it('flags added and removed clips and track flag changes', () => {
    const a = makeClip('a', 0, 1);
    expect(changedIds([trackOf([a])], [trackOf([])])).toEqual(['a']);
    expect(changedIds([trackOf([])], [trackOf([a])])).toEqual(['a']);
    expect(changedIds([trackOf([a])], [{ ...trackOf([a]), isMuted: true }])).toEqual(['track:t']);
  });

  it('describes the kind of change', () => {
    const a = makeClip('a', 0, 1);
    expect(describeChange([trackOf([])], [trackOf([a])])).toBe('Klip ekle');
    expect(describeChange([trackOf([a])], [trackOf([])])).toBe('Klip sil');
    expect(describeChange([trackOf([a])], [trackOf([{ ...a, startTime: 3 }])])).toBe('Klip düzenle');
  });
});
