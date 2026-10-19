import { Clip, Keyframe, Track } from '@/types/timeline';
import { hasKeyframes } from '@/core/animation/keyframes';
import { buildFadeFilters } from '@/core/audio/fades';
import { ffmpegEqFilter } from '@/core/color/colorGrading';
import { ffmpegChromakeyFilter } from '@/core/chroma/chromaKey';
import { backdropSigmaPx, blurSigmaPx, featherSigmaPx, pixelBlockPx } from '@/core/effects/regionEffects';
import { ffmpegFitFilter } from '@/core/layout/fit';
import { MediaAsset } from '@/types/asset';
import { ProjectSettings } from '@/types/project';
import { Logger } from '@/core/logger';

export interface ExportOptions {
  outputPath: string;
  preset?: 'ultrafast' | 'fast' | 'medium' | 'slow';
  videoBitrate?: string;
  audioBitrate?: string;
}

const escapeFFmpegText = (str: string): string => {
  return str
    .replace(/\\/g, '\\\\\\\\')
    .replace(/'/g, "'\\\\\\''")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%')
    .replace(/\n/g, ' ');
};

const hexToFFmpegColor = (hexOrRgba: string): string => {
  if (!hexOrRgba) return 'white';
  if (hexOrRgba.startsWith('#')) {
    if (hexOrRgba.length === 7) return `${hexOrRgba}@1.0`;
    return hexOrRgba;
  }
  if (hexOrRgba.startsWith('rgba')) {
    // Convert rgba(r,g,b,a) to 0xRRGGBB@A
    const match = hexOrRgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (match) {
      const r = parseInt(match[1]).toString(16).padStart(2, '0');
      const g = parseInt(match[2]).toString(16).padStart(2, '0');
      const b = parseInt(match[3]).toString(16).padStart(2, '0');
      const a = match[4] !== undefined ? match[4] : '1.0';
      return `0x${r}${g}${b}@${a}`;
    }
  }
  return hexOrRgba;
};

const formatNumber = (n: number): string => String(Math.round(n * 10000) / 10000);

/**
 * Builds an FFmpeg expression for a keyframe curve over timeline seconds.
 * `timeVar` is `t` for most filters and `T` for geq. Must match evaluateKeyframes() in core/animation.
 * Easing 'ease-in-out' uses smoothstep p*p*(3-2*p), like applyEasing().
 */
export const buildKeyframeExpr = (keyframes: Keyframe[], clipStart: number, timeVar: 't' | 'T' = 't'): string => {
  const points = keyframes.map((k) => ({
    time: clipStart + k.time,
    value: k.value,
    easing: k.easing,
  }));
  if (points.length === 1) return formatNumber(points[0].value);

  const last = points[points.length - 1];
  let expr = formatNumber(last.value);

  for (let i = points.length - 2; i >= 0; i--) {
    const a = points[i];
    const b = points[i + 1];
    const span = b.time - a.time;
    const progress = `(${timeVar}-${formatNumber(a.time)})/${formatNumber(span)}`;
    const eased = a.easing === 'ease-in-out' ? `(${progress})*(${progress})*(3-2*(${progress}))` : progress;
    const segment =
      span > 0 ? `${formatNumber(a.value)}+(${formatNumber(b.value - a.value)})*(${eased})` : formatNumber(b.value);
    expr = `if(lt(${timeVar},${formatNumber(b.time)}),${segment},${expr})`;
  }

  // Hold the first value before the first keyframe
  return `if(lt(${timeVar},${formatNumber(points[0].time)}),${formatNumber(points[0].value)},${expr})`;
};

/** atempo only accepts 0.5..100 per instance, so slow speeds are chained (0.25x = 0.5 * 0.5) */
export const buildAtempoChain = (speed: number): string => {
  if (!speed || Math.abs(speed - 1) < 0.001) return '';
  const factors: number[] = [];
  let remaining = speed;
  while (remaining < 0.5 - 1e-9) {
    factors.push(0.5);
    remaining /= 0.5;
  }
  factors.push(remaining);
  return factors.map((f) => `atempo=${formatNumber(f)}`).join(',') + ',';
};


const hasContent = (list: Keyframe[] | undefined): list is Keyframe[] => !!list && list.length > 0;

/** Text with keyframes or rotation is rendered on its own transparent layer, drawtext alone cannot animate or rotate */
const needsTextLayer = (clip: Clip): boolean =>
  hasKeyframes(clip) || Math.abs(clip.transform?.rotation ?? 0) > 1e-6;

/** drawtext parameters shared by the direct (static) path and the layer path */
const buildDrawTextParams = (clip: Clip, fontSize: number, xPos: string, yPos: string, enable?: string): string[] => {
  const text = clip.text!;
  const params: string[] = [
    `text='${escapeFFmpegText(text.content)}'`,
    `fontsize=${fontSize}`,
    `fontcolor=${hexToFFmpegColor(text.color || '#FFFFFF')}`,
    `x=${xPos}`,
    `y=${yPos}`,
  ];
  if (enable) params.push(`enable='${enable}'`);

  // Background box
  if (text.backgroundBox?.enabled) {
    const boxColor = hexToFFmpegColor(text.backgroundBox.color || 'rgba(0,0,0,0.7)');
    const borderW = text.backgroundBox.padding || 12;
    params.push('box=1', `boxcolor=${boxColor}`, `boxborderw=${borderW}`);
  }

  // Stroke
  if (text.stroke && text.stroke.width > 0) {
    const strokeColor = hexToFFmpegColor(text.stroke.color || '#000000');
    params.push(`borderw=${text.stroke.width}`, `bordercolor=${strokeColor}`);
  }

  // Shadow
  if (text.shadow) {
    const shadowColor = hexToFFmpegColor(text.shadow.color || 'rgba(0,0,0,0.7)');
    params.push(`shadowx=${text.shadow.offsetX || 2}`, `shadowy=${text.shadow.offsetY || 2}`, `shadowcolor=${shadowColor}`);
  }

  return params;
};

/** Text is anchored like in the preview: the anchor is the canvas center (+ offset), alignment decides which edge sits on it */
const textAnchorX = (clip: Clip): string => {
  const align = clip.text?.textAlign;
  if (align === 'left') return 'w/2';
  if (align === 'right') return 'w/2-text_w';
  return '(w-text_w)/2';
};

interface LayerParams {
  project: ProjectSettings;
  filterGraph: string[];
  /** Filter chain ending in a yuva420p stream, without an output label */
  source: string;
  clip: Clip;
  index: number;
  baseLabel: string;
}

/**
 * Composites one visual clip over `baseLabel`: opacity, transitions, scale, rotation, position.
 * Position, scale, rotation and opacity may be animated through keyframes. Returns the new base label.
 */
const pushVisualLayer = ({ project, filterGraph, source, clip, index, baseLabel }: LayerParams): string => {
  const clipTag = `clip_${index}`;
  const scaledTag = `scaled_${index}`;
  const nextBase = `comp_${index}`;

  const startTimeNum = clip.startTime;
  const endTimeNum = clip.startTime + clip.duration;
  const startTime = startTimeNum.toFixed(2);
  const endTime = endTimeNum.toFixed(2);

  let clipFilters = source;
  let underBase = baseLabel;

  // Blurred backdrop: a cover-fitted, blurred copy of the footage fills the frame behind the clip
  if (clip.type !== 'text' && (clip.backdropBlur ?? 0) > 0) {
    const sourceTag = `clip_src_${index}`;
    const backdropSource = `clip_bg_src_${index}`;
    const backdropTag = `clip_bg_${index}`;
    const backdropOut = `clip_bg_out_${index}`;
    const grow = 1.15; // hides the soft edge a blur leaves at the borders
    const sigma = backdropSigmaPx(clip.backdropBlur!, project.height);

    filterGraph.push(`${source},split=2[${sourceTag}][${backdropSource}]`);

    let backdropFilters =
      `[${backdropSource}]scale=${Math.round(project.width * grow)}:${Math.round(project.height * grow)}:force_original_aspect_ratio=increase,` +
      `crop=${project.width}:${project.height},gblur=sigma=${formatNumber(sigma)}:steps=2,format=yuva420p`;
    const backdropOpacity = clip.transform?.opacity ?? 1;
    if (backdropOpacity < 1) backdropFilters += `,colorchannelmixer=aa=${backdropOpacity.toFixed(2)}`;
    if (clip.transitionIn && (clip.transitionIn.type === 'cross-dissolve' || clip.transitionIn.type === 'fade-to-black')) {
      backdropFilters += `,fade=t=in:st=${startTime}:d=${clip.transitionIn.duration.toFixed(2)}:alpha=1`;
    }
    if (clip.transitionOut && (clip.transitionOut.type === 'cross-dissolve' || clip.transitionOut.type === 'fade-to-black')) {
      const outStart = (endTimeNum - clip.transitionOut.duration).toFixed(2);
      backdropFilters += `,fade=t=out:st=${outStart}:d=${clip.transitionOut.duration.toFixed(2)}:alpha=1`;
    }
    filterGraph.push(`${backdropFilters}[${backdropTag}]`);
    filterGraph.push(
      `[${underBase}][${backdropTag}]overlay=enable='between(t,${startTime},${endTime})'[${backdropOut}]`
    );
    underBase = backdropOut;
    clipFilters = `[${sourceTag}]null`;
  }

  // Green screen first, so the color adjustment and everything after it only sees the kept pixels
  if (clip.type !== 'text' && clip.chromaKey) clipFilters += `,${ffmpegChromakeyFilter(clip.chromaKey)}`;

  // Color adjustment (video and image clips; text has no footage to grade)
  const eqFilter = clip.type === 'text' ? '' : ffmpegEqFilter(clip.colorGrading);
  if (eqFilter) clipFilters += `,${eqFilter}`;

  // Opacity
  const opacityKeyframes = clip.keyframes?.opacity;
  const opacity = clip.transform?.opacity ?? 1;
  if (hasContent(opacityKeyframes)) {
    // Animated opacity: geq evaluates the keyframe curve per frame (T = timeline seconds)
    const opacityExpr = buildKeyframeExpr(opacityKeyframes, clip.startTime, 'T');
    clipFilters += `,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='alpha(X,Y)*clip(${opacityExpr},0,1)'`;
  } else if (opacity < 1) {
    clipFilters += `,colorchannelmixer=aa=${opacity.toFixed(2)}`;
  }

  // Transitions (Alpha fading)
  if (clip.transitionIn && (clip.transitionIn.type === 'cross-dissolve' || clip.transitionIn.type === 'fade-to-black')) {
    clipFilters += `,fade=t=in:st=${startTime}:d=${clip.transitionIn.duration.toFixed(2)}:alpha=1`;
  }
  if (clip.transitionOut && (clip.transitionOut.type === 'cross-dissolve' || clip.transitionOut.type === 'fade-to-black')) {
    const outStart = (endTimeNum - clip.transitionOut.duration).toFixed(2);
    clipFilters += `,fade=t=out:st=${outStart}:d=${clip.transitionOut.duration.toFixed(2)}:alpha=1`;
  }

  filterGraph.push(`${clipFilters}[${clipTag}]`);

  // Scale and rotation
  const scaleKeyframes = clip.keyframes?.scale;
  const scaleAnimated = hasContent(scaleKeyframes);
  const rotationKeyframes = clip.keyframes?.rotation;
  const staticRotation = clip.transform?.rotation ?? 0;
  const rotated = hasContent(rotationKeyframes) || Math.abs(staticRotation) > 1e-6;
  const staticScaleX = clip.transform?.scaleX ?? 1;
  const staticScaleY = clip.transform?.scaleY ?? 1;

  const rotateFilter = (): string => {
    const degrees = hasContent(rotationKeyframes)
      ? `(${buildKeyframeExpr(rotationKeyframes, clip.startTime, 't')})`
      : formatNumber(staticRotation);
    // Fixed square output that fits any angle; the transparent corners keep the clip centered
    const side = `ceil(hypot(iw,ih)/2)*2`;
    return `rotate=a='${degrees}*PI/180':ow='${side}':oh='${side}':c=none`;
  };
  const animatedScaleFilter = (baseW: string, baseH: string): string => {
    const scaleExpr = buildKeyframeExpr(scaleKeyframes!, clip.startTime, 't');
    // Evaluated per frame (t = timeline seconds); sizes stay even for the chroma planes
    const evenSize = (dimension: string) => `max(2,trunc(${dimension}*(${scaleExpr})/2)*2)`;
    return `scale=w='${evenSize(baseW)}':h='${evenSize(baseH)}':eval=frame`;
  };

  // Fitted or covering footage is brought to the frame size first (letterbox bars stay transparent),
  // then scaled and rotated like any other layer. Stretched footage keeps the original single scale step.
  const fitted = clip.type !== 'text' && !!clip.fit && clip.fit !== 'stretch';
  const fitFilter = ffmpegFitFilter(clip.fit, project.width, project.height);

  if (scaleAnimated && rotated) {
    // Rotate at full size first (rotate cannot follow a changing frame size), then scale the rotated frame.
    // Equivalent to scale-then-rotate because animated scale is uniform.
    const toFrame = fitted ? fitFilter : `scale=${project.width}:${project.height}`;
    filterGraph.push(
      `[${clipTag}]${toFrame},${rotateFilter()},${animatedScaleFilter('iw', 'ih')}[${scaledTag}]`
    );
  } else if (scaleAnimated) {
    filterGraph.push(
      fitted
        ? `[${clipTag}]${fitFilter},${animatedScaleFilter('iw', 'ih')}[${scaledTag}]`
        : `[${clipTag}]${animatedScaleFilter(String(project.width), String(project.height))}[${scaledTag}]`
    );
  } else {
    const scaleW = Math.round(project.width * staticScaleX);
    const scaleH = Math.round(project.height * staticScaleY);
    const resize = fitted
      ? `${fitFilter}${scaleW !== project.width || scaleH !== project.height ? `,scale=${scaleW}:${scaleH}` : ''}`
      : `scale=${scaleW}:${scaleH}`;
    filterGraph.push(`[${clipTag}]${resize}${rotated ? `,${rotateFilter()}` : ''}[${scaledTag}]`);
  }

  // Position: offset from the canvas center, same as the preview. Scaled or rotated frames are centered first.
  const posX = Math.round(clip.transform?.x ?? 0);
  const posY = Math.round(clip.transform?.y ?? 0);
  const needsCentering = scaleAnimated || rotated || Math.abs(staticScaleX - 1) > 1e-6 || Math.abs(staticScaleY - 1) > 1e-6;

  let usesExpression = false;
  const axisExpr = (keyframes: Keyframe[] | undefined, staticValue: number, centerExpr: string): string => {
    if (hasContent(keyframes)) {
      usesExpression = true;
      const animated = buildKeyframeExpr(keyframes, clip.startTime, 't');
      return needsCentering ? `${centerExpr}+(${animated})` : animated;
    }
    if (needsCentering) {
      usesExpression = true;
      return `${centerExpr}+(${staticValue})`;
    }
    return String(staticValue);
  };

  let xExpr = axisExpr(clip.keyframes?.x, posX, '(W-w)/2');
  const yExpr = axisExpr(clip.keyframes?.y, posY, '(H-h)/2');

  if (clip.transitionIn && (clip.transitionIn.type === 'slide' || clip.transitionIn.type === 'wipe')) {
    const d = clip.transitionIn.duration.toFixed(2);
    xExpr += `+if(lt(t,${startTime}+${d}),W*(1-(t-${startTime})/${d}),0)`;
    usesExpression = true;
  }

  if (clip.transitionOut && (clip.transitionOut.type === 'slide' || clip.transitionOut.type === 'wipe')) {
    const d = clip.transitionOut.duration.toFixed(2);
    const outStart = (endTimeNum - clip.transitionOut.duration).toFixed(2);
    xExpr += `+if(gt(t,${outStart}),-W*(t-${outStart})/${d},0)`;
    usesExpression = true;
  }

  const quote = (expr: string, isExpr: boolean): string => (isExpr ? `'${expr}'` : expr);
  const yUsesExpression = needsCentering || hasContent(clip.keyframes?.y);

  filterGraph.push(
    `[${underBase}][${scaledTag}]overlay=x=${quote(xExpr, usesExpression)}:y=${quote(yExpr, yUsesExpression)}:enable='between(t,${startTime},${endTime})'[${nextBase}]`
  );

  return nextBase;
};

interface RegionEffectParams {
  project: ProjectSettings;
  filterGraph: string[];
  clip: Clip;
  index: number;
  baseLabel: string;
}

/**
 * Filter chain for the region mask: a white shape on black, softened by a gaussian when the effect has a feather.
 * The shape is drawn once on a single frame and looped, so only the (cheap) scale and overlay run per frame.
 * Returns the label of a project-sized luma stream that starts at 0 and lasts for the clip.
 */
const pushRegionMask = ({ project, filterGraph, clip, index }: RegionEffectParams): string => {
  const effect = clip.effect!;
  const { width: W, height: H, fps } = project;
  const frame = 1 / fps;
  const duration = clip.duration;

  const baseW = Math.max(2, Math.round(effect.width));
  const baseH = Math.max(2, Math.round(effect.height));
  const sigma = featherSigmaPx(effect.feather, effect.width, effect.height);
  const margin = sigma > 0.1 ? Math.ceil(sigma * 3) : 0;
  const paddedW = baseW + margin * 2;
  const paddedH = baseH + margin * 2;

  // 1. The shape on a single frame
  let shape = `color=c=white:s=${baseW}x${baseH}:r=${fps}:d=${frame.toFixed(5)},format=gray`;
  if (effect.shape === 'ellipse') {
    shape += `,geq=lum='if(lte(hypot((X+0.5-W/2)/(W/2),(Y+0.5-H/2)/(H/2)),1),255,0)'`;
  }
  if (margin > 0) {
    shape += `,pad=${paddedW}:${paddedH}:${margin}:${margin}:color=black,gblur=sigma=${formatNumber(sigma)}`;
  }
  // 2. Repeat the frame for the whole clip
  shape += `,loop=loop=-1:size=1:start=0,setpts=N/(${fps}*TB),trim=duration=${duration.toFixed(3)},format=yuv420p`;

  // 3. Scale (keyframes or static, per axis)
  const scaleKeyframes = clip.keyframes?.scale;
  const scaleX = clip.transform?.scaleX ?? 1;
  const scaleY = clip.transform?.scaleY ?? 1;
  if (hasContent(scaleKeyframes)) {
    const expr = buildKeyframeExpr(scaleKeyframes, 0, 't');
    const even = (size: number) => `max(2,trunc(${size}*(${expr})/2)*2)`;
    shape += `,scale=w='${even(paddedW)}':h='${even(paddedH)}':eval=frame`;
  } else if (Math.abs(scaleX - 1) > 1e-6 || Math.abs(scaleY - 1) > 1e-6) {
    const even = (size: number) => Math.max(2, Math.round(size / 2) * 2);
    shape += `,scale=${even(paddedW * scaleX)}:${even(paddedH * scaleY)}`;
  }

  const shapeTag = `fx_shape_${index}`;
  filterGraph.push(`${shape}[${shapeTag}]`);

  // 4. Place the shape on a black frame; the position follows the keyframes (times are clip-local, the stream starts at 0)
  const posX = Math.round(clip.transform?.x ?? 0);
  const posY = Math.round(clip.transform?.y ?? 0);
  const axis = (keyframes: Keyframe[] | undefined, staticValue: number, center: string): string =>
    `${center}+(${hasContent(keyframes) ? buildKeyframeExpr(keyframes, 0, 't') : staticValue})`;

  const maskTag = `fx_mask_${index}`;
  filterGraph.push(
    `color=c=black:s=${W}x${H}:r=${fps}:d=${duration.toFixed(3)},format=yuv420p[fx_black_${index}]`
  );
  filterGraph.push(
    `[fx_black_${index}][${shapeTag}]overlay=x='${axis(clip.keyframes?.x, posX, '(W-w)/2')}':y='${axis(clip.keyframes?.y, posY, '(H-h)/2')}':eval=frame:shortest=1,format=yuv420p[${maskTag}]`
  );
  return maskTag;
};

/**
 * Region effect over everything drawn so far: the frame is processed (blur, mosaic or black), cut to the
 * region with the mask and overlaid for the clip's time range. Returns the new base label.
 */
const pushRegionEffect = (params: RegionEffectParams): string => {
  const { project, filterGraph, clip, index, baseLabel } = params;
  const effect = clip.effect!;
  const { width: W, height: H } = project;
  const start = clip.startTime;
  const end = clip.startTime + clip.duration;

  const keep = `fx_keep_${index}`;
  const copy = `fx_copy_${index}`;
  const processed = `fx_proc_${index}`;
  const merged = `fx_merged_${index}`;
  const next = `fx_out_${index}`;

  let kindFilter: string;
  if (effect.kind === 'blur') {
    kindFilter = `gblur=sigma=${formatNumber(blurSigmaPx(effect.strength, H))}:steps=2`;
  } else if (effect.kind === 'pixelate') {
    const block = pixelBlockPx(effect.strength, H);
    kindFilter = `scale=${Math.max(1, Math.ceil(W / block))}:${Math.max(1, Math.ceil(H / block))}:flags=area,scale=${W}:${H}:flags=neighbor`;
  } else {
    kindFilter = 'drawbox=x=0:y=0:w=iw:h=ih:color=black@1:t=fill';
  }

  filterGraph.push(`[${baseLabel}]split[${keep}][${copy}]`);
  filterGraph.push(`[${copy}]trim=start=${start.toFixed(2)}:end=${end.toFixed(2)},${kindFilter},format=yuv420p[${processed}]`);

  const mask = pushRegionMask(params);
  // The mask stream starts at 0; move it to the clip's place on the timeline so it lines up with the processed frames
  filterGraph.push(`[${mask}]setpts=PTS+${start.toFixed(2)}/TB[fx_mask_t_${index}]`);
  filterGraph.push(`[${processed}][fx_mask_t_${index}]alphamerge[${merged}]`);
  filterGraph.push(
    `[${keep}][${merged}]overlay=enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'[${next}]`
  );
  return next;
};

export class FFmpegCommandBuilder {
  /**
   * Generates a complete FFmpeg command array and filter_complex string for rendering the timeline
   */
  public static buildExportCommand(
    project: ProjectSettings,
    tracks: Track[],
    assets: Map<string, MediaAsset>,
    options: ExportOptions
  ): { args: string[]; filterComplex: string; actualDuration: number } {
    Logger.info('FFmpegCommandBuilder', 'Building FFmpeg export command', {
      resolution: `${project.width}x${project.height}`,
      tracksCount: tracks.length,
    });

    // 1. Calculate actual duration from the end of the latest clip (video, audio, or text)
    let maxClipEnd = 0;
    for (const track of tracks) {
      if (track.isHidden) continue;
      for (const clip of track.clips) {
        const end = clip.startTime + clip.duration;
        if (end > maxClipEnd) {
          maxClipEnd = end;
        }
      }
    }

    if (maxClipEnd <= 0) {
      throw new Error('Zaman çizelgesinde dışa aktarılacak klip bulunamadı.');
    }

    const exportDuration = Math.round(maxClipEnd * 100) / 100;
    Logger.info('FFmpegCommandBuilder', `Export duration dynamically calculated: ${exportDuration}s`);

    const inputs: string[] = [];
    const assetIndexMap = new Map<string, number>();

    // 2. Gather unique media assets
    let currentInputIndex = 0;
    for (const track of tracks) {
      if (track.isHidden) continue;
      for (const clip of track.clips) {
        if (clip.type === 'text' || clip.type === 'effect') continue; // No media behind text or region effects
        if (!assetIndexMap.has(clip.assetId)) {
          const asset = assets.get(clip.assetId);
          if (asset && asset.path) {
            assetIndexMap.set(clip.assetId, currentInputIndex);
            if (asset.type === 'image') {
              // A still becomes a video stream: loop it at the project frame rate for the whole export
              inputs.push('-loop', '1', '-framerate', String(project.fps), '-t', exportDuration.toFixed(2));
            }
            inputs.push('-i', asset.path);
            currentInputIndex++;
          }
        }
      }
    }

    const filterGraph: string[] = [];
    const videoStreams: string[] = [];
    const audioStreams: string[] = [];

    // 3. Base black canvas of exact project dimensions and exact clip duration
    const baseCanvasLabel = 'base_v';
    filterGraph.push(
      `color=c=${project.backgroundColor || '#000000'}:s=${project.width}x${project.height}:r=${project.fps}:d=${exportDuration.toFixed(2)}[${baseCanvasLabel}]`
    );

    let currentVideoBase = baseCanvasLabel;
    let clipIndex = 0;

    // 4. Video & Overlay Tracks
    const videoTracks = tracks.filter((t) => (t.type === 'video' || t.type === 'overlay') && !t.isHidden);

    // Same stacking as the preview: a lower z-index is drawn first; with equal z-index the lower lane is drawn
    // before the lane above it (upper lanes cover lower ones), then clip order
    const layers = [...videoTracks]
      .reverse()
      .flatMap((track) => track.clips)
      .map((clip, order) => ({ clip, order }))
      .sort((a, b) => (a.clip.transform?.zIndex ?? 0) - (b.clip.transform?.zIndex ?? 0) || a.order - b.order);

    {
      for (const { clip } of layers) {
        const inputIdx = assetIndexMap.get(clip.assetId);
        if (inputIdx === undefined) continue;

        // Trim & timing for clip: shift PTS by startTime so overlay filter matches timestamps correctly!
        // The source span is duration * speed; setpts divides by speed so the clip fills `duration` on the timeline.
        const speed = clip.speed || 1;
        const sourceSpan = clip.duration * speed;
        const ptsExpr = Math.abs(speed - 1) > 0.001 ? `(PTS-STARTPTS)/${formatNumber(speed)}` : 'PTS-STARTPTS';
        // yuva420p adds the alpha channel needed for opacity and transitions
        let source = `[${inputIdx}:v]trim=start=${clip.inPoint.toFixed(2)}:duration=${sourceSpan.toFixed(2)},setpts=${ptsExpr}+${clip.startTime.toFixed(2)}/TB,format=yuva420p`;
        if (clip.freeze) {
          // One frame of the source, repeated for the clip's length, then moved to its place on the timeline
          source =
            `[${inputIdx}:v]trim=start=${clip.inPoint.toFixed(2)}:end=${(clip.inPoint + 0.5).toFixed(2)},setpts=PTS-STARTPTS,select='eq(n,0)',` +
            `loop=loop=-1:size=1:start=0,setpts=N/(${project.fps}*TB),trim=duration=${clip.duration.toFixed(3)},` +
            `setpts=PTS+${clip.startTime.toFixed(2)}/TB,format=yuva420p`;
        }

        currentVideoBase = pushVisualLayer({
          project,
          filterGraph,
          source,
          clip,
          index: clipIndex,
          baseLabel: currentVideoBase,
        });
        clipIndex++;
      }
    }

    // 4b. Region effects (blur, mosaic, black box) act on everything drawn so far; text stays sharp on top
    for (const track of tracks.filter((t) => t.type === 'effect' && !t.isHidden)) {
      for (const clip of track.clips) {
        if (!clip.effect) continue;
        currentVideoBase = pushRegionEffect({
          project,
          filterGraph,
          clip,
          index: clipIndex,
          baseLabel: currentVideoBase,
        });
        clipIndex++;
      }
    }

    // 5. Text & Subtitle Clips: plain drawtext on top of the video, or a transparent layer when animated / rotated
    const textTracks = tracks.filter((t) => t.type === 'text' && !t.isHidden);
    let textIndex = 0;

    for (const track of textTracks) {
      for (const clip of track.clips) {
        if (!clip.text) continue;

        if (needsTextLayer(clip)) {
          // Text is drawn once, unscaled, on a transparent project-sized layer anchored at its center.
          // Scale, rotation, position and opacity then go through the same pipeline as video clips.
          const fontSize = clip.text.fontSize || 48;
          const drawParams = buildDrawTextParams(clip, fontSize, textAnchorX(clip), '(h-text_h)/2');
          const source =
            `color=c=black@0.0:s=${project.width}x${project.height}:r=${project.fps}:d=${exportDuration.toFixed(2)},` +
            `format=rgba,drawtext=${drawParams.join(':')},format=yuva420p`;

          currentVideoBase = pushVisualLayer({
            project,
            filterGraph,
            source,
            clip,
            index: clipIndex,
            baseLabel: currentVideoBase,
          });
          clipIndex++;
          continue;
        }

        const textTag = `text_out_${textIndex}`;
        const fontSize = Math.round((clip.text.fontSize || 48) * (clip.transform?.scaleX ?? 1));
        const startTime = clip.startTime.toFixed(2);
        const endTime = (clip.startTime + clip.duration).toFixed(2);

        const posX = Math.round(clip.transform?.x ?? 0);
        const posY = Math.round(clip.transform?.y ?? 0);
        const xPos = `${textAnchorX(clip)}+(${posX})`;
        const yPos = `(h-text_h)/2+(${posY})`;

        const drawParams = buildDrawTextParams(clip, fontSize, xPos, yPos, `between(t,${startTime},${endTime})`);
        filterGraph.push(`[${currentVideoBase}]drawtext=${drawParams.join(':')}[${textTag}]`);
        currentVideoBase = textTag;
        textIndex++;
      }
    }

    videoStreams.push(currentVideoBase);

    // 6. Audio clips mixing
    let audioClipIndex = 0;
    for (const track of tracks) {
      if (track.isMuted || track.type === 'text' || track.type === 'effect') continue;
      for (const clip of track.clips) {
        if (clip.type === 'text' || clip.type === 'effect' || clip.type === 'image' || clip.freeze) continue; // no audio stream
        if (assets.get(clip.assetId)?.hasAudio === false) continue; // the file has no audio stream (silent footage)
        const inputIdx = assetIndexMap.get(clip.assetId);
        if (inputIdx === undefined) continue;

        const audioTag = `a_trim_${audioClipIndex}`;
        const delayedTag = `a_delay_${audioClipIndex}`;
        const vol = (clip.audio?.volume ?? 1) * (clip.audio?.muted ? 0 : 1);

        const delayMs = Math.round(clip.startTime * 1000);
        const audioSpeed = clip.speed || 1;
        const audioSourceSpan = clip.duration * audioSpeed;
        filterGraph.push(
          `[${inputIdx}:a]atrim=start=${clip.inPoint.toFixed(2)}:duration=${audioSourceSpan.toFixed(2)},asetpts=PTS-STARTPTS,${buildAtempoChain(audioSpeed)}${clip.audio?.denoise ? 'afftdn=nr=12,' : ''}${buildFadeFilters(clip.audio, clip.duration)}volume=${vol.toFixed(2)}[${audioTag}]`
        );
        filterGraph.push(`[${audioTag}]adelay=${delayMs}|${delayMs}[${delayedTag}]`);

        audioStreams.push(`[${delayedTag}]`);
        audioClipIndex++;
      }
    }

    // Mix audio streams if any exist
    let finalAudioLabel = '';
    if (audioStreams.length > 0) {
      finalAudioLabel = 'final_a';
      filterGraph.push(`${audioStreams.join('')}amix=inputs=${audioStreams.length}:normalize=0[${finalAudioLabel}]`);
    }

    const filterComplexStr = filterGraph.join('; ');

    // 7. Construct argument array
    const args: string[] = ['-y', ...inputs, '-filter_complex', filterComplexStr, '-map', `[${videoStreams[0]}]`];

    if (finalAudioLabel) {
      args.push('-map', `[${finalAudioLabel}]`, '-c:a', 'aac', '-b:a', options.audioBitrate || '192k');
    }

    args.push(
      '-c:v',
      'libx264',
      '-preset',
      options.preset || 'fast',
      '-pix_fmt',
      'yuv420p',
      '-t',
      exportDuration.toFixed(2),
      options.outputPath
    );

    return { args, filterComplex: filterComplexStr, actualDuration: exportDuration };
  }
}
