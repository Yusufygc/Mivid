import { AssetType } from './asset';

export type TrackType = 'video' | 'audio' | 'overlay';

export interface Transform {
  x: number; // Offset percentage (-100 to 100) or pixels
  y: number;
  scaleX: number; // 1 = 100%
  scaleY: number;
  rotation: number; // degrees
  opacity: number; // 0 to 1
  zIndex: number;
}

export interface AudioSettings {
  volume: number; // 0.0 to 2.0 (1.0 = 100%)
  muted: boolean;
  fadeIn: number; // seconds
  fadeOut: number; // seconds
}

export interface Clip {
  id: string;
  trackId: string;
  assetId: string;
  name: string;
  type: AssetType;
  startTime: number; // Start position on the timeline in seconds
  duration: number; // Visible length on timeline in seconds
  inPoint: number; // Cut in-point from source asset (seconds)
  outPoint: number; // Cut out-point from source asset (seconds)
  speed: number; // 0.25x to 4x playback rate
  transform: Transform;
  audio: AudioSettings;
}

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  isMuted: boolean;
  isLocked: boolean;
  isHidden: boolean;
  clips: Clip[];
}

export interface TimelineState {
  tracks: Track[];
  selectedClipId: string | null;
  currentTime: number; // Playhead position in seconds
  zoom: number; // Pixels per second
  isPlaying: boolean;
  snappingEnabled: boolean;
}
