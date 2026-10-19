import { create } from 'zustand';
import { Track, Clip, Transform, AudioSettings, TextProperties, AnimatableProp, Easing } from '@/types/timeline';
import { MediaAsset } from '@/types/asset';
import { TimelineEngine } from '@/core/timeline/timelineEngine';
import {
  evaluateProp,
  findKeyframeAt,
  removeKeyframe as removeKeyframeFrom,
  scaleKeyframeTimes,
  shiftKeyframesForStartTrim,
  upsertKeyframe,
} from '@/core/animation/keyframes';
import { Logger } from '@/core/logger';
import { clampTime } from '@/utils/time';
import { useProjectStore } from './useProjectStore';

interface TimelineStoreState {
  tracks: Track[];
  selectedClipId: string | null;
  currentTime: number; // in seconds
  zoom: number; // Pixels per second (e.g. 50px = 1s)
  isPlaying: boolean;
  snappingEnabled: boolean;

  // Actions
  setCurrentTime: (time: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  togglePlay: () => void;
  setZoom: (zoom: number) => void;
  setSelectedClipId: (id: string | null) => void;
  toggleSnapping: () => void;

  // Track & Clip Actions
  addTrack: (type: 'video' | 'audio' | 'overlay' | 'text') => void;
  deleteTrack: (trackId: string) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackHide: (trackId: string) => void;
  toggleTrackLock: (trackId: string) => void;

  addClipFromAsset: (asset: MediaAsset, targetTrackId?: string, startTime?: number) => Clip | null;
  addTextClip: (preset?: Partial<TextProperties>, targetTrackId?: string, startTime?: number) => Clip | null;
  removeClip: (clipId: string) => void;
  splitSelectedClip: () => boolean;
  splitClipById: (clipId: string, splitTime: number) => boolean;
  updateClipTiming: (clipId: string, startTime: number, duration: number, inPoint?: number, outPoint?: number) => void;
  updateClipTransform: (clipId: string, transform: Partial<Transform>) => void;
  setClipSpeed: (clipId: string, speed: number) => void;
  toggleKeyframe: (clipId: string, prop: AnimatableProp) => void;
  removeKeyframe: (clipId: string, prop: AnimatableProp, keyframeId: string) => void;
  setKeyframeEasing: (clipId: string, prop: AnimatableProp, keyframeId: string, easing: Easing) => void;
  updateClipAudio: (clipId: string, audio: Partial<AudioSettings>) => void;
  updateClipText: (clipId: string, text: Partial<TextProperties>) => void;
  moveClipToTrack: (clipId: string, targetTrackId: string, newStartTime: number) => void;
  addTransition: (clipId: string, position: 'in' | 'out', transitionType: 'cross-dissolve' | 'fade-to-black' | 'slide' | 'wipe') => void;
  removeTransition: (clipId: string, position: 'in' | 'out') => void;
  /** Replaces all tracks (undo/redo). Keeps the project duration and selection consistent. */
  restoreTracks: (tracks: Track[]) => void;
}

const syncProjectDuration = (tracks: Track[]) => {
  let maxEnd = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      const end = clip.startTime + clip.duration;
      if (end > maxEnd) {
        maxEnd = end;
      }
    }
  }
  const targetDuration = Math.max(5.0, Math.ceil(maxEnd));
  useProjectStore.getState().setDuration(targetDuration);
};

export const MIN_CLIP_SPEED = 0.25;
export const MAX_CLIP_SPEED = 4;

/** Writes the animated value of a property into the static transform (used when its last keyframe goes away) */
const bakeProp = (transform: Transform, prop: AnimatableProp, value: number): Transform => {
  switch (prop) {
    case 'x':
      return { ...transform, x: value };
    case 'y':
      return { ...transform, y: value };
    case 'opacity':
      return { ...transform, opacity: value };
    case 'scale':
      return { ...transform, scaleX: value, scaleY: value };
  }
};

const initialTracks: Track[] = [
  {
    id: 'track-t1',
    name: 'Metin / Başlık (T1)',
    type: 'text',
    isMuted: false,
    isLocked: false,
    isHidden: false,
    clips: [],
  },
  {
    id: 'track-v2',
    name: 'Video 2 (Overlay / PiP)',
    type: 'overlay',
    isMuted: false,
    isLocked: false,
    isHidden: false,
    clips: [],
  },
  {
    id: 'track-v1',
    name: 'Ana Video (V1)',
    type: 'video',
    isMuted: false,
    isLocked: false,
    isHidden: false,
    clips: [],
  },
  {
    id: 'track-a1',
    name: 'Ses / Müzik (A1)',
    type: 'audio',
    isMuted: false,
    isLocked: false,
    isHidden: false,
    clips: [],
  },
];

export const useTimelineStore = create<TimelineStoreState>((set, get) => ({
  tracks: initialTracks,
  selectedClipId: null,
  currentTime: 0,
  zoom: 60,
  isPlaying: false,
  snappingEnabled: true,

  setCurrentTime: (time) => {
    set({ currentTime: Math.max(0, time) });
  },

  setIsPlaying: (isPlaying) => {
    set({ isPlaying });
  },

  togglePlay: () => {
    set((state) => ({ isPlaying: !state.isPlaying }));
  },

  setZoom: (zoom) => {
    set({ zoom: Math.min(200, Math.max(10, zoom)) });
  },

  setSelectedClipId: (selectedClipId) => {
    set({ selectedClipId });
  },

  restoreTracks: (tracks) => {
    syncProjectDuration(tracks);
    set((state) => ({
      tracks,
      selectedClipId: tracks.some((t) => t.clips.some((c) => c.id === state.selectedClipId))
        ? state.selectedClipId
        : null,
    }));
  },

  toggleSnapping: () => {
    set((state) => ({ snappingEnabled: !state.snappingEnabled }));
  },

  addTrack: (type) => {
    const id = `track-${type}-${Date.now()}`;
    const count = get().tracks.filter((t) => t.type === type).length + 1;
    const name =
      type === 'audio'
        ? `Ses ${count} (A${count})`
        : type === 'text'
        ? `Metin ${count} (T${count})`
        : `Video ${count} (V${count})`;
    set((state) => {
      const newTracks = [...state.tracks, { id, name, type, isMuted: false, isLocked: false, isHidden: false, clips: [] }];
      syncProjectDuration(newTracks);
      return { tracks: newTracks };
    });
  },

  deleteTrack: (trackId) => {
    set((state) => {
      const newTracks = state.tracks.filter((t) => t.id !== trackId);
      syncProjectDuration(newTracks);
      return { tracks: newTracks };
    });
  },

  toggleTrackMute: (trackId) => {
    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, isMuted: !t.isMuted } : t)),
    }));
  },

  toggleTrackHide: (trackId) => {
    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, isHidden: !t.isHidden } : t)),
    }));
  },

  toggleTrackLock: (trackId) => {
    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, isLocked: !t.isLocked } : t)),
    }));
  },

  addClipFromAsset: (asset, _targetTrackId, requestedStartTime) => {
    const { tracks, currentTime } = get();
    const duration = asset.duration || 5.0;
    const startTime = requestedStartTime !== undefined ? requestedStartTime : currentTime;

    const trackType = asset.type === 'audio' ? 'audio' : 'video';

    // Find a free track or auto-create a new lane so clips never overlap
    const { targetTrackId: resolvedTrackId, updatedTracks } = TimelineEngine.findOrCreateTrackForPlacement(
      tracks,
      trackType,
      startTime,
      duration
    );

    const clipId = crypto.randomUUID ? crypto.randomUUID() : `clip-${Date.now()}`;

    const newClip: Clip = {
      id: clipId,
      trackId: resolvedTrackId,
      assetId: asset.id,
      name: asset.name,
      type: asset.type,
      startTime: clampTime(startTime),
      duration: clampTime(duration),
      inPoint: 0,
      outPoint: clampTime(duration),
      speed: 1.0,
      transform: {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
        zIndex: 1,
      },
      audio: {
        volume: 1.0,
        muted: false,
        fadeIn: 0,
        fadeOut: 0,
      },
    };

    const finalTracks = updatedTracks.map((t) =>
      t.id === resolvedTrackId ? { ...t, clips: [...t.clips, newClip].sort((a, b) => a.startTime - b.startTime) } : t
    );

    syncProjectDuration(finalTracks);

    set({
      tracks: finalTracks,
      selectedClipId: newClip.id,
    });

    Logger.info('useTimelineStore', `Clip placed on track ${resolvedTrackId} without collision`, newClip);
    return newClip;
  },

  addTextClip: (preset, _targetTrackId, requestedStartTime) => {
    const { tracks, currentTime } = get();
    const duration = 3.0; // 3 seconds default for text
    const startTime = requestedStartTime !== undefined ? requestedStartTime : currentTime;

    // Find a free text track or auto-create T2, T3... so texts never overlap
    const { targetTrackId: resolvedTrackId, updatedTracks } = TimelineEngine.findOrCreateTrackForPlacement(
      tracks,
      'text',
      startTime,
      duration
    );

    const clipId = crypto.randomUUID ? crypto.randomUUID() : `text-clip-${Date.now()}`;

    const defaultText: TextProperties = {
      content: 'Metin Girin',
      fontFamily: 'Inter',
      fontSize: 54,
      color: '#FFFFFF',
      fontWeight: 'bold',
      fontStyle: 'normal',
      textAlign: 'center',
      stroke: {
        color: '#000000',
        width: 3,
      },
      shadow: {
        color: 'rgba(0,0,0,0.7)',
        blur: 8,
        offsetX: 2,
        offsetY: 4,
      },
      backgroundBox: {
        enabled: false,
        color: 'rgba(0,0,0,0.6)',
        padding: 12,
        borderRadius: 8,
      },
      ...preset,
    };

    const newClip: Clip = {
      id: clipId,
      trackId: resolvedTrackId,
      assetId: `text-asset-${clipId}`,
      name: defaultText.content,
      type: 'text',
      startTime: clampTime(startTime),
      duration: clampTime(duration),
      inPoint: 0,
      outPoint: clampTime(duration),
      speed: 1.0,
      transform: {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
        zIndex: 5,
      },
      audio: {
        volume: 1.0,
        muted: true,
        fadeIn: 0,
        fadeOut: 0,
      },
      text: defaultText,
    };

    const finalTracks = updatedTracks.map((t) =>
      t.id === resolvedTrackId ? { ...t, clips: [...t.clips, newClip].sort((a, b) => a.startTime - b.startTime) } : t
    );

    syncProjectDuration(finalTracks);

    set({
      tracks: finalTracks,
      selectedClipId: newClip.id,
    });

    Logger.info('useTimelineStore', `Text clip placed on track ${resolvedTrackId} without collision`, newClip);
    return newClip;
  },

  removeClip: (clipId) => {
    Logger.info('useTimelineStore', `Removing clip: ${clipId}`);
    const { tracks } = get();
    const newTracks = tracks.map((t) => ({
      ...t,
      clips: t.clips.filter((c) => c.id !== clipId),
    }));

    syncProjectDuration(newTracks);

    set((state) => ({
      tracks: newTracks,
      selectedClipId: state.selectedClipId === clipId ? null : state.selectedClipId,
    }));
  },

  splitClipById: (clipId, splitTime) => {
    const { tracks } = get();
    for (const track of tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip) {
        const splitResult = TimelineEngine.splitClip(clip, splitTime);
        if (!splitResult) return false;

        const updatedClips = track.clips
          .filter((c) => c.id !== clipId)
          .concat([splitResult.leftClip, splitResult.rightClip])
          .sort((a, b) => a.startTime - b.startTime);

        const newTracks = tracks.map((t) => (t.id === track.id ? { ...t, clips: updatedClips } : t));
        syncProjectDuration(newTracks);

        set({
          tracks: newTracks,
          selectedClipId: splitResult.rightClip.id,
        });
        return true;
      }
    }
    return false;
  },

  splitSelectedClip: () => {
    const { selectedClipId, currentTime } = get();
    if (!selectedClipId) {
      Logger.warn('useTimelineStore', 'Cannot split: No clip selected.');
      return false;
    }
    return get().splitClipById(selectedClipId, currentTime);
  },

  updateClipTiming: (clipId, startTime, duration, inPoint, outPoint) => {
    const { tracks } = get();
    const newTracks = tracks.map((t) => {
      const clip = t.clips.find((c) => c.id === clipId);
      if (!clip) return t;

      // Prevent collision with other clips on the same track
      const validStart = TimelineEngine.clampClipTimingWithoutCollision(t, clipId, startTime, duration);

      return {
        ...t,
        clips: t.clips
          .map((c) => {
            if (c.id === clipId) {
              const newDuration = clampTime(duration);
              const newInPoint = inPoint !== undefined ? clampTime(inPoint) : c.inPoint;
              // Keep source range consistent with the timeline length: outPoint = inPoint + duration * speed
              const newOutPoint =
                outPoint !== undefined
                  ? clampTime(outPoint)
                  : inPoint !== undefined
                  ? clampTime(newInPoint + newDuration * c.speed)
                  : c.outPoint;

              // Left-edge trim (start and in-point both moved): keep keyframes anchored to the content
              const startDelta = validStart - c.startTime;
              const isStartTrim = inPoint !== undefined && Math.abs(newInPoint - c.inPoint) > 0.0005;
              const keyframes = isStartTrim ? shiftKeyframesForStartTrim(c.keyframes, startDelta) : c.keyframes;

              return {
                ...c,
                startTime: validStart,
                duration: newDuration,
                inPoint: newInPoint,
                outPoint: newOutPoint,
                keyframes,
              };
            }
            return c;
          })
          .sort((a, b) => a.startTime - b.startTime),
      };
    });

    syncProjectDuration(newTracks);

    set({ tracks: newTracks });
  },

  updateClipTransform: (clipId, transformUpdates) => {
    const { currentTime } = get();
    set((state) => ({
      tracks: state.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id !== clipId) return c;

          // Auto-key: an animated property is edited as a keyframe at the playhead, not as a static value
          const localTime = clampTime(currentTime - c.startTime, 0, c.duration);
          const staticUpdates: Partial<Transform> = { ...transformUpdates };
          let keyframes = c.keyframes;

          const animatedEdits: Array<[AnimatableProp, number | undefined]> = [
            ['x', transformUpdates.x],
            ['y', transformUpdates.y],
            ['opacity', transformUpdates.opacity],
            ['scale', transformUpdates.scaleX ?? transformUpdates.scaleY],
          ];

          for (const [prop, value] of animatedEdits) {
            if (value === undefined || !(c.keyframes?.[prop]?.length ?? 0)) continue;
            keyframes = upsertKeyframe(keyframes, prop, localTime, value);
            if (prop === 'scale') {
              delete staticUpdates.scaleX;
              delete staticUpdates.scaleY;
            } else {
              delete staticUpdates[prop];
            }
          }

          return { ...c, keyframes, transform: { ...c.transform, ...staticUpdates } };
        }),
      })),
    }));
  },

  setClipSpeed: (clipId, speed) => {
    const newSpeed = Math.round(Math.min(MAX_CLIP_SPEED, Math.max(MIN_CLIP_SPEED, speed)) * 100) / 100;
    const { tracks } = get();

    const newTracks = tracks.map((t) => {
      const clip = t.clips.find((c) => c.id === clipId);
      if (!clip || (clip.type !== 'video' && clip.type !== 'audio')) return t;
      if (Math.abs(clip.speed - newSpeed) < 0.001) return t;

      // Source range stays the same; the timeline length follows the new speed.
      // outPoint - inPoint is the exact source span (duration * speed would accumulate rounding on slider drags).
      const storedSpan = clip.outPoint - clip.inPoint;
      const sourceSpan = storedSpan > 0.001 ? storedSpan : clip.duration * clip.speed;
      const newDuration = clampTime(sourceSpan / newSpeed);
      const delta = newDuration - clip.duration;
      const oldEnd = clip.startTime + clip.duration;

      return {
        ...t,
        clips: t.clips
          .map((c) => {
            if (c.id === clipId) {
              return {
                ...c,
                speed: newSpeed,
                duration: newDuration,
                outPoint: clampTime(c.inPoint + sourceSpan),
                keyframes: scaleKeyframeTimes(c.keyframes, newDuration / clip.duration),
              };
            }
            // Ripple: clips that followed this one on the same track move with its end
            if (c.startTime >= oldEnd - 0.001) {
              return { ...c, startTime: clampTime(c.startTime + delta, 0) };
            }
            return c;
          })
          .sort((a, b) => a.startTime - b.startTime),
      };
    });

    syncProjectDuration(newTracks);
    set({ tracks: newTracks });
    Logger.info('useTimelineStore', `Clip ${clipId} speed set to ${newSpeed}x`);
  },

  toggleKeyframe: (clipId, prop) => {
    const { currentTime } = get();
    set((state) => ({
      tracks: state.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id !== clipId) return c;

          const localTime = clampTime(currentTime - c.startTime, 0, c.duration);
          const existing = findKeyframeAt(c.keyframes, prop, localTime);

          if (existing) {
            const remaining = (c.keyframes?.[prop]?.length ?? 0) - 1;
            const transform = remaining === 0 ? bakeProp(c.transform, prop, existing.value) : c.transform;
            return { ...c, transform, keyframes: removeKeyframeFrom(c.keyframes, prop, existing.id) };
          }

          const value = evaluateProp(c, prop, localTime);
          return { ...c, keyframes: upsertKeyframe(c.keyframes, prop, localTime, value) };
        }),
      })),
    }));
  },

  removeKeyframe: (clipId, prop, keyframeId) => {
    set((state) => ({
      tracks: state.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id !== clipId) return c;
          const target = c.keyframes?.[prop]?.find((k) => k.id === keyframeId);
          if (!target) return c;
          const remaining = (c.keyframes?.[prop]?.length ?? 0) - 1;
          const transform = remaining === 0 ? bakeProp(c.transform, prop, target.value) : c.transform;
          return { ...c, transform, keyframes: removeKeyframeFrom(c.keyframes, prop, keyframeId) };
        }),
      })),
    }));
  },

  setKeyframeEasing: (clipId, prop, keyframeId, easing) => {
    set((state) => ({
      tracks: state.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          const list = c.keyframes?.[prop];
          if (c.id !== clipId || !list) return c;
          return {
            ...c,
            keyframes: { ...c.keyframes, [prop]: list.map((k) => (k.id === keyframeId ? { ...k, easing } : k)) },
          };
        }),
      })),
    }));
  },

  updateClipAudio: (clipId, audioUpdates) => {
    set((state) => ({
      tracks: state.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => (c.id === clipId ? { ...c, audio: { ...c.audio, ...audioUpdates } } : c)),
      })),
    }));
  },

  updateClipText: (clipId, textUpdates) => {
    set((state) => ({
      tracks: state.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) =>
          c.id === clipId && c.text
            ? {
                ...c,
                name: textUpdates.content ?? c.name,
                text: { ...c.text, ...textUpdates },
              }
            : c
        ),
      })),
    }));
  },

  moveClipToTrack: (clipId, targetTrackId, newStartTime) => {
    const { tracks } = get();
    let foundClip: Clip | null = null;

    const cleanedTracks = tracks.map((t) => {
      const clip = t.clips.find((c) => c.id === clipId);
      if (clip) {
        foundClip = { ...clip, trackId: targetTrackId, startTime: clampTime(newStartTime) };
        return { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
      }
      return t;
    });

    if (!foundClip) return;

    const newTracks = cleanedTracks.map((t) =>
      t.id === targetTrackId
        ? { ...t, clips: [...t.clips, foundClip!].sort((a, b) => a.startTime - b.startTime) }
        : t
    );

    syncProjectDuration(newTracks);

    set({ tracks: newTracks });
  },

  addTransition: (clipId, position, transitionType) => {
    const { tracks } = get();
    const duration = 1.0; // default 1 second transition
    
    let updatedClip: Clip | null = null;

    const newTracks = tracks.map((t) => {
      const clipIndex = t.clips.findIndex((c) => c.id === clipId);
      if (clipIndex !== -1) {
        const clip = t.clips[clipIndex];
        const newClip = { ...clip };
        
        if (position === 'in') {
          newClip.transitionIn = { type: transitionType, duration };
          // If we add an in-transition, and there's a previous clip, we need to shift THIS clip left by duration
          if (clipIndex > 0) {
            const prevClip = t.clips[clipIndex - 1];
            // Only shift if they are already adjacent
            if (Math.abs(prevClip.startTime + prevClip.duration - newClip.startTime) < 0.1) {
              newClip.startTime = Math.max(0, newClip.startTime - duration);
            }
          }
        } else {
          newClip.transitionOut = { type: transitionType, duration };
        }
        
        updatedClip = newClip;
        
        const newClips = [...t.clips];
        newClips[clipIndex] = newClip;
        
        // If we added a transition out, and there's a next clip adjacent, we shift the NEXT clip left
        if (position === 'out' && clipIndex < newClips.length - 1) {
          const nextClip = newClips[clipIndex + 1];
          if (Math.abs(newClip.startTime + newClip.duration - nextClip.startTime) < 0.1) {
            const updatedNextClip = { ...nextClip, startTime: Math.max(0, nextClip.startTime - duration) };
            newClips[clipIndex + 1] = updatedNextClip;
          }
        }
        
        return { ...t, clips: newClips.sort((a, b) => a.startTime - b.startTime) };
      }
      return t;
    });

    if (updatedClip) {
      syncProjectDuration(newTracks);
      set({ tracks: newTracks });
      Logger.info('useTimelineStore', `Added ${position} transition ${transitionType} to clip ${clipId}`);
    }
  },

  removeTransition: (clipId, position) => {
    const { tracks } = get();
    
    const newTracks = tracks.map((t) => {
      const clipIndex = t.clips.findIndex((c) => c.id === clipId);
      if (clipIndex !== -1) {
        const clip = t.clips[clipIndex];
        const newClip = { ...clip };
        const durationToRevert = position === 'in' ? (newClip.transitionIn?.duration || 0) : (newClip.transitionOut?.duration || 0);
        
        if (position === 'in') {
          delete newClip.transitionIn;
          // Revert the left shift
          if (clipIndex > 0 && durationToRevert > 0) {
            newClip.startTime += durationToRevert;
          }
        } else {
          delete newClip.transitionOut;
        }
        
        const newClips = [...t.clips];
        newClips[clipIndex] = newClip;
        
        // Revert shift on next clip if we are removing transitionOut
        if (position === 'out' && clipIndex < newClips.length - 1 && durationToRevert > 0) {
          const nextClip = newClips[clipIndex + 1];
          // Check if they were overlapped
          if (Math.abs((newClip.startTime + newClip.duration - durationToRevert) - nextClip.startTime) < 0.1) {
            const updatedNextClip = { ...nextClip, startTime: nextClip.startTime + durationToRevert };
            newClips[clipIndex + 1] = updatedNextClip;
          }
        }

        return { ...t, clips: newClips.sort((a, b) => a.startTime - b.startTime) };
      }
      return t;
    });

    syncProjectDuration(newTracks);
    set({ tracks: newTracks });
    Logger.info('useTimelineStore', `Removed ${position} transition from clip ${clipId}`);
  },
}));
