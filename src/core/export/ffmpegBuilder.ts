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
  ): { args: string[]; filterComplex: string } {
    Logger.info('FFmpegCommandBuilder', 'Building FFmpeg export command', {
      resolution: `${project.width}x${project.height}`,
      tracksCount: tracks.length,
    });

    const inputs: string[] = [];
    const assetIndexMap = new Map<string, number>();

    // 1. Gather all unique media assets used in the timeline
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
      throw new Error('No valid media clips found to export.');
    }

    const filterGraph: string[] = [];
    const videoStreams: string[] = [];
    const audioStreams: string[] = [];

    // 2. Base black canvas of project dimensions and duration
    const baseCanvasLabel = 'base_v';
    filterGraph.push(
      `color=c=${project.backgroundColor || 'black'}:s=${project.width}x${project.height}:r=${project.fps}:d=${project.duration.toFixed(2)}[${baseCanvasLabel}]`
    );

    let currentVideoBase = baseCanvasLabel;
    let clipIndex = 0;

    // Collect all video clips sorted by track order and start time
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

    // 3. Audio clips mixing
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

    // 4. Construct complete argument array
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
      project.duration.toFixed(2),
      options.outputPath
    );

    return { args, filterComplex: filterComplexStr };
  }
}
