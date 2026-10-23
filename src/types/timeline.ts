import { AssetType } from './asset';

export type TrackType = 'video' | 'audio' | 'overlay' | 'text' | 'effect';

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
  denoise?: boolean; // FFmpeg afftdn on export (not previewed)
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

export type TransitionType = 'cross-dissolve' | 'fade-to-black' | 'slide' | 'wipe' | 'iris' | 'zoom' | 'flash' | 'blur';
/** Direction the clip (slide) or the wipe edge travels */
export type TransitionDirection = 'left' | 'right' | 'up' | 'down';

export interface Transition {
  type: TransitionType;
  duration: number;
  /** slide and wipe only; undefined = left */
  direction?: TransitionDirection;
  /** Undefined = linear, which is how transitions worked before easing existed */
  easing?: Easing;
}

export interface ColorGrading {
  brightness: number;
  contrast: number;
  saturation: number;
  lut?: string;
}

export type AnimatableProp = 'x' | 'y' | 'scale' | 'opacity' | 'rotation';
export type Easing = 'linear' | 'ease-in-out';

export interface Keyframe {
  id: string;
  time: number; // Clip-local seconds on the timeline (0..duration), independent of source speed
  value: number;
  easing: Easing; // Easing applied on the segment that starts at this keyframe
}

export type ClipKeyframes = Partial<Record<AnimatableProp, Keyframe[]>>;

export type EffectKind = 'blur' | 'pixelate' | 'blackbox' | 'tint' | 'sharpen' | 'vignette';
export type EffectShape = 'rect' | 'ellipse';

/** A region effect (blur, mosaic, black box). Lives on an `effect` track; position and scale come from `transform`. */
export interface EffectSettings {
  kind: EffectKind;
  shape: EffectShape;
  strength: number; // 0..1, blur radius / mosaic block size
  feather: number; // 0..1, soft edge
  width: number; // Region size in project pixels at scale 1
  height: number;
  /** Apply the effect everywhere except the region (focus on a face, blur the rest) */
  invert?: boolean;
  /** Apply to the whole frame, no region (an adjustment layer). Always on for the vignette. */
  fullFrame?: boolean;
  /** Tint color, #rrggbb */
  color?: string;
  /** Strength at the end of the clip; the strength ramps from `strength` to this (undefined = constant) */
  strengthEnd?: number;
  /** Curve of the ramp, linear when undefined */
  strengthEasing?: Easing;
}

/** How footage fills the project frame: stretched (old behavior), fitted inside (letterbox) or covering it (crop) */
export type FitMode = 'stretch' | 'contain' | 'cover';

/** Green screen: pixels close to `color` become transparent. similarity 0.01..1, blend 0..1 */
export interface ChromaKey {
  color: string; // #rrggbb
  similarity: number;
  blend: number;
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
  keyframes?: ClipKeyframes; // Each list sorted by time
  effect?: EffectSettings; // Only on clips of type 'effect'
  fit?: FitMode; // Video / image clips. Undefined = stretch, so old projects look the same
  chromaKey?: ChromaKey; // Video / image clips
  freeze?: boolean; // A still of the source frame at `inPoint`, held for the whole clip
  backdropBlur?: number; // 0..1: a blurred, cover-fitted copy of the footage fills the frame behind the clip
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
