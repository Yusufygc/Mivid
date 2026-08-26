export type AssetType = 'video' | 'audio' | 'image' | 'text';

export interface MediaAsset {
  id: string;
  name: string;
  path: string;
  url: string; // Blob URL or Tauri asset URL for preview
  type: AssetType;
  duration: number; // in seconds
  width?: number;
  height?: number;
  size: number; // in bytes
  thumbnail?: string; // Base64 or object URL
  createdAt: number;
}
