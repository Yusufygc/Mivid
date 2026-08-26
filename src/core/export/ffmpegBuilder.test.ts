import { describe, it, expect } from 'vitest';
import { FFmpegCommandBuilder } from './ffmpegBuilder';
import { ProjectSettings } from '@/types/project';
import { Track } from '@/types/timeline';
import { MediaAsset } from '@/types/asset';

describe('FFmpegCommandBuilder', () => {
  const mockProject: ProjectSettings = {
    id: 'p1',
    name: 'Test Project',
    width: 1920,
    height: 1080,
    fps: 30,
    aspectRatio: '16:9',
    duration: 10.0,
    backgroundColor: '#000000',
  };

  const mockAsset: MediaAsset = {
    id: 'asset-1',
    name: 'sample.mp4',
    path: 'C:/media/sample.mp4',
    url: 'blob:sample',
    type: 'video',
    duration: 15.0,
    size: 1024,
    createdAt: Date.now(),
  };

  const mockAssets = new Map<string, MediaAsset>([['asset-1', mockAsset]]);

  it('generates valid FFmpeg args for a video clip with trim, overlay and dynamic duration', () => {
    const tracks: Track[] = [
      {
        id: 't1',
        name: 'Video 1',
        type: 'video',
        isMuted: false,
        isLocked: false,
        isHidden: false,
        clips: [
          {
            id: 'c1',
            trackId: 't1',
            assetId: 'asset-1',
            name: 'Clip 1',
            type: 'video',
            startTime: 2.0,
            duration: 5.0,
            inPoint: 1.0,
            outPoint: 6.0,
            speed: 1,
            transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, zIndex: 1 },
            audio: { volume: 1, muted: false, fadeIn: 0, fadeOut: 0 },
          },
        ],
      },
    ];

    const result = FFmpegCommandBuilder.buildExportCommand(mockProject, tracks, mockAssets, {
      outputPath: 'C:/media/output.mp4',
    });

    expect(result.actualDuration).toBe(7.0); // 2.0s start + 5.0s duration = 7.0s
    expect(result.args).toContain('-i');
    expect(result.args).toContain('C:/media/sample.mp4');
    expect(result.args).toContain('-filter_complex');
    expect(result.filterComplex).toContain('color=c=#000000:s=1920x1080:r=30:d=7.00[base_v]');
    expect(result.filterComplex).toContain('trim=start=1.00:duration=5.00');
    expect(result.filterComplex).toContain("overlay=x=0:y=0:enable='between(t,2.00,7.00)'");
    expect(result.args).toContain('C:/media/output.mp4');
  });

  it('throws error when no media is present', () => {
    const emptyTracks: Track[] = [
      {
        id: 't1',
        name: 'Empty Track',
        type: 'video',
        isMuted: false,
        isLocked: false,
        isHidden: false,
        clips: [],
      },
    ];

    expect(() =>
      FFmpegCommandBuilder.buildExportCommand(mockProject, emptyTracks, mockAssets, {
        outputPath: 'out.mp4',
      })
    ).toThrow('Zaman çizelgesinde dışa aktarılacak klip bulunamadı.');
  });
});
