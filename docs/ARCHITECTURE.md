# Sistem Mimarisi & Modüler Tasarım (ARCHITECTURE.md)

Bu belge, **Mivid** masaüstü uygulamasının katmanlarını, veri akışını ve modül organizasyonunu detaylandırır.

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

src-tauri/src/
├── lib.rs                  # Tauri komutları: select_media_files, open_project_dialog, select_export_path,
│                           #   run_ffmpeg_export, probe_media, open_file_location
├── media_access.rs         # Kullanıcının yerel diyalogla seçtiği dosyaların izin listesi (asset kapsamı + export hedefi),
│                           #   app data klasöründe kalıcı (media_allowlist.json)
└── export_guard.rs         # run_ffmpeg_export argüman doğrulayıcı (bayrak/filtre beyaz listesi, yol kuralları)
src-tauri/tests/fixtures/export_args.json   # builder çıktısından üretilen sözleşme dosyası (guardFixtures.test.ts yazar)
```

### Masaüstü güvenlik modeli
- **CSP açık** (`tauri.conf.json` `csp` / `devCsp`): betik yalnızca `'self'`, ağ yalnızca IPC ve asset protokolü.
- **Asset protokolü kapsamı boş** (`scope: []`): dosya, kullanıcı `select_media_files` ya da `open_project_dialog` ile seçince Rust tarafında kapsama eklenir (`media_access::grant`). Betikten çağrılabilen "izin ver" komutu yoktur.
- **Export çıktısı** yalnızca `select_export_path` kayıt diyaloğunda seçilen dosyaya yazılır; `run_ffmpeg_export` `output_path` almaz.
- **Argüman doğrulama** (`export_guard::validate`): bilinen bayraklar, izin listesindeki `-i` dosyaları, son argüman = seçilen çıktı, `-filter_complex` içinde yalnızca oluşturucunun kullandığı filtreler; `movie`, `subtitles`, `textfile=` gibi dosya okuyanlar ve `C:/Windows/Fonts` dışı `fontfile` reddedilir. Oluşturucuya yeni filtre/bayrak eklenince `guardFixtures.test.ts` snapshot'ı ve `ALLOWED_FILTERS` birlikte güncellenir.
- **Probe**: `probe_media` yalnızca izin listesindeki dosyayı `ffmpeg -i` ile sorar (eskiden export komutu hata metni için kötüye kullanılıyordu).

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
