import { EffectSettings } from '@/types/timeline';
import {
  VIGNETTE_INNER,
  blurSigmaPx,
  coversWholeFrame,
  featherSigmaPx,
  pixelBlockPx,
  sharpenKernel,
  tintAlpha,
  vignetteAlpha,
} from '@/core/effects/regionEffects';

export interface RegionGeometry {
  /** Center in canvas pixels */
  cx: number;
  cy: number;
  /** Size in canvas pixels after the clip scale */
  width: number;
  height: number;
}

/** CSS filter that runs the sharpen kernel (the export runs the same 3x3 kernel with FFmpeg's convolution filter) */
export const sharpenFilter = (strength: number): string => {
  const kernel = sharpenKernel(strength)
    .map((v) => v.toFixed(4))
    .join(' ');
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg"><filter id="s" color-interpolation-filters="sRGB">' +
    `<feConvolveMatrix order="3" kernelMatrix="${kernel}" preserveAlpha="true" edgeMode="duplicate"/></filter></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}#s")`;
};

/** Number of gradient stops of the vignette (the darkness follows vignetteAlpha() at each stop) */
const VIGNETTE_STOPS = 24;

/**
 * Applies an effect to what is already drawn on the main canvas: a processed copy of the whole frame
 * is cut to the region shape (soft edge with a blurred mask) and drawn back over the original.
 * A region can be inverted (everything but the region) and an effect can cover the whole frame (no mask).
 * The export builds the same thing with FFmpeg: the same strengths and a blurred shape mask.
 */
export class RegionEffectRenderer {
  private scratch: HTMLCanvasElement | null = null;
  private mask: HTMLCanvasElement | null = null;
  private tiny: HTMLCanvasElement | null = null;
  private padded: HTMLCanvasElement | null = null;

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
    const wholeFrame = coversWholeFrame(effect);
    if (!wholeFrame && (region.width < 1 || region.height < 1)) return;

    this.scratch = this.canvasOfSize(this.scratch, frameW, frameH);
    const sctx = this.scratch.getContext('2d');
    if (!sctx) return;

    // 1. The processed copy of the whole frame
    sctx.save();
    sctx.globalCompositeOperation = 'source-over';
    sctx.clearRect(0, 0, frameW, frameH);
    this.drawProcessed(sctx, source, effect, frameW, frameH);
    sctx.restore();

    // 2. Cut it to the region (or its inverse) unless the effect covers the whole frame
    if (!wholeFrame) {
      this.mask = this.canvasOfSize(this.mask, frameW, frameH);
      const mctx = this.mask.getContext('2d');
      if (!mctx) return;
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

      sctx.save();
      sctx.globalCompositeOperation = effect.invert ? 'destination-out' : 'destination-in';
      sctx.drawImage(this.mask, 0, 0);
      sctx.restore();
    }

    // 3. Lay it over the original
    target.save();
    target.filter = 'none';
    target.drawImage(this.scratch, 0, 0);
    target.restore();
  }

  /**
   * Blur that keeps the frame edges: a plain blur of the canvas fades into transparency at the borders (a dark rim),
   * FFmpeg's gblur repeats the edge pixels. The frame is drawn on a padded canvas whose margin repeats the edge rows
   * and columns, and the padded canvas is blurred.
   */
  private drawBlurred(sctx: CanvasRenderingContext2D, source: HTMLCanvasElement, sigma: number, frameW: number, frameH: number): void {
    const m = Math.ceil(sigma * 3);
    this.padded = this.canvasOfSize(this.padded, frameW + m * 2, frameH + m * 2);
    const pctx = this.padded.getContext('2d');
    if (!pctx) {
      sctx.filter = `blur(${sigma.toFixed(2)}px)`;
      sctx.drawImage(source, 0, 0);
      return;
    }
    pctx.clearRect(0, 0, this.padded.width, this.padded.height);
    pctx.drawImage(source, m, m);
    pctx.drawImage(source, 0, 0, 1, frameH, 0, m, m, frameH); // left
    pctx.drawImage(source, frameW - 1, 0, 1, frameH, m + frameW, m, m, frameH); // right
    pctx.drawImage(source, 0, 0, frameW, 1, m, 0, frameW, m); // top
    pctx.drawImage(source, 0, frameH - 1, frameW, 1, m, m + frameH, frameW, m); // bottom
    pctx.drawImage(source, 0, 0, 1, 1, 0, 0, m, m); // corners
    pctx.drawImage(source, frameW - 1, 0, 1, 1, m + frameW, 0, m, m);
    pctx.drawImage(source, 0, frameH - 1, 1, 1, 0, m + frameH, m, m);
    pctx.drawImage(source, frameW - 1, frameH - 1, 1, 1, m + frameW, m + frameH, m, m);

    sctx.filter = `blur(${sigma.toFixed(2)}px)`;
    sctx.drawImage(this.padded, -m, -m);
  }

  private drawProcessed(
    sctx: CanvasRenderingContext2D,
    source: HTMLCanvasElement,
    effect: EffectSettings,
    frameW: number,
    frameH: number
  ): void {
    switch (effect.kind) {
      case 'blur':
        this.drawBlurred(sctx, source, blurSigmaPx(effect.strength, frameH), frameW, frameH);
        break;
      case 'pixelate': {
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
        break;
      }
      case 'tint':
        sctx.drawImage(source, 0, 0);
        sctx.globalAlpha = tintAlpha(effect.strength);
        sctx.fillStyle = effect.color || '#ff9f40';
        sctx.fillRect(0, 0, frameW, frameH);
        break;
      case 'sharpen':
        sctx.filter = sharpenFilter(effect.strength);
        sctx.drawImage(source, 0, 0);
        break;
      case 'vignette': {
        sctx.drawImage(source, 0, 0);
        const radius = Math.hypot(frameW / 2, frameH / 2);
        const gradient = sctx.createRadialGradient(frameW / 2, frameH / 2, 0, frameW / 2, frameH / 2, radius);
        for (let i = 0; i <= VIGNETTE_STOPS; i++) {
          const r = i / VIGNETTE_STOPS;
          gradient.addColorStop(r, `rgba(0,0,0,${vignetteAlpha(r, effect.strength).toFixed(4)})`);
        }
        // The ramp starts at VIGNETTE_INNER: stops before it are fully transparent
        gradient.addColorStop(Math.min(1, VIGNETTE_INNER), 'rgba(0,0,0,0)');
        sctx.fillStyle = gradient;
        sctx.fillRect(0, 0, frameW, frameH);
        break;
      }
      default:
        sctx.fillStyle = '#000000';
        sctx.fillRect(0, 0, frameW, frameH);
    }
  }
}
