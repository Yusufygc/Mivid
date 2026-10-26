import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import type { Update } from '@tauri-apps/plugin-updater';
import { Logger } from '@/core/logger';

/** Wait before asking GitHub, so the check never competes with the editor starting up */
const CHECK_DELAY_MS = 4000;

type Phase = 'idle' | 'downloading' | 'installing' | 'failed';

/**
 * Desktop only: asks the release feed (GitHub Releases `latest.json`) for a newer signed version and offers to
 * install it. The check fails quietly (offline, no release yet): an update is never a reason to bother the editor.
 */
export const UpdateBanner: React.FC = () => {
  const [update, setUpdate] = useState<Update | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [percent, setPercent] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      import('@tauri-apps/plugin-updater')
        .then(({ check }) => check())
        .then((found) => {
          if (!cancelled && found) setUpdate(found);
        })
        .catch((err) => Logger.warn('UpdateBanner', 'Update check failed', err));
    }, CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (!update || dismissed) return null;

  const install = async () => {
    try {
      setPhase('downloading');
      let total = 0;
      let received = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') total = event.data.contentLength ?? 0;
        if (event.event === 'Progress') {
          received += event.data.chunkLength;
          if (total > 0) setPercent(Math.min(100, Math.round((received / total) * 100)));
        }
        if (event.event === 'Finished') setPhase('installing');
      });
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (err) {
      Logger.error('UpdateBanner', 'Update failed', err);
      setPhase('failed');
    }
  };

  const busy = phase === 'downloading' || phase === 'installing';

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 px-4 py-2 bg-primary/10 border-b border-primary/30 text-xs text-gray-200"
    >
      <span className="flex items-center gap-2">
        <Download className="w-4 h-4 text-primary" />
        {phase === 'failed' ? (
          <>Güncelleme kurulamadı. Daha sonra yeniden dene.</>
        ) : phase === 'downloading' ? (
          <>Sürüm {update.version} indiriliyor… %{percent}</>
        ) : phase === 'installing' ? (
          <>Kuruluyor, uygulama yeniden açılacak…</>
        ) : (
          <>
            Yeni sürüm var: <b>{update.version}</b> (şu an {update.currentVersion}). Proje otomatik kaydedilir.
          </>
        )}
      </span>
      {!busy && (
        <span className="flex items-center gap-2">
          {phase !== 'failed' && (
            <button
              onClick={() => void install()}
              className="px-3 py-1 rounded bg-primary text-black font-semibold hover:brightness-110"
            >
              Güncelle
            </button>
          )}
          <button onClick={() => setDismissed(true)} className="px-3 py-1 rounded bg-surface-light text-gray-300 hover:text-white">
            Sonra
          </button>
        </span>
      )}
    </div>
  );
};
