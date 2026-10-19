import { Clip, Keyframe, Track } from '@/types/timeline';
import { hasKeyframes } from '@/core/animation/keyframes';
import { buildFadeFilters } from '@/core/audio/fades';
import { ffmpegEqFilter } from '@/core/color/colorGrading';
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

  if (scaleAnimated && rotated) {
    // Rotate at full size first (rotate cannot follow a changing frame size), then scale the rotated frame.
    // Equivalent to scale-then-rotate because animated scale is uniform.
    filterGraph.push(
      `[${clipTag}]scale=${project.width}:${project.height},${rotateFilter()},${animatedScaleFilter('iw', 'ih')}[${scaledTag}]`
    );
  } else if (scaleAnimated) {
    filterGraph.push(`[${clipTag}]${animatedScaleFilter(String(project.width), String(project.height))}[${scaledTag}]`);
  } else {
    const scaleW = Math.round(project.width * staticScaleX);
    const scaleH = Math.round(project.height * staticScaleY);
    filterGraph.push(`[${clipTag}]scale=${scaleW}:${scaleH}${rotated ? `,${rotateFilter()}` : ''}[${scaledTag}]`);
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
    `[${baseLabel}][${scaledTag}]overlay=x=${quote(xExpr, usesExpression)}:y=${quote(yExpr, yUsesExpression)}:enable='between(t,${startTime},${endTime})'[${nextBase}]`
  );

  return nextBase;
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
        if (clip.type === 'text') continue; // Text clips do not need separate media inputs
        if (!assetIndexMap.has(clip.assetId)) {
          const asset = assets.get(clip.assetId);
          if (asset && asset.path) {
            assetIndexMap.set(clip.assetId, currentInputIndex);
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

    for (const track of videoTracks) {
      for (const clip of track.clips) {
        const inputIdx = assetIndexMap.get(clip.assetId);
        if (inputIdx === undefined) continue;

        // Trim & timing for clip: shift PTS by startTime so overlay filter matches timestamps correctly!
        // The source span is duration * speed; setpts divides by speed so the clip fills `duration` on the timeline.
        const speed = clip.speed || 1;
        const sourceSpan = clip.duration * speed;
        const ptsExpr = Math.abs(speed - 1) > 0.001 ? `(PTS-STARTPTS)/${formatNumber(speed)}` : 'PTS-STARTPTS';
        // yuva420p adds the alpha channel needed for opacity and transitions
        const source = `[${inputIdx}:v]trim=start=${clip.inPoint.toFixed(2)}:duration=${sourceSpan.toFixed(2)},setpts=${ptsExpr}+${clip.startTime.toFixed(2)}/TB,format=yuva420p`;

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
      if (track.isMuted || track.type === 'text') continue;
      for (const clip of track.clips) {
        if (clip.type === 'text') continue;
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
