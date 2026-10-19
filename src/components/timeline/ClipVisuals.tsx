import React, { useEffect, useRef, useState } from 'react';
import { Clip } from '@/types/timeline';
import { MediaAsset } from '@/types/asset';
import { WaveformPeaks, getFilmstrip, getWaveform, sliceWaveform } from '@/core/media/mediaCache';

interface ClipVisualsProps {
  clip: Clip;
  asset: MediaAsset | undefined;
  zoom: number;
}

const MAX_CANVAS_WIDTH = 4000;

/** Frames behind a video clip and the waveform of an audio clip, both cut to the part of the media the clip shows */
export const ClipVisuals: React.FC<ClipVisualsProps> = ({ clip, asset, zoom }) => {
  const [filmstrip, setFilmstrip] = useState<string | null>(null);
  const [waveform, setWaveform] = useState<WaveformPeaks | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const assetId = asset?.id;
  const wantsFilmstrip = clip.type === 'video';
  const wantsWaveform = clip.type === 'audio';

  useEffect(() => {
    if (!asset || !wantsFilmstrip) return;
    let active = true;
    void getFilmstrip(asset).then((url) => {
      if (active) setFilmstrip(url);
    });
    return () => {
      active = false;
    };
    // The asset object changes only when the media itself does
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId, asset?.url, wantsFilmstrip]);

  useEffect(() => {
    if (!asset || !wantsWaveform) return;
    let active = true;
    void getWaveform(asset).then((peaks) => {
      if (active) setWaveform(peaks);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId, asset?.url, wantsWaveform]);

  const clipWidth = Math.max(1, clip.duration * zoom);
  const sourceFrom = clip.inPoint;
  const sourceTo = clip.inPoint + clip.duration * clip.speed;

  // Waveform: one column per two pixels, drawn as mirrored bars
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveform) return;

    const width = Math.min(MAX_CANVAS_WIDTH, Math.max(1, Math.round(clipWidth)));
    const height = canvas.clientHeight || 48;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(167, 243, 208, 0.85)';

    const columns = Math.max(1, Math.floor(width / 2));
    const peaks = sliceWaveform(waveform, sourceFrom, sourceTo, columns);
    const mid = height / 2;
    for (let c = 0; c < columns; c++) {
      const barHeight = Math.max(1, peaks[c] * (height - 6));
      ctx.fillRect(c * 2, mid - barHeight / 2, 1.4, barHeight);
    }
  }, [waveform, clipWidth, sourceFrom, sourceTo]);

  if (wantsFilmstrip && filmstrip && asset) {
    // The strip covers the whole asset; shift and size it so the clip shows its own part
    const fullWidth = (asset.duration / clip.speed) * zoom;
    const offset = (clip.inPoint / clip.speed) * zoom;
    return (
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-50 z-0"
        style={{
          backgroundImage: `url(${filmstrip})`,
          backgroundSize: `${fullWidth}px 100%`,
          backgroundPosition: `${-offset}px 0`,
          backgroundRepeat: 'no-repeat',
        }}
      />
    );
  }

  if (wantsWaveform && waveform) {
    return <canvas ref={canvasRef} aria-hidden className="absolute inset-0 w-full h-full pointer-events-none z-0" />;
  }

  return null;
};
