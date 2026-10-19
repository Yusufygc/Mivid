import React, { useState, useEffect } from 'react';
import { useProjectStore } from '@/stores/useProjectStore';
import { useTimelineStore } from '@/stores/useTimelineStore';
import { useAssetStore } from '@/stores/useAssetStore';
import { probeUsedAssets } from '@/core/media/probe';
import { FFmpegCommandBuilder } from '@/core/export/ffmpegBuilder';
import { Logger } from '@/core/logger';
import { X, Download, Terminal, CheckCircle2, AlertTriangle, Copy, Check, Info, FolderOpen } from 'lucide-react';

/** Stands in for the output file in the command preview of the web mode, where nothing is written */
const WEB_PREVIEW_OUTPUT = 'output.mp4';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose }) => {
  const { project } = useProjectStore();
  const { tracks } = useTimelineStore();
  const { assets } = useAssetStore();

  // Desktop: the file the user picked in the native save dialog (the Rust export writes only there). Empty until picked.
  const [pickedOutputPath, setPickedOutputPath] = useState<string>('');
  const [preset, setPreset] = useState<'ultrafast' | 'fast' | 'medium'>('fast');
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [commandInfo, setCommandInfo] = useState<{ args: string[]; filterComplex: string; actualDuration: number } | null>(null);
  const [isTauriEnv, setIsTauriEnv] = useState<boolean>(false);
  const [exportFinished, setExportFinished] = useState(false);
  const outputPath = pickedOutputPath || WEB_PREVIEW_OUTPUT;

  useEffect(() => {
    const hasTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    setIsTauriEnv(Boolean(hasTauri));
  }, []);

  // Listen to real-time progress from Tauri
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    if (isTauriEnv) {
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen<{ progress: number; time_str: string; status: string }>('export-progress', (event) => {
          setProgress(Math.round(event.payload.progress));
          setStatusMessage(event.payload.status);
          if (event.payload.progress >= 100) {
            setExportFinished(true);
            setIsExporting(false);
          }
        }).then((un) => {
          unlisten = un;
        });
      });
    }

    return () => {
      if (unlisten) unlisten();
    };
  }, [isTauriEnv]);

  if (!isOpen) return null;

  // Calculate actual content duration
  let maxClipEnd = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      const end = clip.startTime + clip.duration;
      if (end > maxClipEnd) maxClipEnd = end;
    }
  }
  const estimatedDuration = maxClipEnd > 0 ? maxClipEnd.toFixed(1) : project.duration.toFixed(1);

  const handleChooseOutput = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const picked = await invoke<string | null>('select_export_path', {
        suggestedName: `${project.name.trim().replace(/\s+/g, '_') || 'Adsiz_Proje'}_rendered.mp4`,
      });
      if (picked) {
        setPickedOutputPath(picked);
        setErrorMessage(null);
      }
    } catch (err) {
      Logger.error('ExportModal', 'Could not pick the export location', err);
      setErrorMessage((err as Error).message || String(err));
    }
  };

  const handleGeneratePreview = () => {
    try {
      const result = FFmpegCommandBuilder.buildExportCommand(project, tracks, assets, {
        outputPath,
        preset,
      });
      setCommandInfo(result);
      setErrorMessage(null);
    } catch (err) {
      Logger.error('ExportModal', 'Failed to generate FFmpeg command', err);
      setErrorMessage((err as Error).message);
    }
  };

  const handleStartExport = async () => {
    try {
      setIsExporting(true);
      setExportFinished(false);
      setProgress(5);
      setErrorMessage(null);
      setStatusMessage('FFmpeg Render İşlemi Başlatılıyor...');

      // Files without an audio stream must not be asked for one: find out which before building the command
      if (isTauriEnv) await probeUsedAssets(tracks);
      const result = FFmpegCommandBuilder.buildExportCommand(project, tracks, useAssetStore.getState().assets, {
        outputPath,
        preset,
      });
      setCommandInfo(result);

      if (isTauriEnv) {
        // Native Tauri Desktop Execution with real-time streaming
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('run_ffmpeg_export', {
          args: result.args,
          totalDuration: result.actualDuration,
        });

        setProgress(100);
        setStatusMessage(`Render başarıyla tamamlandı!`);
        setExportFinished(true);
        setIsExporting(false);
      } else {
        // Browser Web Mode Notice
        setStatusMessage('Web Tarayıcı Modu: Gerçek render için masaüstü modunu veya terminal komutunu kullanın.');
        setProgress(100);
        setIsExporting(false);
      }
    } catch (err) {
      Logger.error('ExportModal', 'Export error', err);
      setErrorMessage((err as Error).message || String(err));
      setIsExporting(false);
    }
  };

  const handleOpenFolder = async () => {
    if (isTauriEnv) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_file_location', { path: outputPath });
      } catch (err) {
        console.warn('Could not open folder', err);
      }
    }
  };

  const copyCommand = () => {
    if (!commandInfo) {
      try {
        const res = FFmpegCommandBuilder.buildExportCommand(project, tracks, assets, { outputPath, preset });
        setCommandInfo(res);
        const fullCmd = `ffmpeg ${res.args.map((a) => (a.includes(' ') || a.includes(';') ? `"${a}"` : a)).join(' ')}`;
        navigator.clipboard.writeText(fullCmd);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      } catch (err) {
        setErrorMessage((err as Error).message);
        return;
      }
    }
    const fullCmd = `ffmpeg ${commandInfo.args.map((a) => (a.includes(' ') || a.includes(';') ? `"${a}"` : a)).join(' ')}`;
    navigator.clipboard.writeText(fullCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-surface border border-surface-border rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="p-4 border-b border-surface-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" />
            <h2 className="text-sm font-bold text-white">Videoyu Dışa Aktar (FFmpeg Export)</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-surface-light">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          {/* Environment Warning Banner */}
          {!isTauriEnv && (
            <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl flex items-start gap-2.5 text-xs text-amber-200">
              <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-300">Web Tarayıcı Önizleme Modundasınız</p>
                <p className="text-amber-200/80 mt-0.5 leading-relaxed">
                  Tarayıcı güvenlik kısıtlamaları nedeniyle doğrudan diskte dosya yazamaz. Gerçek render çıktısı üretmek için uygulamayı terminalde <code className="px-1 bg-black/40 rounded text-amber-300">npm run tauri dev</code> ile masaüstü modunda açabilir ya da aşağıdaki FFmpeg komutunu kopyalayabilirsiniz.
                </p>
              </div>
            </div>
          )}

          {/* Summary Banner */}
          <div className="bg-surface-light/60 p-3 rounded-xl border border-surface-border flex items-center justify-between text-xs">
            <div>
              <p className="font-semibold text-white">{project.name}</p>
              <p className="text-gray-400 mt-0.5 font-mono">{project.width}x{project.height} • {project.fps} FPS • {estimatedDuration}s Gerçek Süre</p>
            </div>
            <span className="px-2.5 py-1 rounded bg-primary/10 text-primary font-mono font-medium border border-primary/20">
              H.264 / AAC
            </span>
          </div>

          {/* Settings Fields */}
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-300 block mb-1">Kayıt Yolu (Output File Path)</label>
              <div className="flex items-stretch gap-2">
                <input
                  type="text"
                  readOnly
                  value={isTauriEnv ? pickedOutputPath : WEB_PREVIEW_OUTPUT}
                  placeholder="Henüz konum seçilmedi"
                  className="flex-1 min-w-0 bg-surface-light px-3 py-2 rounded-lg text-xs text-gray-200 border border-surface-border outline-none font-mono"
                />
                {isTauriEnv && (
                  <button
                    onClick={handleChooseOutput}
                    disabled={isExporting}
                    className="flex items-center gap-1.5 px-3 rounded-lg bg-surface-light text-xs text-gray-200 border border-surface-border hover:border-primary/60 disabled:opacity-50 transition-all"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Konum Seç</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-300 block mb-1">Kodlama Hızı (Preset)</label>
                <select
                  value={preset}
                  onChange={(e) => setPreset(e.target.value as any)}
                  className="w-full bg-surface-light px-3 py-2 rounded-lg text-xs text-gray-200 border border-surface-border focus:border-primary outline-none"
                >
                  <option value="ultrafast">Çok Hızlı (Ultrafast)</option>
                  <option value="fast">Hızlı / Dengeli (Fast - Önerilen)</option>
                  <option value="medium">Yüksek Kalite (Medium)</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-300 block mb-1">Ses Kalitesi</label>
                <select className="w-full bg-surface-light px-3 py-2 rounded-lg text-xs text-gray-200 border border-surface-border focus:border-primary outline-none">
                  <option value="192k">192 kbps (Yüksek Kalite)</option>
                  <option value="320k">320 kbps (Stüdyo)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Real-time Progress Bar */}
          {(isExporting || exportFinished) && (
            <div className="space-y-2 pt-2 bg-surface-light/30 p-3 rounded-xl border border-surface-border">
              <div className="flex justify-between text-xs text-gray-200 font-medium">
                <span>{statusMessage}</span>
                <span className="font-mono font-bold text-primary">%{progress}</span>
              </div>
              <div className="w-full h-2.5 bg-surface-light rounded-full overflow-hidden">
                <div
                  style={{ width: `${progress}%` }}
                  className="h-full bg-gradient-to-r from-primary to-primary-hover transition-all duration-200"
                />
              </div>
            </div>
          )}

          {/* Completion Action */}
          {exportFinished && (
            <div className="bg-primary/10 border border-primary/30 p-3 rounded-xl flex items-center justify-between text-xs text-primary">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span className="font-medium">Video başarıyla dışa aktarıldı!</span>
              </div>
              <button
                onClick={handleOpenFolder}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-black font-semibold rounded-lg hover:brightness-110 active:scale-95 transition-all text-xs shadow-md"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Klasörde Göster</span>
              </button>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="bg-rose-500/10 border border-rose-500/30 p-3 rounded-lg flex items-start gap-2 text-xs text-rose-300">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400 mt-0.5" />
              <div className="flex-1 overflow-x-auto max-h-32 font-mono text-[11px] whitespace-pre-wrap">
                {errorMessage}
              </div>
            </div>
          )}

          {/* FFmpeg Command View & Copy */}
          <div className="space-y-1.5 pt-1 border-t border-surface-border">
            <div className="flex items-center justify-between">
              <button
                onClick={handleGeneratePreview}
                className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>FFmpeg Komutunu Göster</span>
              </button>
              <button
                onClick={copyCommand}
                className="text-xs text-gray-300 hover:text-white bg-surface-light px-2.5 py-1 rounded border border-surface-border hover:border-primary/50 flex items-center gap-1.5 transition-all"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Kopyalandı!' : 'Komutu Kopyala'}</span>
              </button>
            </div>

            {commandInfo && (
              <pre className="bg-black/80 p-2.5 rounded-lg border border-surface-border text-[10px] font-mono text-gray-300 overflow-x-auto max-h-24 select-all leading-relaxed">
                ffmpeg {commandInfo.args.map((a) => (a.includes(' ') || a.includes(';') ? `"${a}"` : a)).join(' ')}
              </pre>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-surface-light/40 border-t border-surface-border flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2 rounded-lg text-xs font-medium text-gray-300 hover:bg-surface-light transition-all"
          >
            Kapat
          </button>
          <button
            onClick={handleStartExport}
            disabled={isExporting || (isTauriEnv && !pickedOutputPath)}
            title={isTauriEnv && !pickedOutputPath ? 'Önce kayıt konumunu seçin' : undefined}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-primary to-primary-hover text-black font-semibold text-xs shadow-lg shadow-primary/20 hover:brightness-110 active:scale-95 disabled:opacity-50 transition-all"
          >
            <Download className="w-4 h-4" />
            <span>{isExporting ? 'Dışa Aktarılıyor...' : isTauriEnv ? 'FFmpeg Export Başlat' : 'Export Bilgisini Al'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
