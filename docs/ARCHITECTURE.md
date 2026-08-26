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
│  - Timeline Engine (Split, Trim, Snap, Track Management)     │
│  - Preview Engine (Canvas Real-time Multi-layer Renderer)    │
│  - Command Manager (Undo/Redo Stack)                         │
│  - Export Engine (FFmpeg Filter Graph Builder)               │
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
