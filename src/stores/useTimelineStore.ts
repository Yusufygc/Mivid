import { create } from 'zustand';
import { Track, Clip, Transform, AudioSettings } from '@/types/timeline';
import { MediaAsset } from '@/types/asset';
import { TimelineEngine } from '@/core/timeline/timelineEngine';
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
  addTrack: (type: 'video' | 'audio' | 'overlay') => void;
  deleteTrack: (trackId: string) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackHide: (trackId: string) => void;
  toggleTrackLock: (trackId: string) => void;

  addClipFromAsset: (asset: MediaAsset, trackId?: string, startTime?: number) => Clip | null;
  removeClip: (clipId: string) => void;
  splitSelectedClip: () => boolean;
  splitClipById: (clipId: string, splitTime: number) => boolean;
  updateClipTiming: (clipId: string, startTime: number, duration: number, inPoint?: number, outPoint?: number) => void;
  updateClipTransform: (clipId: string, transform: Partial<Transform>) => void;
  updateClipAudio: (clipId: string, audio: Partial<AudioSettings>) => void;
  moveClipToTrack: (clipId: string, targetTrackId: string, newStartTime: number) => void;
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

const initialTracks: Track[] = [
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

  toggleSnapping: () => {
    set((state) => ({ snappingEnabled: !state.snappingEnabled }));
  },

  addTrack: (type) => {
    const id = `track-${type}-${Date.now()}`;
    const name = type === 'audio' ? `Ses (${id.slice(-4)})` : `Video (${id.slice(-4)})`;
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

  addClipFromAsset: (asset, targetTrackId, requestedStartTime) => {
    const { tracks, currentTime } = get();

    let track = tracks.find((t) => t.id === targetTrackId);
    if (!track) {
      if (asset.type === 'audio') {
        track = tracks.find((t) => t.type === 'audio');
      } else {
        track = tracks.find((t) => t.type === 'video');
      }
    }

    if (!track) {
      Logger.error('useTimelineStore', 'No suitable track found for asset', asset);
      return null;
    }

    let startTime = requestedStartTime !== undefined ? requestedStartTime : currentTime;
    if (requestedStartTime === undefined && track.clips.length > 0) {
      const lastClip = track.clips[track.clips.length - 1];
      startTime = Math.max(currentTime, lastClip.startTime + lastClip.duration);
    }

    const duration = asset.duration || 5.0;
    const clipId = crypto.randomUUID ? crypto.randomUUID() : `clip-${Date.now()}`;

    const newClip: Clip = {
      id: clipId,
      trackId: track.id,
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
        zIndex: track.type === 'overlay' ? 2 : 1,
      },
      audio: {
        volume: 1.0,
        muted: false,
        fadeIn: 0,
        fadeOut: 0,
      },
    };

    const newTracks = tracks.map((t) =>
      t.id === track?.id ? { ...t, clips: [...t.clips, newClip].sort((a, b) => a.startTime - b.startTime) } : t
    );

    syncProjectDuration(newTracks);

    set({
      tracks: newTracks,
      selectedClipId: newClip.id,
    });

    Logger.info('useTimelineStore', `Clip added to track ${track.name}`, newClip);
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
    const newTracks = tracks.map((t) => ({
      ...t,
      clips: t.clips
        .map((c) => {
          if (c.id === clipId) {
            return {
              ...c,
              startTime: clampTime(startTime),
              duration: clampTime(duration),
              inPoint: inPoint !== undefined ? clampTime(inPoint) : c.inPoint,
              outPoint: outPoint !== undefined ? clampTime(outPoint) : c.outPoint,
            };
          }
          return c;
        })
        .sort((a, b) => a.startTime - b.startTime),
    }));

    syncProjectDuration(newTracks);

    set({ tracks: newTracks });
  },

  updateClipTransform: (clipId, transformUpdates) => {
    set((state) => ({
      tracks: state.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) =>
          c.id === clipId ? { ...c, transform: { ...c.transform, ...transformUpdates } } : c
        ),
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
}));
