import { create } from 'zustand';
import { Track, Clip, Transform, AudioSettings, TextProperties } from '@/types/timeline';
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
  updateClipAudio: (clipId: string, audio: Partial<AudioSettings>) => void;
  updateClipText: (clipId: string, text: Partial<TextProperties>) => void;
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
              return {
                ...c,
                startTime: validStart,
                duration: clampTime(duration),
                inPoint: inPoint !== undefined ? clampTime(inPoint) : c.inPoint,
                outPoint: outPoint !== undefined ? clampTime(outPoint) : c.outPoint,
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
}));
