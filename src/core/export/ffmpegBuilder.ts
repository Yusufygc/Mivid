import { Clip, EffectSettings, Keyframe, Track, Transition } from '@/types/timeline';
import {
  BLUR_TRANSITION_SIGMA_RATIO,
  TransitionSide,
  alphaFactorExpr,
  easedExpr,
  fadesAlpha,
  progressExpr,
  slideOffsetExpr,
  zoomFactorExpr,
} from '@/core/transitions/transitions';
import { hasKeyframes } from '@/core/animation/keyframes';
import { buildFadeFilters } from '@/core/audio/fades';
import { ffmpegEqFilter } from '@/core/color/colorGrading';
import { escapeFilterPath, resolveFontFile, WINDOWS_FONT_DIRECTORY } from './fonts';
import { ffmpegChromakeyFilter } from '@/core/chroma/chromaKey';
import {
  DEFAULT_TINT_COLOR,
  VIGNETTE_INNER,
  backdropSigmaPx,
  blurSigmaPx,
  coversWholeFrame,
  featherSigmaPx,
  pixelBlockPx,
  sharpenKernel,
  strengthOfSlice,
  strengthSliceCount,
  tintAlpha,
} from '@/core/effects/regionEffects';
import { ffmpegFitFilter } from '@/core/layout/fit';
import { MediaAsset } from '@/types/asset';
import { ProjectSettings } from '@/types/project';
import { Logger } from '@/core/logger';

export interface ExportOptions {
  outputPath: string;
  preset?: 'ultrafast' | 'fast' | 'medium' | 'slow';
  videoBitrate?: string;
  audioBitrate?: string;
  /** Folder with the font files text is drawn with (default: the Windows fonts folder). null = leave the font to FFmpeg. */
  fontDirectory?: string | null;
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
const buildDrawTextParams = (
  clip: Clip,
  fontSize: number,
  xPos: string,
  yPos: string,
  enable?: string,
  fontDirectory: string | null = WINDOWS_FONT_DIRECTORY
): string[] => {
  const text = clip.text!;
  const params: string[] = [
    `text='${escapeFFmpegText(text.content)}'`,
    // The font family and weight of the preview, as a font file: drawtext has no notion of a CSS font family
    ...(fontDirectory === null
      ? []
      : [`fontfile='${escapeFilterPath(resolveFontFile(text.fontFamily, text.fontWeight, text.fontStyle, fontDirectory))}'`]),
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
    // The backdrop fades with the clip for every transition that fades the clip (linear; masks and slides are not applied to it)
    if (clip.transitionIn && fadesAlpha(clip.transitionIn.type)) {
      backdropFilters += `,fade=t=in:st=${startTime}:d=${clip.transitionIn.duration.toFixed(2)}:alpha=1`;
    }
    if (clip.transitionOut && fadesAlpha(clip.transitionOut.type)) {
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

  // Linear dissolve / fade: FFmpeg's own fade filter. Eased dissolves and the other types are processed per frame below.
  if (isLinearFade(clip.transitionIn)) {
    clipFilters += `,fade=t=in:st=${startTime}:d=${clip.transitionIn!.duration.toFixed(2)}:alpha=1`;
  }
  if (isLinearFade(clip.transitionOut)) {
    const outStart = (endTimeNum - clip.transitionOut!.duration).toFixed(2);
    clipFilters += `,fade=t=out:st=${outStart}:d=${clip.transitionOut!.duration.toFixed(2)}:alpha=1`;
  }

  filterGraph.push(`${clipFilters}[${clipTag}]`);

  // Scale and rotation
  const scaleKeyframes = clip.keyframes?.scale;
  const rotationKeyframes = clip.keyframes?.rotation;
  const staticRotation = clip.transform?.rotation ?? 0;
  const rotated = hasContent(rotationKeyframes) || Math.abs(staticRotation) > 1e-6;
  const staticScaleX = clip.transform?.scaleX ?? 1;
  const staticScaleY = clip.transform?.scaleY ?? 1;

  // A zoom transition multiplies the scale while it runs (the factor is 1 outside its window)
  const zoomFactors: string[] = [];
  for (const [side, transition] of [['in', clip.transitionIn], ['out', clip.transitionOut]] as const) {
    if (transition?.type === 'zoom' && transition.duration > 0) {
      zoomFactors.push(zoomFactorExpr(transitionEase(transition, side, 't', clip.startTime, endTimeNum)));
    }
  }
  const scaleAnimated = hasContent(scaleKeyframes) || zoomFactors.length > 0;

  const rotateFilter = (): string => {
    const degrees = hasContent(rotationKeyframes)
      ? `(${buildKeyframeExpr(rotationKeyframes, clip.startTime, 't')})`
      : formatNumber(staticRotation);
    // Fixed square output that fits any angle; the transparent corners keep the clip centered
    const side = `ceil(hypot(iw,ih)/2)*2`;
    return `rotate=a='${degrees}*PI/180':ow='${side}':oh='${side}':c=none`;
  };
  const animatedScaleFilter = (baseW: string, baseH: string): string => {
    const factors = [hasContent(scaleKeyframes) ? `(${buildKeyframeExpr(scaleKeyframes, clip.startTime, 't')})` : '', ...zoomFactors].filter(
      Boolean
    );
    const scaleExpr = factors.join('*');
    // Evaluated per frame (t = timeline seconds); sizes stay even for the chroma planes
    const evenSize = (dimension: string) => `max(2,trunc(${dimension}*(${scaleExpr})/2)*2)`;
    return `scale=w='${evenSize(baseW)}':h='${evenSize(baseH)}':eval=frame`;
  };

  // Fitted or covering footage is brought to the frame size first (letterbox bars stay transparent),
  // then scaled and rotated like any other layer. Stretched footage keeps the original single scale step.
  const fitted = clip.type !== 'text' && !!clip.fit && clip.fit !== 'stretch';
  const fitFilter = ffmpegFitFilter(clip.fit, project.width, project.height);

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
  let yExpr = axisExpr(clip.keyframes?.y, posY, '(H-h)/2');
  let yUsesExpression = needsCentering || hasContent(clip.keyframes?.y);

  // Slide: the position follows the eased progress (zero outside the transition window)
  for (const [side, transition] of [['in', clip.transitionIn], ['out', clip.transitionOut]] as const) {
    if (transition?.type !== 'slide' || transition.duration <= 0) continue;
    const offset = slideOffsetExpr(transition, side, transitionEase(transition, side, 't', clip.startTime, endTimeNum));
    if (offset.x !== '0') {
      xExpr += `+(${offset.x})`;
      usesExpression = true;
    }
    if (offset.y !== '0') {
      yExpr += `+(${offset.y})`;
      yUsesExpression = true;
    }
  }

  const quote = (expr: string, isExpr: boolean): string => (isExpr ? `'${expr}'` : expr);

  /** Scale / rotate one stream and overlay it on `under` while `window` is on */
  const emitLayer = (input: string, framed: boolean, suffix: string, under: string, out: string, window: [string, string]): void => {
    const scaled = `${scaledTag}${suffix}`;
    const toFrame = fitted ? fitFilter : `scale=${project.width}:${project.height}`;
    if (scaleAnimated && rotated) {
      // Rotate at full size first (rotate cannot follow a changing frame size), then scale the rotated frame.
      // Equivalent to scale-then-rotate because animated scale is uniform.
      filterGraph.push(`[${input}]${framed ? '' : `${toFrame},`}${rotateFilter()},${animatedScaleFilter('iw', 'ih')}[${scaled}]`);
    } else if (scaleAnimated) {
      filterGraph.push(
        fitted || framed
          ? `[${input}]${framed ? '' : `${fitFilter},`}${animatedScaleFilter('iw', 'ih')}[${scaled}]`
          : `[${input}]${animatedScaleFilter(String(project.width), String(project.height))}[${scaled}]`
      );
    } else {
      const scaleW = Math.round(project.width * staticScaleX);
      const scaleH = Math.round(project.height * staticScaleY);
      const sized = scaleW !== project.width || scaleH !== project.height;
      let resize: string;
      if (framed) resize = sized ? `scale=${scaleW}:${scaleH}` : 'null';
      else resize = fitted ? `${fitFilter}${sized ? `,scale=${scaleW}:${scaleH}` : ''}` : `scale=${scaleW}:${scaleH}`;
      filterGraph.push(`[${input}]${resize}${rotated ? `,${rotateFilter()}` : ''}[${scaled}]`);
    }
    filterGraph.push(
      `[${under}][${scaled}]overlay=x=${quote(xExpr, usesExpression)}:y=${quote(yExpr, yUsesExpression)}:enable='between(t,${window[0]},${window[1]})'[${out}]`
    );
  };

  // Transitions that need the pixels (masks, eased alpha, blur) run on the frame-sized layer, and only for their own
  // time window: the layer is split into head / middle / tail, each overlaid for its own range.
  const windowedIn = isWindowed(clip.transitionIn) ? clip.transitionIn! : null;
  const windowedOut = isWindowed(clip.transitionOut) ? clip.transitionOut! : null;

  let current: string;
  if (!windowedIn && !windowedOut) {
    emitLayer(clipTag, false, '', underBase, nextBase, [startTime, endTime]);
    current = nextBase;
  } else {
    const framedTag = `framed_${index}`;
    filterGraph.push(`[${clipTag}]${fitted ? fitFilter : `scale=${project.width}:${project.height}`}[${framedTag}]`);

    const inEnd = windowedIn ? startTimeNum + windowedIn.duration : startTimeNum;
    const outStart = windowedOut ? Math.max(inEnd, endTimeNum - windowedOut.duration) : endTimeNum;
    const parts: Array<{ tag: string; from: number; to: number; chain: string }> = [];
    if (windowedIn) {
      parts.push({ tag: 'h', from: startTimeNum, to: inEnd, chain: transitionPixelChain(windowedIn, 'in', project, clip.startTime, endTimeNum) });
    }
    if (outStart > inEnd + 1e-6) parts.push({ tag: 'm', from: inEnd, to: outStart, chain: '' });
    if (windowedOut) {
      parts.push({ tag: 't', from: outStart, to: endTimeNum, chain: transitionPixelChain(windowedOut, 'out', project, clip.startTime, endTimeNum) });
    }

    const branchTags = parts.map((part) => `${framedTag}_${part.tag}`);
    filterGraph.push(`[${framedTag}]split=${parts.length}${branchTags.map((t) => `[${t}]`).join('')}`);

    current = underBase;
    parts.forEach((part, i) => {
      const branch = branchTags[i];
      const trimmed = `${branch}_c`;
      const range = `trim=start=${part.from.toFixed(3)}:end=${part.to.toFixed(3)}`;
      filterGraph.push(`[${branch}]${range}${part.chain ? `,${part.chain}` : ''}[${trimmed}]`);
      const out = i === parts.length - 1 ? nextBase : `${nextBase}_${part.tag}`;
      emitLayer(trimmed, true, `_${part.tag}`, current, out, [part.from.toFixed(3), part.to.toFixed(3)]);
      current = out;
    });
  }

  // Flash: a white layer over the whole frame whose opacity falls away from the cut
  for (const [side, transition] of [['in', clip.transitionIn], ['out', clip.transitionOut]] as const) {
    if (transition?.type !== 'flash' || transition.duration <= 0) continue;
    const d = transition.duration;
    const from = side === 'in' ? startTimeNum : endTimeNum - d;
    const flashTag = `flash_${side}_${index}`;
    const local = side === 'in' ? `clip(T/${formatNumber(d)},0,1)` : `clip(1-T/${formatNumber(d)},0,1)`;
    const e = easedExpr(local, transition.easing);
    filterGraph.push(
      `color=c=white:s=${project.width}x${project.height}:r=${project.fps}:d=${d.toFixed(3)},format=yuva420p,` +
        `geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='255*(1-(${e}))',setpts=PTS+${from.toFixed(3)}/TB[${flashTag}]`
    );
    const out = `${nextBase}_f${side}`;
    filterGraph.push(`[${current}][${flashTag}]overlay=enable='between(t,${from.toFixed(3)},${(from + d).toFixed(3)})'[${out}]`);
    current = out;
  }

  return current;
};

/** Eased progress of a transition as an FFmpeg expression of time */
const transitionEase = (
  transition: Transition,
  side: TransitionSide,
  timeVar: 't' | 'T',
  clipStart: number,
  clipEnd: number
): string => easedExpr(progressExpr(side, timeVar, clipStart, clipEnd, transition.duration), transition.easing);

/** Dissolve and fade at the default (linear) easing use FFmpeg's fade filter */
const isLinearFade = (transition: Transition | undefined): boolean =>
  !!transition &&
  transition.duration > 0 &&
  (transition.type === 'cross-dissolve' || transition.type === 'fade-to-black') &&
  transition.easing !== 'ease-in-out';

/** Transitions that change pixels of the layer: masks, blur, zoom's alpha and eased dissolves */
const isWindowed = (transition: Transition | undefined): boolean =>
  !!transition &&
  transition.duration > 0 &&
  (transition.type === 'wipe' ||
    transition.type === 'iris' ||
    transition.type === 'blur' ||
    transition.type === 'zoom' ||
    (fadesAlpha(transition.type) && !isLinearFade(transition)));

/** Filters for the transition window of the frame-sized layer: blur, then the alpha factor through geq (T = timeline seconds) */
const transitionPixelChain = (
  transition: Transition,
  side: TransitionSide,
  project: ProjectSettings,
  clipStart: number,
  clipEnd: number
): string => {
  const filters: string[] = [];
  if (transition.type === 'blur') {
    filters.push(`gblur=sigma=${formatNumber(project.height * BLUR_TRANSITION_SIGMA_RATIO)}:steps=2`);
  }
  const factor = alphaFactorExpr(transition, side, transitionEase(transition, side, 'T', clipStart, clipEnd));
  if (factor) filters.push(`geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='alpha(X,Y)*(${factor})'`);
  return filters.join(',');
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
  // Inverted: the effect applies everywhere except the region, so the shape is black on a white frame
  if (effect.invert) shape += `,geq=lum='255-lum(X,Y)'`;
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
    `color=c=${effect.invert ? 'white' : 'black'}:s=${W}x${H}:r=${fps}:d=${duration.toFixed(3)},format=yuv420p[fx_black_${index}]`
  );
  filterGraph.push(
    `[fx_black_${index}][${shapeTag}]overlay=x='${axis(clip.keyframes?.x, posX, '(W-w)/2')}':y='${axis(clip.keyframes?.y, posY, '(H-h)/2')}':eval=frame:shortest=1,format=yuv420p[${maskTag}]`
  );
  return maskTag;
};

/** The processing filter of an effect for one strength (the vignette is a layer of its own, see pushVignetteLayer) */
const regionKindFilter = (effect: EffectSettings, strength: number, project: ProjectSettings): string => {
  const { width: W, height: H } = project;
  switch (effect.kind) {
    case 'blur':
      return `gblur=sigma=${formatNumber(blurSigmaPx(strength, H))}:steps=2`;
    case 'pixelate': {
      const block = pixelBlockPx(strength, H);
      return `scale=${Math.max(1, Math.ceil(W / block))}:${Math.max(1, Math.ceil(H / block))}:flags=area,scale=${W}:${H}:flags=neighbor`;
    }
    case 'sharpen': {
      // The same 3x3 kernel as the preview's SVG filter, on RGB planes
      const kernel = sharpenKernel(strength).map(formatNumber).join(' ');
      return `format=gbrp,convolution=0m='${kernel}':1m='${kernel}':2m='${kernel}',format=yuv420p`;
    }
    default:
      return 'drawbox=x=0:y=0:w=iw:h=ih:color=black@1:t=fill';
  }
};

/** Darkening layer of a vignette for one time slice: a black frame whose alpha follows vignetteAlpha(), looped from one frame */
const pushVignetteLayer = (
  { project, filterGraph, index }: RegionEffectParams,
  strength: number,
  from: number,
  to: number,
  slice: number,
  under: string
): string => {
  const { width: W, height: H, fps } = project;
  const tag = `fx_vig_${index}_${slice}`;
  const out = `fx_out_${index}_${slice}`;
  const radius = `hypot(X+0.5-W/2,Y+0.5-H/2)/hypot(W/2,H/2)`;
  const ramp = `pow(clip((${radius}-${formatNumber(VIGNETTE_INNER)})/${formatNumber(1 - VIGNETTE_INNER)},0,1),2)`;
  filterGraph.push(
    `color=c=black:s=${W}x${H}:r=${fps}:d=${(1 / fps).toFixed(5)},format=yuva420p,` +
      `geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='255*${formatNumber(strength)}*${ramp}',` +
      `loop=loop=-1:size=1:start=0,setpts=N/(${fps}*TB),trim=duration=${(to - from).toFixed(3)},setpts=PTS+${from.toFixed(3)}/TB[${tag}]`
  );
  filterGraph.push(`[${under}][${tag}]overlay=enable='between(t,${from.toFixed(3)},${to.toFixed(3)})'[${out}]`);
  return out;
};

/**
 * Effect over everything drawn so far: the frame is processed (blur, mosaic, tint, sharpen or black), cut to the
 * region with the mask (or its inverse; no mask when the effect covers the whole frame) and overlaid for the clip's
 * time range. A strength ramp is rendered as constant-strength slices, the same steps the preview uses.
 * Returns the new base label.
 */
const pushRegionEffect = (params: RegionEffectParams): string => {
  const { project, filterGraph, clip, index, baseLabel } = params;
  const effect = clip.effect!;
  const start = clip.startTime;
  const end = clip.startTime + clip.duration;
  const wholeFrame = coversWholeFrame(effect);

  const count = strengthSliceCount(effect, clip.duration);
  const slices = Array.from({ length: count }, (_, i) => ({
    from: start + (clip.duration * i) / count,
    to: start + (clip.duration * (i + 1)) / count,
    strength: strengthOfSlice(effect, i, count),
  }));

  if (effect.kind === 'vignette') {
    let current = baseLabel;
    slices.forEach((slice, i) => {
      current = pushVignetteLayer(params, slice.strength, slice.from, slice.to, i, current);
    });
    return current;
  }

  const keep = `fx_keep_${index}`;
  const copy = `fx_copy_${index}`;
  const next = `fx_out_${index}`;
  const sliceTag = (prefix: string, i: number) => (count === 1 ? `${prefix}_${index}` : `${prefix}_${index}_${i}`);

  filterGraph.push(`[${baseLabel}]split[${keep}][${copy}]`);
  if (count > 1) {
    filterGraph.push(`[${copy}]split=${count}${slices.map((_, i) => `[${sliceTag('fx_cs', i)}]`).join('')}`);
  }

  let maskStream: string | null = null;
  if (!wholeFrame) {
    const mask = pushRegionMask(params);
    // The mask stream starts at 0; move it to the clip's place on the timeline so it lines up with the processed frames
    maskStream = `fx_mask_t_${index}`;
    filterGraph.push(`[${mask}]setpts=PTS+${start.toFixed(2)}/TB[${maskStream}]`);
    if (count > 1) {
      filterGraph.push(`[${maskStream}]split=${count}${slices.map((_, i) => `[${sliceTag('fx_ms', i)}]`).join('')}`);
    }
  }

  let current = keep;
  slices.forEach((slice, i) => {
    const from = count === 1 ? start : slice.from;
    const to = count === 1 ? end : slice.to;
    const input = count === 1 ? copy : sliceTag('fx_cs', i);
    const processed = sliceTag('fx_proc', i);
    if (effect.kind === 'tint') {
      // A color layer of the tint opacity over the copy (drawbox would ignore the alpha on a frame without alpha)
      const wash = sliceTag('fx_wash', i);
      const trimmed = sliceTag('fx_tr', i);
      filterGraph.push(
        `color=c=${(effect.color || DEFAULT_TINT_COLOR).toLowerCase()}:s=${project.width}x${project.height}:r=${project.fps}:d=${(to - from + 0.1).toFixed(3)},` +
          `format=yuva420p,colorchannelmixer=aa=${formatNumber(tintAlpha(slice.strength))},setpts=PTS+${from.toFixed(2)}/TB[${wash}]`
      );
      filterGraph.push(`[${input}]trim=start=${from.toFixed(2)}:end=${to.toFixed(2)}[${trimmed}]`);
      filterGraph.push(`[${trimmed}][${wash}]overlay,format=yuv420p[${processed}]`);
    } else {
      filterGraph.push(
        `[${input}]trim=start=${from.toFixed(2)}:end=${to.toFixed(2)},${regionKindFilter(effect, slice.strength, project)},format=yuv420p[${processed}]`
      );
    }

    let layer = processed;
    if (maskStream) {
      let maskPart = maskStream;
      if (count > 1) {
        maskPart = sliceTag('fx_mt', i);
        filterGraph.push(`[${sliceTag('fx_ms', i)}]trim=start=${from.toFixed(2)}:end=${to.toFixed(2)}[${maskPart}]`);
      }
      layer = sliceTag('fx_merged', i);
      filterGraph.push(`[${processed}][${maskPart}]alphamerge[${layer}]`);
    }

    const out = i === count - 1 ? next : sliceTag('fx_o', i);
    filterGraph.push(`[${current}][${layer}]overlay=enable='between(t,${from.toFixed(2)},${to.toFixed(2)})'[${out}]`);
    current = out;
  });
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
          const drawParams = buildDrawTextParams(
            clip,
            fontSize,
            textAnchorX(clip),
            '(h-text_h)/2',
            undefined,
            options.fontDirectory === undefined ? WINDOWS_FONT_DIRECTORY : options.fontDirectory
          );
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

        const drawParams = buildDrawTextParams(
          clip,
          fontSize,
          xPos,
          yPos,
          `between(t,${startTime},${endTime})`,
          options.fontDirectory === undefined ? WINDOWS_FONT_DIRECTORY : options.fontDirectory
        );
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
