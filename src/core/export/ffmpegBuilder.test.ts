import { describe, it, expect } from 'vitest';
import { FFmpegCommandBuilder, buildAtempoChain, buildKeyframeExpr } from './ffmpegBuilder';
import { ProjectSettings } from '@/types/project';
import { Clip, Keyframe, Track } from '@/types/timeline';
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

  it('generates drawtext filter for text clips correctly', () => {
    const tracks: Track[] = [
      {
        id: 't-text',
        name: 'Metin T1',
        type: 'text',
        isMuted: false,
        isLocked: false,
        isHidden: false,
        clips: [
          {
            id: 'text-1',
            trackId: 't-text',
            assetId: 'text-asset-1',
            name: 'Merhaba Dünya',
            type: 'text',
            startTime: 1.0,
            duration: 4.0,
            inPoint: 0,
            outPoint: 4.0,
            speed: 1,
            transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, zIndex: 5 },
            audio: { volume: 1, muted: true, fadeIn: 0, fadeOut: 0 },
            text: {
              content: 'Merhaba Dünya',
              fontFamily: 'Inter',
              fontSize: 60,
              color: '#FFFFFF',
              fontWeight: 'bold',
              textAlign: 'center',
              stroke: { color: '#000000', width: 3 },
              backgroundBox: { enabled: true, color: 'rgba(0,0,0,0.7)', padding: 10, borderRadius: 8 },
            },
          },
        ],
      },
    ];

    const result = FFmpegCommandBuilder.buildExportCommand(mockProject, tracks, mockAssets, {
      outputPath: 'out.mp4',
    });

    expect(result.actualDuration).toBe(5.0);
    expect(result.filterComplex).toContain("drawtext=text='Merhaba Dünya'");
    expect(result.filterComplex).toContain('fontsize=60');
    expect(result.filterComplex).toContain("enable='between(t,1.00,5.00)'");
    expect(result.filterComplex).toContain('box=1');
    expect(result.filterComplex).toContain('borderw=3');
  });

  const buildVideoTrack = (clipOverrides: Partial<Clip>): Track[] => [
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
          ...clipOverrides,
        },
      ],
    },
  ];

  const kf = (time: number, value: number, easing: Keyframe['easing'] = 'linear'): Keyframe => ({
    id: `kf-${time}`,
    time,
    value,
    easing,
  });

  describe('clip speed', () => {
    it('reads speed * duration from the source and divides PTS by speed (2x)', () => {
      const tracks = buildVideoTrack({ speed: 2, duration: 5.0, inPoint: 1.0, outPoint: 11.0 });
      const { filterComplex } = FFmpegCommandBuilder.buildExportCommand(mockProject, tracks, mockAssets, {
        outputPath: 'out.mp4',
      });
      expect(filterComplex).toContain('trim=start=1.00:duration=10.00');
      expect(filterComplex).toContain('setpts=(PTS-STARTPTS)/2+2.00/TB');
      expect(filterComplex).toContain('atrim=start=1.00:duration=10.00');
      expect(filterComplex).toContain('atempo=2');
    });

    it('chains atempo for speeds below 0.5x', () => {
      expect(buildAtempoChain(1)).toBe('');
      expect(buildAtempoChain(2)).toBe('atempo=2,');
      expect(buildAtempoChain(0.5)).toBe('atempo=0.5,');
      expect(buildAtempoChain(0.25)).toBe('atempo=0.5,atempo=0.5,');
      expect(buildAtempoChain(0.3)).toBe('atempo=0.5,atempo=0.6,');
    });

    it('leaves a 1x clip unchanged', () => {
      const { filterComplex } = FFmpegCommandBuilder.buildExportCommand(
        mockProject,
        buildVideoTrack({}),
        mockAssets,
        { outputPath: 'out.mp4' }
      );
      expect(filterComplex).toContain('setpts=PTS-STARTPTS+2.00/TB');
      expect(filterComplex).not.toContain('atempo');
    });
  });

  describe('keyframes', () => {
    it('builds a piecewise linear expression with holds at both ends', () => {
      const expr = buildKeyframeExpr([kf(0, 0), kf(2, 100)], 3, 't');
      expect(expr).toBe('if(lt(t,3),0,if(lt(t,5),0+(100)*((t-3)/2),100))');
    });

    it('uses smoothstep for ease-in-out', () => {
      const expr = buildKeyframeExpr([kf(0, 1, 'ease-in-out'), kf(1, 2)], 0, 't');
      expect(expr).toContain('((t-0)/1)*((t-0)/1)*(3-2*((t-0)/1))');
    });

    it('returns a constant for a single keyframe', () => {
      expect(buildKeyframeExpr([kf(1, 0.5)], 4)).toBe('0.5');
    });

    it('centers a static scaled clip like the preview does', () => {
      const tracks = buildVideoTrack({
        transform: { x: 40, y: -20, scaleX: 0.5, scaleY: 0.5, rotation: 0, opacity: 1, zIndex: 1 },
      });
      const { filterComplex } = FFmpegCommandBuilder.buildExportCommand(mockProject, tracks, mockAssets, {
        outputPath: 'out.mp4',
      });
      expect(filterComplex).toContain('scale=960:540');
      expect(filterComplex).toContain("overlay=x='(W-w)/2+(40)':y='(H-h)/2+(-20)'");
    });

    it('animates scale with eval=frame and centers the overlay', () => {
      const tracks = buildVideoTrack({ keyframes: { scale: [kf(0, 1), kf(2, 2)] } });
      const { filterComplex } = FFmpegCommandBuilder.buildExportCommand(mockProject, tracks, mockAssets, {
        outputPath: 'out.mp4',
      });
      expect(filterComplex).toContain(':eval=frame');
      expect(filterComplex).toContain("overlay=x='(W-w)/2+(0)':y='(H-h)/2+(0)'");
    });

    it('animates position through overlay expressions', () => {
      const tracks = buildVideoTrack({ keyframes: { x: [kf(0, -100), kf(2, 100)] } });
      const { filterComplex } = FFmpegCommandBuilder.buildExportCommand(mockProject, tracks, mockAssets, {
        outputPath: 'out.mp4',
      });
      expect(filterComplex).toContain("overlay=x='if(lt(t,2),-100,");
      expect(filterComplex).toContain(":y=0:enable=");
    });

    it('animates opacity with geq instead of colorchannelmixer', () => {
      const tracks = buildVideoTrack({ keyframes: { opacity: [kf(0, 0), kf(1, 1)] } });
      const { filterComplex } = FFmpegCommandBuilder.buildExportCommand(mockProject, tracks, mockAssets, {
        outputPath: 'out.mp4',
      });
      expect(filterComplex).toContain("geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='alpha(X,Y)*clip(");
      expect(filterComplex).toContain('lt(T,');
      expect(filterComplex).not.toContain('colorchannelmixer');
    });
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
