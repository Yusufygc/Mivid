import { Clip, Track } from '@/types/timeline';
import { Logger } from '@/core/logger';
import { clampTime } from '@/utils/time';

export interface SplitResult {
  leftClip: Clip;
  rightClip: Clip;
}

export class TimelineEngine {
  /**
   * Splits a clip into two distinct clips at the given splitTime
   */
  public static splitClip(clip: Clip, splitTime: number): SplitResult | null {
    const clipStart = clip.startTime;
    const clipEnd = clip.startTime + clip.duration;

    // Check if split point is strictly inside the clip bounds
    if (splitTime <= clipStart || splitTime >= clipEnd) {
      Logger.warn('TimelineEngine', 'Split time is outside clip bounds', { clipId: clip.id, splitTime, clipStart, clipEnd });
      return null;
    }

    const leftDuration = clampTime(splitTime - clipStart);
    const rightDuration = clampTime(clipEnd - splitTime);

    // Left clip retains start time and inPoint
    const leftClip: Clip = {
      ...clip,
      id: crypto.randomUUID ? crypto.randomUUID() : `${clip.id}-L-${Date.now()}`,
      duration: leftDuration,
      outPoint: clampTime(clip.inPoint + leftDuration * clip.speed),
    };

    // Right clip starts at splitTime, inPoint moves forward
    const rightClip: Clip = {
      ...clip,
      id: crypto.randomUUID ? crypto.randomUUID() : `${clip.id}-R-${Date.now()}`,
      startTime: splitTime,
      duration: rightDuration,
      inPoint: leftClip.outPoint,
      outPoint: clip.outPoint,
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
      return null; // Minimum clip duration is 0.1s
    }

    const delta = newStartTime - clip.startTime;
    const newInPoint = clip.inPoint + delta * clip.speed;

    if (newInPoint < 0) {
      return null; // Cannot trim beyond start of asset
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
      return null; // Minimum clip duration is 0.1s
    }

    const newDuration = clampTime(newEndTime - clip.startTime);
    const newOutPoint = clampTime(clip.inPoint + newDuration * clip.speed);

    if (maxAssetDuration !== undefined && newOutPoint > maxAssetDuration) {
      return null; // Cannot trim beyond asset total duration
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
    for (const track of tracks) {
      if (track.isHidden) continue;
      for (const clip of track.clips) {
        if (time >= clip.startTime && time < clip.startTime + clip.duration) {
          active.push(clip);
        }
      }
    }
    // Sort by zIndex
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
