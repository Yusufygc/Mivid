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

    // 1. Calculate actual duration from the end of the latest clip
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

    if (currentInputIndex === 0) {
      throw new Error('Geçerli medya dosyası bulunamadı.');
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

    const videoTracks = tracks.filter((t) => (t.type === 'video' || t.type === 'overlay') && !t.isHidden);

    for (const track of videoTracks) {
      for (const clip of track.clips) {
        const inputIdx = assetIndexMap.get(clip.assetId);
        if (inputIdx === undefined) continue;

        const clipTag = `clip_${clipIndex}`;
        const scaledTag = `scaled_${clipIndex}`;
        const nextBase = `comp_${clipIndex}`;

        // Trim & timing for clip
        filterGraph.push(
          `[${inputIdx}:v]trim=start=${clip.inPoint.toFixed(2)}:duration=${clip.duration.toFixed(2)},setpts=PTS-STARTPTS[${clipTag}]`
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
    videoStreams.push(currentVideoBase);

    // 4. Audio clips mixing
    let audioClipIndex = 0;
    for (const track of tracks) {
      if (track.isMuted) continue;
      for (const clip of track.clips) {
        const inputIdx = assetIndexMap.get(clip.assetId);
        if (inputIdx === undefined) continue;

        const audioTag = `a_trim_${audioClipIndex}`;
        const delayedTag = `a_delay_${audioClipIndex}`;
        const vol = (clip.audio?.volume ?? 1) * (clip.audio?.muted ? 0 : 1);

        // atrim & adelay for audio alignment
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

    // 5. Construct argument array
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
