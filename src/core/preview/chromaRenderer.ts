import { ChromaKey } from '@/types/timeline';
import { applyChromaKey } from '@/core/chroma/chromaKey';

const MAX_WIDTH = 960;

/**
 * Keys a frame in software: the frame is copied to a small canvas, its alpha channel is computed from the key color
 * and the canvas is handed back to be drawn like the original footage.
 * Reading pixels needs a same-origin (or CORS-enabled) source; when the browser refuses, the clip is drawn unkeyed.
 */
export class ChromaKeyRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private failed = false;

  public render(
    source: CanvasImageSource,
    sourceWidth: number,
    sourceHeight: number,
    key: ChromaKey
  ): HTMLCanvasElement | null {
    if (this.failed || sourceWidth <= 0 || sourceHeight <= 0) return null;

    const scale = Math.min(1, MAX_WIDTH / sourceWidth);
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    if (!this.canvas) this.canvas = document.createElement('canvas');
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    try {
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(source, 0, 0, width, height);
      const image = ctx.getImageData(0, 0, width, height);
      applyChromaKey(image.data, key);
      ctx.putImageData(image, 0, 0);
      return this.canvas;
    } catch (error) {
      // A cross-origin source taints the canvas; stop trying instead of throwing every frame
      this.failed = true;
      console.warn('Chroma key preview unavailable for this media (canvas is tainted):', error);
      return null;
    }
  }

  /** Allows another attempt, e.g. after the user replaced the media */
  public reset(): void {
    this.failed = false;
  }
}
