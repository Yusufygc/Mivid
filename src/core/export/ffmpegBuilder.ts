import { Keyframe, Track } from '@/types/timeline';
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

        const clipTag = `clip_${clipIndex}`;
        const scaledTag = `scaled_${clipIndex}`;
        const nextBase = `comp_${clipIndex}`;

        // Trim & timing for clip: shift PTS by startTime so overlay filter matches timestamps correctly!
        // The source span is duration * speed; setpts divides by speed so the clip fills `duration` on the timeline.
        const speed = clip.speed || 1;
        const sourceSpan = clip.duration * speed;
        const ptsExpr = Math.abs(speed - 1) > 0.001 ? `(PTS-STARTPTS)/${formatNumber(speed)}` : 'PTS-STARTPTS';
        let clipFilters = `[${inputIdx}:v]trim=start=${clip.inPoint.toFixed(2)}:duration=${sourceSpan.toFixed(2)},setpts=${ptsExpr}+${clip.startTime.toFixed(2)}/TB`;

        // Add alpha channel support for opacity and transitions
        clipFilters += `,format=yuva420p`;

        const startTimeNum = clip.startTime;
        const endTimeNum = clip.startTime + clip.duration;
        const startTime = startTimeNum.toFixed(2);
        const endTime = endTimeNum.toFixed(2);

        // Opacity
        const opacityKeyframes = clip.keyframes?.opacity;
        const opacity = clip.transform?.opacity ?? 1;
        if (opacityKeyframes && opacityKeyframes.length > 0) {
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

        // Scale: static, or an animated size evaluated per frame (t = timeline seconds)
        const scaleKeyframes = clip.keyframes?.scale;
        const scaleAnimated = !!scaleKeyframes && scaleKeyframes.length > 0;
        const staticScaleX = clip.transform?.scaleX ?? 1;
        const staticScaleY = clip.transform?.scaleY ?? 1;

        if (scaleAnimated) {
          const scaleExpr = buildKeyframeExpr(scaleKeyframes!, clip.startTime, 't');
          const evenSize = (base: number) => `max(2,trunc(${base}*(${scaleExpr})/2)*2)`;
          filterGraph.push(
            `[${clipTag}]scale=w='${evenSize(project.width)}':h='${evenSize(project.height)}':eval=frame[${scaledTag}]`
          );
        } else {
          const scaleW = Math.round(project.width * staticScaleX);
          const scaleH = Math.round(project.height * staticScaleY);
          filterGraph.push(`[${clipTag}]scale=${scaleW}:${scaleH}[${scaledTag}]`);
        }

        // Position: offset from the canvas center, same as the preview. Scaled frames are centered first.
        const posX = Math.round(clip.transform?.x ?? 0);
        const posY = Math.round(clip.transform?.y ?? 0);
        const needsCentering = scaleAnimated || Math.abs(staticScaleX - 1) > 1e-6 || Math.abs(staticScaleY - 1) > 1e-6;

        let usesExpression = false;
        const axisExpr = (keyframes: Keyframe[] | undefined, staticValue: number, centerExpr: string): string => {
          let expr: string;
          if (keyframes && keyframes.length > 0) {
            usesExpression = true;
            const animated = buildKeyframeExpr(keyframes, clip.startTime, 't');
            expr = needsCentering ? `${centerExpr}+(${animated})` : animated;
          } else if (needsCentering) {
            usesExpression = true;
            expr = `${centerExpr}+(${staticValue})`;
          } else {
            expr = String(staticValue);
          }
          return expr;
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
        const yUsesExpression = needsCentering || (clip.keyframes?.y?.length ?? 0) > 0;

        filterGraph.push(
          `[${currentVideoBase}][${scaledTag}]overlay=x=${quote(xExpr, usesExpression)}:y=${quote(yExpr, yUsesExpression)}:enable='between(t,${startTime},${endTime})'[${nextBase}]`
        );

        currentVideoBase = nextBase;
        clipIndex++;
      }
    }

    // 5. Text & Subtitle Clips (drawtext filters applied on top of video)
    const textTracks = tracks.filter((t) => t.type === 'text' && !t.isHidden);
    let textIndex = 0;

    for (const track of textTracks) {
      for (const clip of track.clips) {
        if (!clip.text) continue;

        const textTag = `text_out_${textIndex}`;
        const escapedContent = escapeFFmpegText(clip.text.content);
        const fontSize = Math.round((clip.text.fontSize || 48) * (clip.transform?.scaleX ?? 1));
        const fontColor = hexToFFmpegColor(clip.text.color || '#FFFFFF');
        const startTime = clip.startTime.toFixed(2);
        const endTime = (clip.startTime + clip.duration).toFixed(2);

        const posX = Math.round(clip.transform?.x ?? 0);
        const posY = Math.round(clip.transform?.y ?? 0);

        let xPos = `(w-text_w)/2+(${posX})`;
        if (clip.text.textAlign === 'left') {
          xPos = `w*0.1+(${posX})`;
        } else if (clip.text.textAlign === 'right') {
          xPos = `w*0.9-text_w+(${posX})`;
        }
        const yPos = `(h-text_h)/2+(${posY})`;

        const drawTextParams: string[] = [
          `text='${escapedContent}'`,
          `fontsize=${fontSize}`,
          `fontcolor=${fontColor}`,
          `x=${xPos}`,
          `y=${yPos}`,
          `enable='between(t,${startTime},${endTime})'`,
        ];

        // Background box
        if (clip.text.backgroundBox?.enabled) {
          const boxColor = hexToFFmpegColor(clip.text.backgroundBox.color || 'rgba(0,0,0,0.7)');
          const borderW = clip.text.backgroundBox.padding || 12;
          drawTextParams.push('box=1', `boxcolor=${boxColor}`, `boxborderw=${borderW}`);
        }

        // Stroke
        if (clip.text.stroke && clip.text.stroke.width > 0) {
          const strokeColor = hexToFFmpegColor(clip.text.stroke.color || '#000000');
          drawTextParams.push(`borderw=${clip.text.stroke.width}`, `bordercolor=${strokeColor}`);
        }

        // Shadow
        if (clip.text.shadow) {
          const shadowColor = hexToFFmpegColor(clip.text.shadow.color || 'rgba(0,0,0,0.7)');
          drawTextParams.push(
            `shadowx=${clip.text.shadow.offsetX || 2}`,
            `shadowy=${clip.text.shadow.offsetY || 2}`,
            `shadowcolor=${shadowColor}`
          );
        }

        filterGraph.push(`[${currentVideoBase}]drawtext=${drawTextParams.join(':')}[${textTag}]`);
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
          `[${inputIdx}:a]atrim=start=${clip.inPoint.toFixed(2)}:duration=${audioSourceSpan.toFixed(2)},asetpts=PTS-STARTPTS,${buildAtempoChain(audioSpeed)}volume=${vol.toFixed(2)}[${audioTag}]`
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
