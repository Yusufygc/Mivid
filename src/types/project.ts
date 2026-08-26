export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '21:9';

export interface ProjectSettings {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  aspectRatio: AspectRatio;
  duration: number; // Total project duration in seconds
  backgroundColor: string;
}
