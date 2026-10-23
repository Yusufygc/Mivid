import { create } from 'zustand';
import {
  Track,
  Clip,
  Transform,
  AudioSettings,
  TextProperties,
  AnimatableProp,
  Easing,
  ColorGrading,
  EffectKind,
  EffectSettings,
  FitMode,
  ChromaKey,
  Transition,
  TransitionType,
} from '@/types/timeline';
import {
  DEFAULT_TRANSITION_DIRECTION,
  DEFAULT_TRANSITION_SECONDS,
  clampTransitionSeconds,
  transitionUsesDirection,
} from '@/core/transitions/transitions';
import { DEFAULT_CHROMA_KEY, clampChroma } from '@/core/chroma/chromaKey';
import { DEFAULT_EFFECT_SECONDS, EFFECT_KIND_LABELS, clampEffect, defaultEffect } from '@/core/effects/regionEffects';
import { NEUTRAL_GRADING, clampGrading, isNeutralGrading } from '@/core/color/colorGrading';
import { MediaAsset } from '@/types/asset';
import { TimelineEngine } from '@/core/timeline/timelineEngine';
import {
  ANIMATABLE_PROPS,
  evaluateProp,
  getBaseValue,
  findKeyframeAt,
  KEYFRAME_EPSILON,
  moveKeyframesAtTime,
  resolveTransform,
  removeKeyframesAtTime,
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
  /**
   * When on, moving, scaling or rotating a clip writes keyframes at the playhead even if the property has none yet:
   * scrub, move, scrub, move ... follows a moving subject by hand.
   */
  autoKeyframe: boolean;
  /** Clip-local time of the keyframe marker selected on the timeline (all properties at that time) */
  selectedKeyframeTime: number | null;
  /** Other selected clips besides `selectedClipId` (multi-select) */
  extraSelectedIds: string[];
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
  setSelectedKeyframeTime: (time: number | null) => void;
  setAutoKeyframe: (on: boolean) => void;
  /** Ctrl/Shift click: adds the clip to the selection or removes it; the clicked clip becomes the primary one */
  toggleClipSelection: (id: string) => void;
  /** Ids of all selected clips (primary + extra), in selection order, only clips that still exist */
  getSelectedClipIds: () => string[];
  /**
   * Moves clips together along the timeline by `delta` seconds, keeping their distances.
   * The move is clamped at 0 and rejected (returns false) when a moved clip would hit one that stays or sits on a locked track.
   */
  moveClipsBy: (ids: string[], delta: number) => boolean;
  /**
   * Freezes the frame under the playhead of the selected video clip: the clip is split there and a still of that
   * frame is inserted for `seconds`; everything after it on the track moves later. Returns false when it is not possible.
   */
  insertFreezeFrame: (seconds?: number) => boolean;
  /** Deletes the selected clips. With `ripple`, later clips on the same track move left to close the gap. */
  removeSelectedClips: (ripple?: boolean) => number;
  /** Copies the selected clips to the clipboard; returns how many were copied */
  copySelectedClips: () => number;
  /** Pastes the clipboard at the playhead (or `atTime`) and selects the pasted clips; returns how many were pasted */
  pasteClips: (atTime?: number) => number;
  /** Copies the selection and pastes it right after the selection */
  duplicateSelectedClips: () => number;
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
  /** Moves all keyframes at `fromTime` to `toTime` (clip-local seconds) */
  moveKeyframes: (clipId: string, fromTime: number, toTime: number) => void;
  /** Removes all keyframes at a clip-local time; properties left without keyframes keep their last value */
  removeKeyframesAt: (clipId: string, time: number) => void;
  updateClipAudio: (clipId: string, audio: Partial<AudioSettings>) => void;
  /** Updates the color adjustment; a neutral result removes it from the clip */
  updateClipColor: (clipId: string, grading: Partial<ColorGrading>) => void;
  /**
   * Adds a region effect (blur, mosaic, black box) at the playhead on an effect track.
   * `region` is the box in project pixels, center given as offset from the frame center; default is the middle 40%.
   */
  addEffectClip: (
    kind: EffectKind,
    region?: { centerX: number; centerY: number; width: number; height: number }
  ) => Clip | null;
  updateClipEffect: (clipId: string, effect: Partial<EffectSettings>) => void;
  updateClipFit: (clipId: string, fit: FitMode) => void;
  /** Turns the green screen on (defaults) / edits it; `null` removes it */
  updateClipChroma: (clipId: string, key: Partial<ChromaKey> | null) => void;
  /** 0 turns the blurred backdrop off */
  updateClipBackdrop: (clipId: string, strength: number) => void;
  updateClipText: (clipId: string, text: Partial<TextProperties>) => void;
  moveClipToTrack: (clipId: string, targetTrackId: string, newStartTime: number) => void;
  addTransition: (clipId: string, position: 'in' | 'out', transitionType: TransitionType) => void;
  /**
   * Edits a transition: type, duration, direction, easing. A new duration moves the neighbor that overlaps this
   * clip (the one a transition pulled left) so the overlap always equals the transition length.
   */
  updateTransition: (clipId: string, position: 'in' | 'out', patch: Partial<Transition>) => void;
  removeTransition: (clipId: string, position: 'in' | 'out') => void;
  /** Replaces all tracks (undo/redo). Keeps the project duration and selection consistent. */
  restoreTracks: (tracks: Track[]) => void;
}

/**
 * Moves every clip after `index` by `delta` seconds. A transition pulls a clip left over its neighbor; the clips behind it
 * follow so the overlap does not leave a gap at the end of the run.
 */
const rippleAfter = (clips: Clip[], index: number, delta: number): Clip[] =>
  Math.abs(delta) < 1e-9 ? clips : clips.map((c, i) => (i > index ? { ...c, startTime: Math.max(0, c.startTime + delta) } : c));

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
    case 'rotation':
      return { ...transform, rotation: value };
    case 'scale':
      return { ...transform, scaleX: value, scaleY: value };
  }
};

type SelectionState = Pick<TimelineStoreState, 'tracks' | 'selectedClipId' | 'extraSelectedIds'>;

/** Selected clip ids in selection order (extras first, primary last), without ids that no longer exist */
const selectedIdsOf = (state: SelectionState): string[] => {
  const existing = new Set(state.tracks.flatMap((t) => t.clips.map((c) => c.id)));
  const ids = [...state.extraSelectedIds, ...(state.selectedClipId ? [state.selectedClipId] : [])];
  return ids.filter((id, i) => existing.has(id) && ids.indexOf(id) === i);
};

/** Clips copied with Ctrl+C / cut; shared by the whole app, not part of the undoable state */
let clipboard: { clips: Clip[]; baseTime: number } | null = null;

export const clearClipboard = (): void => {
  clipboard = null;
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
  selectedKeyframeTime: null,
  autoKeyframe: false,
  extraSelectedIds: [],
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
    set((state) => ({
      selectedClipId,
      extraSelectedIds: [],
      // A keyframe selection belongs to one clip
      selectedKeyframeTime: selectedClipId === state.selectedClipId ? state.selectedKeyframeTime : null,
    }));
  },

  setSelectedKeyframeTime: (selectedKeyframeTime) => {
    set({ selectedKeyframeTime });
  },

  setAutoKeyframe: (autoKeyframe) => {
    set({ autoKeyframe });
  },

  restoreTracks: (tracks) => {
    syncProjectDuration(tracks);
    set((state) => {
      const exists = (id: string | null) => !!id && tracks.some((t) => t.clips.some((c) => c.id === id));
      return {
        tracks,
        selectedClipId: exists(state.selectedClipId) ? state.selectedClipId : null,
        extraSelectedIds: state.extraSelectedIds.filter((id) => exists(id)),
      };
    });
  },

  getSelectedClipIds: () => selectedIdsOf(get()),

  toggleClipSelection: (id) => {
    const current = selectedIdsOf(get());
    const next = current.includes(id) ? current.filter((c) => c !== id) : [...current, id];
    set((state) => ({
      selectedClipId: next.length > 0 ? next[next.length - 1] : null,
      extraSelectedIds: next.slice(0, -1),
      selectedKeyframeTime: next.length > 0 && next[next.length - 1] === state.selectedClipId ? state.selectedKeyframeTime : null,
    }));
  },

  insertFreezeFrame: (seconds = 2) => {
    const { tracks, selectedClipId, currentTime } = get();
    const track = tracks.find((t) => t.clips.some((c) => c.id === selectedClipId));
    const clip = track?.clips.find((c) => c.id === selectedClipId);
    if (!track || !clip || clip.type !== 'video' || clip.freeze) return false;

    const end = clip.startTime + clip.duration;
    if (currentTime < clip.startTime - 1e-6 || currentTime > end + 1e-6) return false;

    const duration = clampTime(Math.max(0.1, seconds));
    const local = currentTime - clip.startTime;
    const atStart = local < 0.02;
    const atEnd = currentTime > end - 0.02;
    const at = atEnd ? end : atStart ? clip.startTime : currentTime;

    // The frame to hold: the source frame at the playhead (the last visible frame at the very end)
    const sourceTime = clampTime(
      atEnd ? Math.max(clip.inPoint, clip.outPoint - 0.05) : clip.inPoint + local * clip.speed
    );

    let before: Clip | null = clip;
    let after: Clip | null = null;
    if (!atStart && !atEnd) {
      const split = TimelineEngine.splitClip(clip, currentTime);
      if (!split) return false;
      before = split.leftClip;
      after = split.rightClip;
    } else if (atStart) {
      before = null;
      after = clip;
    }

    const freezeId = crypto.randomUUID ? crypto.randomUUID() : `freeze-${Date.now()}`;
    const frozen: Clip = {
      ...clip,
      id: freezeId,
      name: `${clip.name} (donmuş kare)`,
      startTime: at,
      duration,
      inPoint: sourceTime,
      outPoint: sourceTime,
      speed: 1,
      freeze: true,
      transform: resolveTransform(clip, Math.min(clip.duration, Math.max(0, local))),
      keyframes: undefined,
      transitionIn: undefined,
      transitionOut: undefined,
      audio: { ...clip.audio, muted: true, fadeIn: 0, fadeOut: 0 },
    };

    const newTracks = tracks.map((t) => {
      if (t.id !== track.id) return t;
      const others = t.clips
        .filter((c) => c.id !== clip.id)
        // everything that started at or after the cut moves later by the length of the freeze
        .map((c) => (c.startTime >= at - 1e-6 ? { ...c, startTime: clampTime(c.startTime + duration) } : c));
      const shiftedAfter = after ? { ...after, startTime: clampTime(after.startTime + duration) } : null;
      return {
        ...t,
        clips: [...others, ...(before ? [before] : []), frozen, ...(shiftedAfter ? [shiftedAfter] : [])].sort(
          (a, b) => a.startTime - b.startTime
        ),
      };
    });

    syncProjectDuration(newTracks);
    set({ tracks: newTracks, selectedClipId: freezeId, extraSelectedIds: [], selectedKeyframeTime: null });
    Logger.info('useTimelineStore', `Freeze frame inserted at ${at.toFixed(2)}s for ${duration}s`);
    return true;
  },

  moveClipsBy: (ids, delta) => {
    const idSet = new Set(ids);
    const { tracks } = get();
    const moving = tracks.flatMap((t) => t.clips).filter((c) => idSet.has(c.id));
    if (moving.length === 0 || Math.abs(delta) < 1e-6) return false;

    // Never move before the start of the timeline
    const earliest = Math.min(...moving.map((c) => c.startTime));
    const safeDelta = Math.max(delta, -earliest);
    if (Math.abs(safeDelta) < 1e-6) return false;

    for (const track of tracks) {
      const mine = track.clips.filter((c) => idSet.has(c.id));
      if (mine.length === 0) continue;
      if (track.isLocked) return false;

      const others = track.clips.filter((c) => !idSet.has(c.id));
      for (const clip of mine) {
        const moved = { ...clip, startTime: clip.startTime + safeDelta };
        if (others.some((other) => TimelineEngine.doesClipOverlap(moved, other))) return false;
      }
    }

    const newTracks = tracks.map((track) =>
      track.clips.some((c) => idSet.has(c.id))
        ? {
            ...track,
            clips: track.clips
              .map((c) => (idSet.has(c.id) ? { ...c, startTime: clampTime(c.startTime + safeDelta, 0) } : c))
              .sort((a, b) => a.startTime - b.startTime),
          }
        : track
    );
    syncProjectDuration(newTracks);
    set({ tracks: newTracks });
    return true;
  },

  removeSelectedClips: (ripple = false) => {
    const ids = new Set(selectedIdsOf(get()));
    if (ids.size === 0) return 0;

    const newTracks = get().tracks.map((track) => {
      const removed = track.clips.filter((c) => ids.has(c.id));
      if (removed.length === 0) return track;

      const kept = track.clips
        .filter((c) => !ids.has(c.id))
        .map((c) => {
          if (!ripple) return c;
          // Close the gaps left by every deleted clip that started before this one
          const shift = removed.filter((r) => r.startTime < c.startTime).reduce((sum, r) => sum + r.duration, 0);
          return shift > 0 ? { ...c, startTime: clampTime(c.startTime - shift, 0) } : c;
        });
      return { ...track, clips: kept };
    });

    syncProjectDuration(newTracks);
    set({ tracks: newTracks, selectedClipId: null, extraSelectedIds: [], selectedKeyframeTime: null });
    Logger.info('useTimelineStore', `Removed ${ids.size} clip(s)${ripple ? ' with ripple' : ''}`);
    return ids.size;
  },

  copySelectedClips: () => {
    const ids = selectedIdsOf(get());
    const clips = get()
      .tracks.flatMap((t) => t.clips)
      .filter((c) => ids.includes(c.id))
      .sort((a, b) => a.startTime - b.startTime);
    if (clips.length === 0) return 0;

    clipboard = { clips, baseTime: clips[0].startTime };
    return clips.length;
  },

  pasteClips: (atTime) => {
    if (!clipboard || clipboard.clips.length === 0) return 0;
    const { clips, baseTime } = clipboard;
    const offset = (atTime ?? get().currentTime) - baseTime;

    let tracks = get().tracks;
    const pastedIds: string[] = [];

    for (const source of clips) {
      const startTime = clampTime(Math.max(0, source.startTime + offset));
      const type = source.type === 'text' ? 'text' : source.type === 'audio' ? 'audio' : 'video';

      // Prefer the clip's own track, otherwise any free lane of the same kind (a new one is created if needed)
      const ownTrack = tracks.find((t) => t.id === source.trackId);
      let trackId: string;
      if (ownTrack && TimelineEngine.isTrackFreeAt(ownTrack, startTime, source.duration)) {
        trackId = ownTrack.id;
      } else {
        const placement = TimelineEngine.findOrCreateTrackForPlacement(tracks, type, startTime, source.duration);
        tracks = placement.updatedTracks;
        trackId = placement.targetTrackId;
      }

      const id = crypto.randomUUID ? crypto.randomUUID() : `clip-${Date.now()}-${pastedIds.length}`;
      pastedIds.push(id);
      const pasted: Clip = { ...source, id, trackId, startTime };
      tracks = tracks.map((t) =>
        t.id === trackId ? { ...t, clips: [...t.clips, pasted].sort((a, b) => a.startTime - b.startTime) } : t
      );
    }

    syncProjectDuration(tracks);
    set({
      tracks,
      selectedClipId: pastedIds[pastedIds.length - 1],
      extraSelectedIds: pastedIds.slice(0, -1),
      selectedKeyframeTime: null,
    });
    Logger.info('useTimelineStore', `Pasted ${pastedIds.length} clip(s)`);
    return pastedIds.length;
  },

  duplicateSelectedClips: () => {
    const ids = selectedIdsOf(get());
    const selected = get()
      .tracks.flatMap((t) => t.clips)
      .filter((c) => ids.includes(c.id));
    if (selected.length === 0) return 0;

    const end = Math.max(...selected.map((c) => c.startTime + c.duration));
    get().copySelectedClips();
    return get().pasteClips(end);
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
    // Stills have no length of their own: five seconds is a sensible default
    const duration = asset.type === 'image' ? 5.0 : asset.duration || 5.0;
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
      // New footage keeps its aspect ratio; old projects without `fit` stay stretched
      fit: asset.type === 'video' || asset.type === 'image' ? 'contain' : undefined,
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
    const { currentTime, autoKeyframe } = get();
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
            ['rotation', transformUpdates.rotation],
            ['scale', transformUpdates.scaleX ?? transformUpdates.scaleY],
          ];

          for (const [prop, value] of animatedEdits) {
            const hasKeys = (c.keyframes?.[prop]?.length ?? 0) > 0;
            if (value === undefined || (!hasKeys && !autoKeyframe)) continue;
            // First keyframe of a property made later than the start: pin the old value at the start so the motion begins there
            if (!hasKeys && localTime > 0.02) keyframes = upsertKeyframe(keyframes, prop, 0, getBaseValue(c, prop));
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
      if (!clip || (clip.type !== 'video' && clip.type !== 'audio') || clip.freeze) return t;
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

  moveKeyframes: (clipId, fromTime, toTime) => {
    set((state) => ({
      tracks: state.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) =>
          c.id === clipId ? { ...c, keyframes: moveKeyframesAtTime(c.keyframes, fromTime, toTime, c.duration) } : c
        ),
      })),
    }));
  },

  removeKeyframesAt: (clipId, time) => {
    set((state) => ({
      selectedKeyframeTime: null,
      tracks: state.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id !== clipId || !c.keyframes) return c;

          // A property that loses its last keyframe keeps the value it had there
          let transform = c.transform;
          for (const prop of ANIMATABLE_PROPS) {
            const list = c.keyframes[prop];
            if (!list || list.length === 0) continue;
            const remaining = list.filter((k) => Math.abs(k.time - time) >= KEYFRAME_EPSILON);
            const removed = list.find((k) => Math.abs(k.time - time) < KEYFRAME_EPSILON);
            if (remaining.length === 0 && removed) transform = bakeProp(transform, prop, removed.value);
          }
          return { ...c, transform, keyframes: removeKeyframesAtTime(c.keyframes, time) };
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

  updateClipColor: (clipId, gradingUpdates) => {
    set((state) => ({
      tracks: state.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id !== clipId || c.type === 'text' || c.type === 'audio') return c;
          const next = clampGrading({ ...NEUTRAL_GRADING, ...c.colorGrading, ...gradingUpdates });
          return { ...c, colorGrading: isNeutralGrading(next) ? undefined : next };
        }),
      })),
    }));
  },

  addEffectClip: (kind, region) => {
    const { tracks, currentTime } = get();
    const project = useProjectStore.getState().project;
    const effect = defaultEffect(project, kind);
    if (region) {
      effect.width = region.width;
      effect.height = region.height;
    }
    const clampedEffect = clampEffect(effect, project);

    const duration = DEFAULT_EFFECT_SECONDS;
    const startTime = clampTime(currentTime);
    const { targetTrackId, updatedTracks } = TimelineEngine.findOrCreateTrackForPlacement(
      tracks,
      'effect',
      startTime,
      duration
    );

    const id = crypto.randomUUID ? crypto.randomUUID() : `effect-${Date.now()}`;
    const clip: Clip = {
      id,
      trackId: targetTrackId,
      assetId: `effect-asset-${id}`,
      name: EFFECT_KIND_LABELS[kind],
      type: 'effect',
      startTime,
      duration,
      inPoint: 0,
      outPoint: duration,
      speed: 1,
      transform: {
        x: region?.centerX ?? 0,
        y: region?.centerY ?? 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
        zIndex: 3,
      },
      audio: { volume: 1, muted: true, fadeIn: 0, fadeOut: 0 },
      effect: clampedEffect,
    };

    const finalTracks = updatedTracks.map((t) =>
      t.id === targetTrackId ? { ...t, clips: [...t.clips, clip].sort((a, b) => a.startTime - b.startTime) } : t
    );
    syncProjectDuration(finalTracks);
    set({ tracks: finalTracks, selectedClipId: id, extraSelectedIds: [], selectedKeyframeTime: null });
    Logger.info('useTimelineStore', `Effect clip added: ${kind}`, { id });
    return clip;
  },

  updateClipEffect: (clipId, effectUpdates) => {
    const project = useProjectStore.getState().project;
    set((state) => ({
      tracks: state.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id !== clipId || !c.effect) return c;
          const next = clampEffect({ ...c.effect, ...effectUpdates }, project);
          // The clip label follows the effect kind until the user renames it (labels are the default names)
          const wasDefaultName = c.name === EFFECT_KIND_LABELS[c.effect.kind];
          return { ...c, effect: next, name: wasDefaultName ? EFFECT_KIND_LABELS[next.kind] : c.name };
        }),
      })),
    }));
  },

  updateClipChroma: (clipId, keyUpdates) => {
    set((state) => ({
      tracks: state.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id !== clipId || (c.type !== 'video' && c.type !== 'image')) return c;
          if (keyUpdates === null) return { ...c, chromaKey: undefined };
          return { ...c, chromaKey: clampChroma({ ...DEFAULT_CHROMA_KEY, ...c.chromaKey, ...keyUpdates }) };
        }),
      })),
    }));
  },

  updateClipFit: (clipId, fit) => {
    set((state) => ({
      tracks: state.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) =>
          c.id === clipId && (c.type === 'video' || c.type === 'image') ? { ...c, fit } : c
        ),
      })),
    }));
  },

  updateClipBackdrop: (clipId, strength) => {
    const value = Math.min(1, Math.max(0, strength));
    set((state) => ({
      tracks: state.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) =>
          c.id === clipId && (c.type === 'video' || c.type === 'image')
            ? { ...c, backdropBlur: value > 0 ? value : undefined }
            : c
        ),
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
    // A clip that already has a transition on that side only changes type: adding again would pull it left a second time
    const existing = tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
    if (existing && (position === 'in' ? existing.transitionIn : existing.transitionOut)) {
      get().updateTransition(clipId, position, { type: transitionType });
      return;
    }
    const duration = DEFAULT_TRANSITION_SECONDS;
    // New transitions ease in and out; the direction only matters for slide and wipe
    const makeTransition = (): Transition => ({
      type: transitionType,
      duration,
      easing: 'ease-in-out',
      ...(transitionUsesDirection(transitionType) ? { direction: DEFAULT_TRANSITION_DIRECTION } : {}),
    });

    let updatedClip: Clip | null = null;

    const newTracks = tracks.map((t) => {
      const clipIndex = t.clips.findIndex((c) => c.id === clipId);
      if (clipIndex !== -1) {
        const clip = t.clips[clipIndex];
        const newClip = { ...clip };

        if (position === 'in') {
          newClip.transitionIn = makeTransition();
          // If we add an in-transition, and there's a previous clip, we need to shift THIS clip left by duration
          if (clipIndex > 0) {
            const prevClip = t.clips[clipIndex - 1];
            // Only shift if they are already adjacent
            if (Math.abs(prevClip.startTime + prevClip.duration - newClip.startTime) < 0.1) {
              newClip.startTime = Math.max(0, newClip.startTime - duration);
            }
          }
        } else {
          newClip.transitionOut = makeTransition();
        }

        updatedClip = newClip;

        let newClips = [...t.clips];
        newClips[clipIndex] = newClip;

        // The in-transition pulled this clip left: the clips behind it follow
        if (position === 'in') newClips = rippleAfter(newClips, clipIndex, newClip.startTime - clip.startTime);

        // If we added a transition out, and there's a next clip adjacent, we shift the NEXT clip left (and the ones behind it)
        if (position === 'out' && clipIndex < newClips.length - 1) {
          const nextClip = newClips[clipIndex + 1];
          if (Math.abs(newClip.startTime + newClip.duration - nextClip.startTime) < 0.1) {
            const updatedNextClip = { ...nextClip, startTime: Math.max(0, nextClip.startTime - duration) };
            newClips[clipIndex + 1] = updatedNextClip;
            newClips = rippleAfter(newClips, clipIndex + 1, updatedNextClip.startTime - nextClip.startTime);
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

  updateTransition: (clipId, position, patch) => {
    const { tracks } = get();
    let changed = false;

    const newTracks = tracks.map((t) => {
      const clipIndex = t.clips.findIndex((c) => c.id === clipId);
      if (clipIndex === -1 || t.isLocked) return t;

      const clip = t.clips[clipIndex];
      const current = position === 'in' ? clip.transitionIn : clip.transitionOut;
      if (!current) return t;

      const neighbor = position === 'in' ? t.clips[clipIndex - 1] : t.clips[clipIndex + 1];
      const next: Transition = { ...current, ...patch };
      if (patch.type && !transitionUsesDirection(patch.type)) delete next.direction;
      if (patch.type && transitionUsesDirection(patch.type) && !next.direction) next.direction = DEFAULT_TRANSITION_DIRECTION;
      next.duration = clampTransitionSeconds(next.duration, clip.duration, neighbor?.duration ?? clip.duration);

      let newClips = [...t.clips];
      const newClip: Clip = { ...clip };
      if (position === 'in') newClip.transitionIn = next;
      else newClip.transitionOut = next;
      newClips[clipIndex] = newClip;

      const delta = next.duration - current.duration;
      if (Math.abs(delta) > 1e-6 && neighbor) {
        if (position === 'in') {
          // The transition pulled this clip left over the previous one: keep overlap == duration
          const overlap = neighbor.startTime + neighbor.duration - clip.startTime;
          if (Math.abs(overlap - current.duration) < 0.1) {
            newClip.startTime = Math.max(0, neighbor.startTime + neighbor.duration - next.duration);
            newClips = rippleAfter(newClips, clipIndex, newClip.startTime - clip.startTime);
          }
        } else {
          // The transition pulled the next clip left over this one
          const overlap = clip.startTime + clip.duration - neighbor.startTime;
          if (Math.abs(overlap - current.duration) < 0.1) {
            const moved = { ...neighbor, startTime: Math.max(0, clip.startTime + clip.duration - next.duration) };
            newClips[clipIndex + 1] = moved;
            newClips = rippleAfter(newClips, clipIndex + 1, moved.startTime - neighbor.startTime);
          }
        }
      }

      changed = true;
      return { ...t, clips: newClips.sort((a, b) => a.startTime - b.startTime) };
    });

    if (!changed) return;
    syncProjectDuration(newTracks);
    set({ tracks: newTracks });
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

        let newClips = [...t.clips];
        newClips[clipIndex] = newClip;

        // The clips behind an in-transition moved with it
        if (position === 'in' && clipIndex > 0 && durationToRevert > 0) {
          newClips = rippleAfter(newClips, clipIndex, durationToRevert);
        }

        // Revert shift on next clip if we are removing transitionOut
        if (position === 'out' && clipIndex < newClips.length - 1 && durationToRevert > 0) {
          const nextClip = newClips[clipIndex + 1];
          // Check if they were overlapped
          if (Math.abs((newClip.startTime + newClip.duration - durationToRevert) - nextClip.startTime) < 0.1) {
            const updatedNextClip = { ...nextClip, startTime: nextClip.startTime + durationToRevert };
            newClips[clipIndex + 1] = updatedNextClip;
            newClips = rippleAfter(newClips, clipIndex + 1, durationToRevert);
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
