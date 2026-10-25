# Sistem Mimarisi

Mivid'in katmanları, dizin yapısı ve temel veri akışı. Ayrıntılar konu sayfalarında: [[timeline-model]], [[export-pipeline]], [[preview-engine]], [[desktop-security]]. Giriş: [[index]].

## 1. Katmanlar

```
┌─────────────────────────────────────────────────────────────┐
│                    Kullanıcı Arayüzü (React UI)              │
│  Header, Media Pool, Preview, Inspector, Timeline, Export    │
└──────────────────────────────┬──────────────────────────────┘
┌──────────────────────────────▼──────────────────────────────┐
│                 State Katmanı (Zustand Stores)               │
│    useProjectStore, useTimelineStore, useAssetStore          │
└──────────────────────────────┬──────────────────────────────┘
┌──────────────────────────────▼──────────────────────────────┐
│                  Çekirdek (src/core, React'siz)              │
│  timeline (yerleşim, snap, bölme) · command (undo/redo)      │
│  animation (keyframe) · preview (canvas motoru)              │
│  export (FFmpeg filter_complex) · project (kaydet/aç)        │
│  effects, layout, chroma, color, audio, media, logger        │
└──────────────────────────────┬──────────────────────────────┘
                               │ IPC (Tauri v2 komutları ve olayları)
┌──────────────────────────────▼──────────────────────────────┐
│                 Masaüstü Katmanı (Tauri / Rust)              │
│  yerel diyaloglar, izin listesi, argüman doğrulayıcı, FFmpeg │
└─────────────────────────────────────────────────────────────┘
```

Kural: `src/core` React import etmez; UI doğrudan dosya ya da FFmpeg çalıştırmaz. Bkz. [[rules]].

## 2. Dizin yapısı

```
src/
├── App.tsx                 # Düzen: header, medya havuzu, önizleme, denetçi, yeniden boyutlanır timeline
├── components/
│   ├── export/             # ExportModal (konum seçimi, ilerleme)
│   ├── header/             # Header (proje adı, undo/redo, FPS, en-boy), ProjectActions, RecoveryBanner
│   ├── inspector/          # Inspector, TextInspector, KeyframeControls
│   ├── media-pool/         # MediaPool + metin/geçiş/efekt hazır ayarları
│   ├── preview/            # PreviewPlayer (canvas, araç satırı, oynatma kontrolleri)
│   └── timeline/           # Timeline, ClipVisuals (film şeridi/dalga), KeyframeMarkers
├── core/
│   ├── animation/          # keyframes.ts: resolveTransform, evaluateProp, easing
│   ├── audio/              # fades.ts
│   ├── chroma/             # chromaKey.ts (FFmpeg formülüyle aynı)
│   ├── color/              # colorGrading.ts (ön ayarlar, eq)
│   ├── command/            # commandManager, timelineHistory (undo/redo, birleştirme penceresi)
│   ├── effects/            # regionEffects.ts (bölge blur/mozaik/siyah kutu matematiği)
│   ├── export/             # ffmpegBuilder.ts, fonts.ts
│   ├── layout/             # fit.ts (Gerdir/Sığdır/Doldur)
│   ├── logger/             # LoggerService (bellek tamponlu)
│   ├── media/              # mediaCache.ts (film şeridi, dalga formu), probe.ts (sessiz medya)
│   ├── preview/            # previewEngine, effectRenderer, chromaRenderer, handleMath
│   ├── project/            # projectFile (doğrulama), projectIO, projectSession (otomatik kayıt)
│   └── timeline/           # timelineEngine.ts
├── stores/                 # useAssetStore, useProjectStore, useTimelineStore
├── types/                  # asset, command, project, timeline
└── utils/                  # time.ts

src-tauri/src/              # lib.rs, media_access.rs, export_guard.rs (bkz. [[desktop-security]])
src-tauri/tests/fixtures/   # export_args.json: builder çıktısından üretilen sözleşme dosyası
```

## 3. Veri akışı

1. Kullanıcı eylemi (UI) → store eylemi (`useTimelineStore`) → `TimelineEngine` saf fonksiyonları yeni `tracks` üretir → `timelineHistory` geri alma kaydı tutar.
2. `PreviewEngine` store'u dinler; her karede `resolveTransform(clip, t - clip.startTime)` ile klibin anlık durumunu çizer ([[preview-engine]]).
3. Export: `FFmpegCommandBuilder.buildExportCommand(project, tracks, assets, options)` argüman dizisi üretir → `invoke('run_ffmpeg_export')` → Rust doğrular ve FFmpeg'i çalıştırır, ilerleme `export-progress` olayıyla gelir ([[export-pipeline]]).
4. Proje: `captureProject` → `serializeProject` → dosya; açarken `parseProjectFile` doğrular, `applyProjectFile` store'ları doldurur. 1,5 sn gecikmeli otomatik kayıt `localStorage`'a yazar ([[timeline-model]]).

## 4. Teknoloji

Tauri v2 (Rust, `rfd` diyaloglar), React 19, TypeScript 6, Vite 8, Tailwind 3, Zustand 5, Vitest 4, oxlint. FFmpeg dış süreç olarak çalışır; LGPL build sidecar olarak paketlenecek (`npm run bundle`, denenmedi) ([[known-issues]], [[audit-report]] Bulgu 3).
