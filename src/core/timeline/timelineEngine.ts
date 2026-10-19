import { Clip, Track, TrackType } from '@/types/timeline';
import { Logger } from '@/core/logger';
import { clampTime } from '@/utils/time';
import { splitKeyframes } from '@/core/animation/keyframes';

export interface SplitResult {
  leftClip: Clip;
  rightClip: Clip;
}

export interface ClipTimeInterval {
  startTime: number;
  duration: number;
  transitionIn?: { duration: number };
  transitionOut?: { duration: number };
}

export class TimelineEngine {
  /**
   * Checks if two time intervals overlap
   */
  public static doesClipOverlap(
    clipA: ClipTimeInterval,
    clipB: ClipTimeInterval
  ): boolean {
    const startA = clipA.startTime + (clipA.transitionIn?.duration || 0);
    const endA = clipA.startTime + clipA.duration - (clipA.transitionOut?.duration || 0);
    const startB = clipB.startTime + (clipB.transitionIn?.duration || 0);
    const endB = clipB.startTime + clipB.duration - (clipB.transitionOut?.duration || 0);
    return startA < endB - 0.001 && endA > startB + 0.001;
  }


  /**
   * Checks if a given track is free from any clip collision in the specified [startTime, startTime + duration] range
   */
  public static isTrackFreeAt(
    track: Track,
    startTime: number,
    duration: number,
    ignoreClipId?: string,
    transitionIn?: { duration: number },
    transitionOut?: { duration: number }
  ): boolean {
    return track.clips.every(
      (c) => c.id === ignoreClipId || !TimelineEngine.doesClipOverlap({ startTime, duration, transitionIn, transitionOut }, c)
    );
  }

  /**
   * Clamps a clip's candidate start time so it never overlaps adjacent clips on the same track
   */
  public static clampClipTimingWithoutCollision(
    track: Track,
    clipId: string,
    candidateStart: number,
    duration: number,
    transitionIn?: { duration: number },
    transitionOut?: { duration: number }
  ): number {
    const otherClips = track.clips.filter((c) => c.id !== clipId).sort((a, b) => a.startTime - b.startTime);
    let clampedStart = Math.max(0, candidateStart);

    for (const other of otherClips) {
      // Adjusted bounds to allow overlap for transition durations
      const otherEffectiveStart = other.startTime + (other.transitionIn?.duration || 0);
      const otherEffectiveEnd = other.startTime + other.duration - (other.transitionOut?.duration || 0);
      const candidateEffectiveStart = clampedStart + (transitionIn?.duration || 0);
      const candidateEffectiveEnd = clampedStart + duration - (transitionOut?.duration || 0);

      // If candidate falls inside an existing clip
      if (candidateEffectiveStart < otherEffectiveEnd && candidateEffectiveEnd > otherEffectiveStart) {
        if (candidateStart + duration / 2 < other.startTime + other.duration / 2) {
          clampedStart = Math.max(0, otherEffectiveStart - duration + (transitionOut?.duration || 0));
        } else {
          clampedStart = otherEffectiveEnd - (transitionIn?.duration || 0);
        }
      }
    }

    return clampTime(clampedStart);
  }

  /**
   * Finds an existing free track of the given type, or automatically creates a new track lane
   * so overlapping clips never stack on the same track
   */
  public static findOrCreateTrackForPlacement(
    tracks: Track[],
    type: TrackType,
    startTime: number,
    duration: number
  ): { targetTrackId: string; updatedTracks: Track[] } {
    // Treat 'video' and 'overlay' as compatible video layers
    const matchingTracks = tracks.filter((t) =>
      type === 'video' || type === 'overlay' ? t.type === 'video' || t.type === 'overlay' : t.type === type
    );

    // 1. Find existing free track of matching type
    for (const track of matchingTracks) {
      if (TimelineEngine.isTrackFreeAt(track, startTime, duration)) {
        return { targetTrackId: track.id, updatedTracks: tracks };
      }
    }

    // 2. If all matching tracks are occupied at this time interval, create a new track lane
    const count = matchingTracks.length + 1;
    const newTrackId = `track-${type}-${Date.now()}`;
    const name =
      type === 'text'
        ? `Metin ${count} (T${count})`
        : type === 'audio'
        ? `Ses ${count} (A${count})`
        : type === 'effect'
        ? `Efekt ${count} (E${count})`
        : `Video ${count} (V${count})`;

    const newTrack: Track = {
      id: newTrackId,
      name,
      type,
      isMuted: false,
      isLocked: false,
      isHidden: false,
      clips: [],
    };

    let updatedTracks: Track[];
    if (type === 'text') {
      // Put text tracks at the top of the timeline
      updatedTracks = [newTrack, ...tracks];
    } else if (type === 'audio') {
      // Put audio tracks at the bottom
      updatedTracks = [...tracks, newTrack];
    } else {
      // Put overlay/video above other video tracks
      const firstVideoIdx = tracks.findIndex((t) => t.type === 'video' || t.type === 'overlay');
      if (firstVideoIdx >= 0) {
        updatedTracks = [...tracks.slice(0, firstVideoIdx), newTrack, ...tracks.slice(firstVideoIdx)];
      } else {
        updatedTracks = [newTrack, ...tracks];
      }
    }

    Logger.info('TimelineEngine', `Auto-created new track lane for parallel placement: ${name}`);
    return { targetTrackId: newTrackId, updatedTracks };
  }

  /**
   * Splits a clip into two distinct clips at the given splitTime
   */
  public static splitClip(clip: Clip, splitTime: number): SplitResult | null {
    const clipStart = clip.startTime;
    const clipEnd = clip.startTime + clip.duration;

    if (splitTime <= clipStart || splitTime >= clipEnd) {
      Logger.warn('TimelineEngine', 'Split time is outside clip bounds', { clipId: clip.id, splitTime, clipStart, clipEnd });
      return null;
    }

    const leftDuration = clampTime(splitTime - clipStart);
    const rightDuration = clampTime(clipEnd - splitTime);

    const { left: leftKeyframes, right: rightKeyframes } = splitKeyframes(clip.keyframes, splitTime - clipStart);

    const leftClip: Clip = {
      ...clip,
      id: crypto.randomUUID ? crypto.randomUUID() : `${clip.id}-L-${Date.now()}`,
      duration: leftDuration,
      outPoint: clampTime(clip.inPoint + leftDuration * clip.speed),
      keyframes: leftKeyframes,
    };

    const rightClip: Clip = {
      ...clip,
      id: crypto.randomUUID ? crypto.randomUUID() : `${clip.id}-R-${Date.now()}`,
      startTime: splitTime,
      duration: rightDuration,
      inPoint: leftClip.outPoint,
      outPoint: clip.outPoint,
      keyframes: rightKeyframes,
    };

    Logger.info('TimelineEngine', `Split clip ${clip.name} into two at ${splitTime.toFixed(2)}s`);
    return { leftClip, rightClip };
  }

  /**
   * Trims the start (in-point) of a clip, shifting its start position on timeline
   */
  public static trimStart(clip: Clip, newStartTime: number): Clip | null {
    const clipEnd = clip.startTime + clip.duration;
    if (newStartTime >= clipEnd - 0.1) {
      return null;
    }

    const delta = newStartTime - clip.startTime;
    const newInPoint = clip.inPoint + delta * clip.speed;

    if (newInPoint < 0) {
      return null;
    }

    const newDuration = clampTime(clipEnd - newStartTime);

    return {
      ...clip,
      startTime: clampTime(newStartTime),
      duration: newDuration,
      inPoint: clampTime(newInPoint),
    };
  }

  /**
   * Trims the end (out-point) of a clip
   */
  public static trimEnd(clip: Clip, newEndTime: number, maxAssetDuration?: number): Clip | null {
    if (newEndTime <= clip.startTime + 0.1) {
      return null;
    }

    const newDuration = clampTime(newEndTime - clip.startTime);
    const newOutPoint = clampTime(clip.inPoint + newDuration * clip.speed);

    if (maxAssetDuration !== undefined && newOutPoint > maxAssetDuration) {
      return null;
    }

    return {
      ...clip,
      duration: newDuration,
      outPoint: newOutPoint,
    };
  }

  /**
   * Finds all active clips at a specific time across all tracks
   */
  public static getActiveClipsAtTime(tracks: Track[], time: number): Clip[] {
    const active: Clip[] = [];
    // Lanes higher up on the timeline are drawn on top: walk from the bottom lane to the top one,
    // so with equal z-index the upper lane ends up later (above) in the list
    for (const track of [...tracks].reverse()) {
      if (track.isHidden) continue;
      for (const clip of track.clips) {
        if (time >= clip.startTime && time < clip.startTime + clip.duration) {
          active.push(clip);
        }
      }
    }
    return active.sort((a, b) => (a.transform.zIndex || 0) - (b.transform.zIndex || 0));
  }

  /**
   * Calculates snapping point near candidate time with existing clip edges and playhead
   */
  public static calculateSnap(
    candidateTime: number,
    snapPoints: number[],
    threshold: number = 0.15
  ): { snappedTime: number; isSnapped: boolean } {
    let closestDiff = Infinity;
    let bestSnap = candidateTime;

    for (const point of snapPoints) {
      const diff = Math.abs(point - candidateTime);
      if (diff < threshold && diff < closestDiff) {
        closestDiff = diff;
        bestSnap = point;
      }
    }

    return {
      snappedTime: bestSnap,
      isSnapped: closestDiff !== Infinity,
    };
  }
}
