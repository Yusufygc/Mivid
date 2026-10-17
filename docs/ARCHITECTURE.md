# Sistem Mimarisi & Modüler Tasarım (ARCHITECTURE.md)

Bu belge, **CapCut Video Editör** masaüstü uygulamasının katmanlarını, veri akışını ve modül organizasyonunu detaylandırır.

---

## 1. Katmanlı Mimari (Layered Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│                    Kullanıcı Arayüzü (React UI)              │
│   (Header, Media Pool, Preview Canvas, Inspector, Timeline)  │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                  State Katmanı (Zustand Stores)              │
│       (useProjectStore, useTimelineStore, useAssetStore)     │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    Çekirdek Motorlar & Servisler            │
│  - Timeline Engine (Çakışma Önleme, Otomatik Kanal, Snap, Trim)│
│  - Preview Engine (Master Hardware Clock, DOM-Attached Video)│
│  - Command Manager (Undo/Redo Stack)                         │
│  - Export Engine (FFmpeg PTS Zaman Kaydırma, filter_complex) │
│  - Logger Service (Structured Levelled Logging)              │
└──────────────────────────────┬──────────────────────────────┘
                               │ IPC (Tauri v2 Events / Commands)
┌──────────────────────────────▼──────────────────────────────┐
│                 Masaüstü Katmanı (Tauri / Rust)              │
│   (Native Dialogs, File Access, Native FFmpeg CLI Process)   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Dizin Yapısı (Folder Structure)

```
src/
├── assets/                 # Statik ikonlar, görseller
├── components/             # Yeniden kullanılabilir UI bileşenleri
│   ├── common/             # Button, Modal, Slider, Tooltip vb.
│   ├── header/             # Üst menü, Export, Proje adı, Undo/Redo
│   ├── inspector/          # Klip özellikleri (Transform, Ses, Hız)
│   ├── media-pool/         # İçe aktarılan medyalar ve önizlemeleri
│   ├── preview/            # Gerçek zamanlı Canvas Video Oynatıcı
│   └── timeline/           # Çok kanallı zaman çizelgesi & cetvel
├── core/                   # İş mantığı ve soyut motorlar
│   ├── command/            # Undo / Redo komut sınıfları
│   ├── export/             # FFmpeg filter_complex komut üreteçleri
│   ├── logger/             # Seviyeli loglama servisi
│   ├── preview/            # Canvas katman çizim ve senkronizasyon motoru
│   └── timeline/           # Zaman hesaplama, kesme, yapıştırma motoru
├── hooks/                  # Özel React hook'ları (useKeyboardShortcuts, vb.)
├── stores/                 # Zustand modüler store'ları
│   ├── useAssetStore.ts
│   ├── useProjectStore.ts
│   └── useTimelineStore.ts
├── types/                  # TypeScript interface ve tip tanımları
│   ├── asset.ts
│   ├── command.ts
│   ├── project.ts
│   └── timeline.ts
└── utils/                  # Yardımcı fonksiyonlar (formatTime, math, id)
```

---

## 3. Temel Veri Modelleri

- **Project:** Çözünürlük (Örn: 1920x1080), FPS (Örn: 30), Süre, Kanallar dizisi.
- **Track:** Kanal tipi (`video` | `audio` | `text`), Kilitli/Gizli durumu, Klipler listesi.
- **Clip:**
  - `id`: Benzersiz UUID.
  - `assetId`: İlgili medya dosyasının kimliği.
  - `startTime`: Zaman çizelgesindeki başlangıç saniyesi.
  - `duration`: Zaman çizelgesinde kapladığı süre.
  - `inPoint`: Orijinal medyanın başlama noktası.
  - `outPoint`: Orijinal medyanın bitiş noktası.
  - `transform`: Konum (x, y), Ölçek (scaleX, scaleY), Döndürme (rotation), Opaklık (opacity), Katman Sırası (zIndex).
  - `audio`: Ses seviyesi (volume: 0..1), Sessiz (muted).
  - `speed`: Oynatma hızı (0.25x–4x). Kaynak aralığı `outPoint - inPoint`, timeline süresi `duration = kaynak / speed`.
  - `keyframes`: `x`, `y`, `scale`, `opacity` için zamana göre sıralı `Keyframe { id, time, value, easing }` listeleri. `time` klip-yerel saniyedir (klibin başından), kaynak hızından bağımsızdır. Değerlendirme `src/core/animation/keyframes.ts`: preview `resolveTransform()`, export `buildKeyframeExpr()` (aynı easing formülü: `p*p*(3-2*p)`).
