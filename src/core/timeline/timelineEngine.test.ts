import { describe, it, expect } from 'vitest';
import { TimelineEngine } from './timelineEngine';
import { Clip, Track } from '@/types/timeline';

const createMockClip = (id: string, startTime: number, duration: number, inPoint: number = 0, speed: number = 1): Clip => ({
  id,
  trackId: 'track-1',
  assetId: 'asset-1',
  name: `Clip ${id}`,
  type: 'video',
  startTime,
  duration,
  inPoint,
  outPoint: inPoint + duration * speed,
  speed,
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, zIndex: 1 },
  audio: { volume: 1, muted: false, fadeIn: 0, fadeOut: 0 },
});

describe('TimelineEngine', () => {
  it('splits a clip accurately in the middle', () => {
    const clip = createMockClip('c1', 2.0, 6.0, 0, 1); // 2.0 to 8.0s
    const result = TimelineEngine.splitClip(clip, 5.0);

    expect(result).not.toBeNull();
    if (!result) return;

    const { leftClip, rightClip } = result;

    // Left clip should be from 2.0s to 5.0s (duration 3.0s, inPoint 0, outPoint 3.0)
    expect(leftClip.startTime).toBe(2.0);
    expect(leftClip.duration).toBe(3.0);
    expect(leftClip.inPoint).toBe(0);
    expect(leftClip.outPoint).toBe(3.0);

    // Right clip should be from 5.0s to 8.0s (duration 3.0s, inPoint 3.0, outPoint 6.0)
    expect(rightClip.startTime).toBe(5.0);
    expect(rightClip.duration).toBe(3.0);
    expect(rightClip.inPoint).toBe(3.0);
    expect(rightClip.outPoint).toBe(6.0);
  });

  it('rejects split outside of clip boundaries', () => {
    const clip = createMockClip('c1', 2.0, 6.0);
    expect(TimelineEngine.splitClip(clip, 1.5)).toBeNull();
    expect(TimelineEngine.splitClip(clip, 8.5)).toBeNull();
    expect(TimelineEngine.splitClip(clip, 2.0)).toBeNull();
    expect(TimelineEngine.splitClip(clip, 8.0)).toBeNull();
  });

  it('trims start of clip correctly', () => {
    const clip = createMockClip('c1', 2.0, 6.0, 0); // 2.0s to 8.0s
    const trimmed = TimelineEngine.trimStart(clip, 4.0);

    expect(trimmed).not.toBeNull();
    if (!trimmed) return;

    expect(trimmed.startTime).toBe(4.0);
    expect(trimmed.duration).toBe(4.0);
    expect(trimmed.inPoint).toBe(2.0);
  });

  it('trims end of clip correctly', () => {
    const clip = createMockClip('c1', 2.0, 6.0, 0); // 2.0s to 8.0s
    const trimmed = TimelineEngine.trimEnd(clip, 5.0, 10.0);

    expect(trimmed).not.toBeNull();
    if (!trimmed) return;

    expect(trimmed.startTime).toBe(2.0);
    expect(trimmed.duration).toBe(3.0);
    expect(trimmed.outPoint).toBe(3.0);
  });

  it('finds active clips at current time', () => {
    const track1: Track = {
      id: 't1',
      name: 'Video 1',
      type: 'video',
      isMuted: false,
      isLocked: false,
      isHidden: false,
      clips: [createMockClip('c1', 0, 5), createMockClip('c2', 5, 5)],
    };

    const track2: Track = {
      id: 't2',
      name: 'Video 2',
      type: 'video',
      isMuted: false,
      isLocked: false,
      isHidden: false,
      clips: [createMockClip('c3', 2, 4)],
    };

    // At 3 seconds, both c1 (track1) and c3 (track2) are active
    const active = TimelineEngine.getActiveClipsAtTime([track1, track2], 3.0);
    expect(active.length).toBe(2);
    expect(active.map((c) => c.id)).toContain('c1');
    expect(active.map((c) => c.id)).toContain('c3');
  });

  it('calculates magnetic snap accurately', () => {
    const snapPoints = [0, 5.0, 10.0];
    const snapResult = TimelineEngine.calculateSnap(5.08, snapPoints, 0.15);

    expect(snapResult.isSnapped).toBe(true);
    expect(snapResult.snappedTime).toBe(5.0);

    const noSnapResult = TimelineEngine.calculateSnap(6.5, snapPoints, 0.15);
    expect(noSnapResult.isSnapped).toBe(false);
    expect(noSnapResult.snappedTime).toBe(6.5);
  });
});
