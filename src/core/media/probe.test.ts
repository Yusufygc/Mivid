import { describe, it, expect, vi } from 'vitest';
import { parseHasAudio } from './probe';

// Shapes copied from real `ffmpeg -hide_banner -i file` output
const WITH_AUDIO = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'C:/media/sample.mp4':
  Duration: 00:00:06.00, start: 0.000000, bitrate: 193 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1280x720, 113 kb/s, 30 fps
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, mono, fltp, 69 kb/s (default)
At least one output file must be specified`;

const VIDEO_ONLY = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'C:/media/green.mp4':
  Duration: 00:00:04.00, start: 0.000000, bitrate: 11 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 640x360, 7 kb/s, 30 fps
At least one output file must be specified`;

describe('parseHasAudio', () => {
  it('finds an audio stream in the listing', () => {
    expect(parseHasAudio(WITH_AUDIO)).toBe(true);
    expect(parseHasAudio(`FFmpeg Render Hatası:\n${WITH_AUDIO}`)).toBe(true);
  });

  it('reports silent footage', () => {
    expect(parseHasAudio(VIDEO_ONLY)).toBe(false);
  });

  it('is unknown when there is no stream listing', () => {
    expect(parseHasAudio('FFmpeg çalıştırılamadı (Denenen yol: ffmpeg)')).toBeUndefined();
    expect(parseHasAudio('')).toBeUndefined();
  });

  it('does not mistake the word Audio elsewhere for a stream', () => {
    expect(parseHasAudio(`${VIDEO_ONLY}\nmetadata: title: Audio: demo`)).toBe(false);
  });
});

describe('probeHasAudio', () => {
  it('asks the probe_media command and turns null into unknown', async () => {
    const calls: unknown[][] = [];
    const answers = [true, false, null];
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: async (...args: unknown[]) => {
        calls.push(args);
        return answers.shift();
      },
    }));
    const { probeHasAudio } = await import('./probe');

    expect(await probeHasAudio('C:/m/a.mp4')).toBe(true);
    expect(await probeHasAudio('C:/m/b.mp4')).toBe(false);
    expect(await probeHasAudio('C:/m/c.mp4')).toBeUndefined();
    expect(calls[0]).toEqual(['probe_media', { path: 'C:/m/a.mp4' }]);
    vi.doUnmock('@tauri-apps/api/core');
  });

  it('is unknown when the command is refused', async () => {
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: async () => {
        throw new Error('Bu dosya medya havuzuna dosya diyaloğuyla eklenmemiş.');
      },
    }));
    vi.resetModules();
    const { probeHasAudio } = await import('./probe');
    expect(await probeHasAudio('C:/m/a.mp4')).toBeUndefined();
    vi.doUnmock('@tauri-apps/api/core');
  });
});
