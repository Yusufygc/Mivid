import { AssetType } from './asset';

export type TrackType = 'video' | 'audio' | 'overlay' | 'text';

export interface Transform {
  x: number; // Offset in pixels from canvas center
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

export interface TextStroke {
  color: string;
  width: number;
}

export interface TextShadow {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface TextBackgroundBox {
  enabled: boolean;
  color: string;
  padding: number;
  borderRadius: number;
}

export interface TextAnimation {
  in: 'none' | 'typewriter' | 'slide' | 'zoom';
  out: 'none' | 'fade';
  duration: number;
}

export interface TextProperties {
  content: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  fontWeight: 'normal' | 'bold' | '900';
  fontStyle?: 'normal' | 'italic';
  textAlign: 'left' | 'center' | 'right';
  stroke?: TextStroke;
  shadow?: TextShadow;
  backgroundBox?: TextBackgroundBox;
  animation?: TextAnimation;
}

export interface Transition {
  type: 'cross-dissolve' | 'fade-to-black' | 'slide' | 'wipe';
  duration: number;
}

export interface ColorGrading {
  brightness: number;
  contrast: number;
  saturation: number;
  lut?: string;
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
  text?: TextProperties;
  transitionIn?: Transition;
  transitionOut?: Transition;
  colorGrading?: ColorGrading;
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
