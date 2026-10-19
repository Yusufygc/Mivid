import { describe, it, expect } from 'vitest';
import { computePeaks, sliceWaveform, WaveformPeaks } from './mediaCache';

describe('computePeaks', () => {
  it('keeps the loudest absolute sample of each bucket', () => {
    const samples = new Float32Array([0.1, -0.5, 0.2, 0.9, -0.3, 0.0, 0.4, -0.8]);
    const peaks = computePeaks(samples, 4);
    expect(Array.from(peaks).map((v) => Math.round(v * 10) / 10)).toEqual([0.5, 0.9, 0.3, 0.8]);
  });

  it('handles more buckets than samples and empty input', () => {
    expect(computePeaks(new Float32Array([0.5, -0.25]), 4)).toHaveLength(4);
    expect(Array.from(computePeaks(new Float32Array(0), 3))).toEqual([0, 0, 0]);
  });

  it('clamps to 1', () => {
    expect(computePeaks(new Float32Array([2, -3]), 1)[0]).toBe(1);
  });
});

describe('sliceWaveform', () => {
  // 10 seconds, 1 peak per second: 0..9 / 10
  const waveform: WaveformPeaks = {
    peaks: Float32Array.from({ length: 10 }, (_, i) => (i + 1) / 10),
    duration: 10,
  };

  it('returns the whole waveform resampled to the requested columns', () => {
    const slice = sliceWaveform(waveform, 0, 10, 5);
    expect(Array.from(slice).map((v) => Math.round(v * 10) / 10)).toEqual([0.2, 0.4, 0.6, 0.8, 1]);
  });

  it('cuts to the part of the source a trimmed clip shows', () => {
    // seconds 4..6 of the source: peaks 0.5 and 0.6
    const slice = sliceWaveform(waveform, 4, 6, 2);
    expect(Array.from(slice).map((v) => Math.round(v * 10) / 10)).toEqual([0.5, 0.6]);
  });

  it('is silent outside the media and for an empty waveform', () => {
    expect(Array.from(sliceWaveform(waveform, 12, 14, 2))).toEqual([0, 0]);
    expect(Array.from(sliceWaveform({ peaks: new Float32Array(0), duration: 0 }, 0, 1, 3))).toEqual([0, 0, 0]);
  });
});
