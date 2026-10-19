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

  describe('color adjustment', () => {
    it('adds the eq filter right after the source and before opacity', () => {
      const tracks = buildVideoTrack({
        colorGrading: { brightness: 0.1, contrast: 1.2, saturation: 0.8 },
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 0.5, zIndex: 1 },
      });
      const { filterComplex } = FFmpegCommandBuilder.buildExportCommand(mockProject, tracks, mockAssets, {
        outputPath: 'out.mp4',
      });
      expect(filterComplex).toContain(
        'format=yuva420p,eq=brightness=0.100:contrast=1.200:saturation=0.800,colorchannelmixer=aa=0.50'
      );
    });

    it('adds nothing for a neutral clip', () => {
      const { filterComplex } = FFmpegCommandBuilder.buildExportCommand(
        mockProject,
        buildVideoTrack({}),
        mockAssets,
        { outputPath: 'out.mp4' }
      );
      expect(filterComplex).not.toContain('eq=');
    });
  });

  describe('audio fades and denoise', () => {
    it('adds afade and afftdn before the volume filter', () => {
      const tracks = buildVideoTrack({
        audio: { volume: 0.5, muted: false, fadeIn: 1, fadeOut: 2, denoise: true },
      });
      const { filterComplex } = FFmpegCommandBuilder.buildExportCommand(mockProject, tracks, mockAssets, {
        outputPath: 'out.mp4',
      });
      expect(filterComplex).toContain(
        'asetpts=PTS-STARTPTS,afftdn=nr=12,afade=t=in:st=0:d=1.00,afade=t=out:st=3.00:d=2.00,volume=0.50'
      );
    });

    it('leaves audio untouched without fades or denoise', () => {
      const { filterComplex } = FFmpegCommandBuilder.buildExportCommand(
        mockProject,
        buildVideoTrack({}),
        mockAssets,
        { outputPath: 'out.mp4' }
      );
      expect(filterComplex).toContain('asetpts=PTS-STARTPTS,volume=1.00');
      expect(filterComplex).not.toContain('afade');
      expect(filterComplex).not.toContain('afftdn');
    });
  });

  describe('rotation and text layers', () => {
    const buildTextTrack = (clipOverrides: Partial<Clip>): Track[] => [
      {
        id: 'tt',
        name: 'Text',
        type: 'text',
        isMuted: false,
        isLocked: false,
        isHidden: false,
        clips: [
          {
            id: 't1',
            trackId: 'tt',
            assetId: 'text-1',
            name: 'Hello',
            type: 'text',
            startTime: 1,
            duration: 3,
            inPoint: 0,
            outPoint: 3,
            speed: 1,
            transform: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, zIndex: 5 },
            audio: { volume: 1, muted: true, fadeIn: 0, fadeOut: 0 },
            text: {
              content: 'Hello',
              fontFamily: 'Inter',
              fontSize: 60,
              color: '#FFFFFF',
              fontWeight: 'bold',
              textAlign: 'center',
            },
            ...clipOverrides,
          },
        ],
      },
    ];

    it('rotates a static video clip with a fixed square output and centers it', () => {
      const tracks = buildVideoTrack({
        transform: { x: 0, y: 0, scaleX: 0.5, scaleY: 0.5, rotation: 30, opacity: 1, zIndex: 1 },
      });
      const { filterComplex } = FFmpegCommandBuilder.buildExportCommand(mockProject, tracks, mockAssets, {
        outputPath: 'out.mp4',
      });
      expect(filterComplex).toContain('scale=960:540,rotate=a=\'30*PI/180\':ow=\'ceil(hypot(iw,ih)/2)*2\'');
      expect(filterComplex).toContain(':c=none');
      expect(filterComplex).toContain("overlay=x='(W-w)/2+(0)'");
    });

    it('animates rotation through the keyframe expression (degrees to radians)', () => {
      const tracks = buildVideoTrack({ keyframes: { rotation: [kf(0, 0), kf(2, 90)] } });
      const { filterComplex } = FFmpegCommandBuilder.buildExportCommand(mockProject, tracks, mockAssets, {
        outputPath: 'out.mp4',
      });
      expect(filterComplex).toContain("rotate=a='(if(lt(t,2),0,");
      expect(filterComplex).toContain(")*PI/180'");
    });

    it('rotates before the animated scale when both are animated', () => {
      const tracks = buildVideoTrack({
        keyframes: { rotation: [kf(0, 0), kf(2, 90)], scale: [kf(0, 1), kf(2, 0.5)] },
      });
      const { filterComplex } = FFmpegCommandBuilder.buildExportCommand(mockProject, tracks, mockAssets, {
        outputPath: 'out.mp4',
      });
      const chain = filterComplex.split('; ').find((f) => f.includes('rotate='))!;
      expect(chain.indexOf('rotate=')).toBeLessThan(chain.indexOf(':eval=frame'));
      expect(chain).toContain('scale=1920:1080,rotate=');
    });

    it('keeps plain static text on the direct drawtext path', () => {
      const { filterComplex } = FFmpegCommandBuilder.buildExportCommand(
        mockProject,
        buildTextTrack({}),
        mockAssets,
        { outputPath: 'out.mp4' }
      );
      expect(filterComplex).toContain("drawtext=text='Hello'");
      expect(filterComplex).toContain('x=(w-text_w)/2+(10)');
      expect(filterComplex).not.toContain('rotate=');
      expect(filterComplex).not.toContain('format=rgba');
    });

    it('anchors left and right aligned text like the preview (canvas center, not 10% margins)', () => {
      const left = FFmpegCommandBuilder.buildExportCommand(
        mockProject,
        buildTextTrack({ text: { ...buildTextTrack({})[0].clips[0].text!, textAlign: 'left' } }),
        mockAssets,
        { outputPath: 'out.mp4' }
      );
      expect(left.filterComplex).toContain('x=w/2+(10)');

      const right = FFmpegCommandBuilder.buildExportCommand(
        mockProject,
        buildTextTrack({ text: { ...buildTextTrack({})[0].clips[0].text!, textAlign: 'right' } }),
        mockAssets,
        { outputPath: 'out.mp4' }
      );
      expect(right.filterComplex).toContain('x=w/2-text_w+(10)');
    });

    it('renders rotated text on a transparent layer instead of drawtext on the canvas', () => {
      const { filterComplex } = FFmpegCommandBuilder.buildExportCommand(
        mockProject,
        buildTextTrack({ transform: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 15, opacity: 1, zIndex: 5 } }),
        mockAssets,
        { outputPath: 'out.mp4' }
      );
      expect(filterComplex).toContain('color=c=black@0.0:s=1920x1080:r=30:d=4.00,format=rgba,drawtext=text=\'Hello\'');
      expect(filterComplex).toContain("rotate=a='15*PI/180'");
      expect(filterComplex).toContain("overlay=x='(W-w)/2+(10)':y='(H-h)/2+(20)':enable='between(t,1.00,4.00)'");
      // text is anchored at the layer center and not offset inside the layer
      expect(filterComplex).toContain('x=(w-text_w)/2:y=(h-text_h)/2');
    });

    it('animates text position, scale and opacity with keyframes', () => {
      const { filterComplex } = FFmpegCommandBuilder.buildExportCommand(
        mockProject,
        buildTextTrack({
          keyframes: {
            x: [kf(0, -100), kf(2, 100)],
            scale: [kf(0, 1), kf(2, 2)],
            opacity: [kf(0, 0), kf(1, 1)],
          },
        }),
        mockAssets,
        { outputPath: 'out.mp4' }
      );
      expect(filterComplex).toContain('format=rgba,drawtext=');
      expect(filterComplex).toContain(':eval=frame');
      expect(filterComplex).toContain("geq=lum='lum(X,Y)'");
      expect(filterComplex).toContain("overlay=x='(W-w)/2+(if(lt(t,1),-100,");
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
