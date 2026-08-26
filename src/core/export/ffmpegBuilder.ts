import { Track } from '@/types/timeline';
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
        filterGraph.push(
          `[${inputIdx}:v]trim=start=${clip.inPoint.toFixed(2)}:duration=${clip.duration.toFixed(2)},setpts=PTS-STARTPTS+${clip.startTime.toFixed(2)}/TB[${clipTag}]`
        );

        // Scale & Transform
        const scaleW = Math.round(project.width * (clip.transform?.scaleX ?? 1));
        const scaleH = Math.round(project.height * (clip.transform?.scaleY ?? 1));
        filterGraph.push(`[${clipTag}]scale=${scaleW}:${scaleH}[${scaledTag}]`);

        // Overlay with start time
        const startTime = clip.startTime.toFixed(2);
        const endTime = (clip.startTime + clip.duration).toFixed(2);
        const posX = Math.round(clip.transform?.x ?? 0);
        const posY = Math.round(clip.transform?.y ?? 0);

        filterGraph.push(
          `[${currentVideoBase}][${scaledTag}]overlay=x=${posX}:y=${posY}:enable='between(t,${startTime},${endTime})'[${nextBase}]`
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
        filterGraph.push(
          `[${inputIdx}:a]atrim=start=${clip.inPoint.toFixed(2)}:duration=${clip.duration.toFixed(2)},asetpts=PTS-STARTPTS,volume=${vol.toFixed(2)}[${audioTag}]`
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
