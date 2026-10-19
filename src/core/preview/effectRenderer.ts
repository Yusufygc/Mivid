import { EffectSettings } from '@/types/timeline';
import { blurSigmaPx, featherSigmaPx, pixelBlockPx } from '@/core/effects/regionEffects';

export interface RegionGeometry {
  /** Center in canvas pixels */
  cx: number;
  cy: number;
  /** Size in canvas pixels after the clip scale */
  width: number;
  height: number;
}

/**
 * Applies a region effect to what is already drawn on the main canvas: a processed copy of the whole frame
 * is cut to the region shape (soft edge with a blurred mask) and drawn back over the original.
 * The export builds the same thing with FFmpeg: the same sigma values and a blurred shape mask.
 */
export class RegionEffectRenderer {
  private scratch: HTMLCanvasElement | null = null;
  private mask: HTMLCanvasElement | null = null;
  private tiny: HTMLCanvasElement | null = null;

  private canvasOfSize(existing: HTMLCanvasElement | null, width: number, height: number): HTMLCanvasElement {
    const canvas = existing ?? document.createElement('canvas');
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return canvas;
  }

  public apply(
    target: CanvasRenderingContext2D,
    source: HTMLCanvasElement,
    effect: EffectSettings,
    region: RegionGeometry
  ): void {
    const { width: frameW, height: frameH } = source;
    if (region.width < 1 || region.height < 1) return;

    this.scratch = this.canvasOfSize(this.scratch, frameW, frameH);
    this.mask = this.canvasOfSize(this.mask, frameW, frameH);
    const sctx = this.scratch.getContext('2d');
    const mctx = this.mask.getContext('2d');
    if (!sctx || !mctx) return;

    // 1. The processed copy of the whole frame
    sctx.save();
    sctx.globalCompositeOperation = 'source-over';
    sctx.clearRect(0, 0, frameW, frameH);
    if (effect.kind === 'blur') {
      sctx.filter = `blur(${blurSigmaPx(effect.strength, frameH).toFixed(2)}px)`;
      sctx.drawImage(source, 0, 0);
    } else if (effect.kind === 'pixelate') {
      const block = pixelBlockPx(effect.strength, frameH);
      this.tiny = this.canvasOfSize(this.tiny, Math.max(1, Math.ceil(frameW / block)), Math.max(1, Math.ceil(frameH / block)));
      const tctx = this.tiny.getContext('2d');
      if (tctx) {
        tctx.imageSmoothingEnabled = true;
        tctx.clearRect(0, 0, this.tiny.width, this.tiny.height);
        tctx.drawImage(source, 0, 0, this.tiny.width, this.tiny.height);
        sctx.imageSmoothingEnabled = false; // hard blocks
        sctx.drawImage(this.tiny, 0, 0, frameW, frameH);
      }
    } else {
      sctx.fillStyle = '#000000';
      sctx.fillRect(0, 0, frameW, frameH);
    }
    sctx.restore();

    // 2. The region mask: the shape, softened by a gaussian when there is a feather
    mctx.save();
    mctx.clearRect(0, 0, frameW, frameH);
    const feather = featherSigmaPx(effect.feather, effect.width, effect.height);
    if (feather > 0.1) mctx.filter = `blur(${feather.toFixed(2)}px)`;
    mctx.fillStyle = '#ffffff';
    mctx.beginPath();
    if (effect.shape === 'ellipse') {
      mctx.ellipse(region.cx, region.cy, region.width / 2, region.height / 2, 0, 0, Math.PI * 2);
    } else {
      mctx.rect(region.cx - region.width / 2, region.cy - region.height / 2, region.width, region.height);
    }
    mctx.fill();
    mctx.restore();

    // 3. Cut the processed frame to the mask and lay it over the original
    sctx.save();
    sctx.globalCompositeOperation = 'destination-in';
    sctx.drawImage(this.mask, 0, 0);
    sctx.restore();

    target.save();
    target.filter = 'none';
    target.drawImage(this.scratch, 0, 0);
    target.restore();
  }
}
