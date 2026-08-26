# Proje Durumu & Görev Listesi (TODO.md)

Bu belge proje boyunca tamamlanan, devam eden ve planlanan tüm geliştirme maddelerini canlı olarak takip eder.

---

## 🚀 Faz 1: Temel Altyapı & Mimarinin Kurulması
- [x] Tauri v2 + React (TypeScript + Vite) iskeletinin oluşturulması
- [x] Tailwind CSS, PostCSS ve CapCut renk paletinin yapılandırılması
- [x] Vitest test ortamının entegrasyonu (`vitest.config.ts`, `setupTests.ts`)
- [x] Dokümantasyon altyapısının kurulması (`ARCHITECTURE.md`, `RULES.md`, `TODO.md`, `README.md`)
- [x] Merkezi Seviyeli Loglama Servisinin kodlanması (`src/core/logger/`)
- [x] Loglama servisi birim testlerinin yazılması (`src/core/logger/logger.test.ts`)

---

## 🎬 Faz 2: Çekirdek Veri Modelleri & Zaman Çizelgesi Motoru (Timeline Engine)
- [x] TypeScript Veri Modelleri (`types/asset.ts`, `types/timeline.ts`, `types/project.ts`, `types/command.ts`)
- [x] Modüler Zustand Store'larının oluşturulması:
  - [x] `useAssetStore`: Medya yükleme (Native dosya yolu + Web Blob), timeout korumalı süre/metadata çıkarma, listeleme, silme
  - [x] `useTimelineStore`: Çok kanallı izler, klip ekleme/taşıma/kesme/kırpma/silme, zoom, playhead
  - [x] `useProjectStore`: Çözünürlük, en-boy oranı, FPS, proje ayarları
- [x] Timeline Matematiksel & Mantıksal Motoru (`src/core/timeline/timelineEngine.ts`):
  - [x] Klip bölme (Split at playhead)
  - [x] Klip kırpma (Trim in/out)
  - [x] Klipleri sürükleyip sıralama & manyetik yapışma (Snapping)
- [x] Undo / Redo Komut Yöneticisi (`src/core/command/commandManager.ts`)
- [x] Zaman ve Kare Yardımcıları (`src/utils/time.ts` ve `time.test.ts`)
- [x] Timeline Motoru Birim Testlerinin yazılması (`src/core/timeline/timelineEngine.test.ts`)

---

## 🎨 Faz 3: CapCut Tarzı Modern Arayüz & Yüksek Performanslı Önizleme (Preview Engine)
- [x] **Header Bar (`src/components/header/Header.tsx`):**
  - [x] Proje adı düzenleme
  - [x] Undo / Redo butonları
  - [x] En-boy oranı (16:9, 9:16, 1:1, 4:3, 21:9)
  - [x] Export (Dışa Aktar) butonu
- [x] **Medya Paneli (`src/components/media-pool/MediaPool.tsx`):**
  - [x] Windows yerel dosya seçici entegrasyonu (rfd / Tauri IPC ile tam dosya yolu alma)
  - [x] Medya küçük resimleri (Thumbnails), süre ve format etiketleri
  - [x] Tek tıkla zaman çizelgesine ekleme ve silme
- [x] **Çok Kanallı Zaman Çizelgesi (`src/components/timeline/Timeline.tsx`):**
  - [x] Dinamik zaman cetveli (Ruler) ve donanım hızlandırmalı oynatma kafası (`will-change: transform`)
  - [x] Video (V1), Overlay/PiP (V2) ve Ses (A1) kanalları
  - [x] Sürükle-bırak klip yerleşimi ve Sol/Sağ kırpma tutamaçları (Trim handles)
  - [x] Bölme (Split) aracı & Kısayollar (`Ctrl+B`, `Delete`, `Space`, Ok tuşları)
  - [x] Manyetik Yapışma (Magnet snapping) ve Zaman çizelgesi Zoom kaydırıcısı
- [x] **Gerçek Zamanlı 60 FPS Önizleme Oynatıcısı (`src/core/preview/previewEngine.ts`):**
  - [x] Videoların ve harici seslerin eş zamanlı, net ve yüksek kaliteli ses çıkışı
  - [x] Tauri `assetProtocol` yetkileri açıldı (yerel disk dosyalarını anında oynatma)
  - [x] Asılı kalma (hanging metadata promise) koruması eklendi
- [x] **Özellikler Paneli (`src/components/inspector/Inspector.tsx`):**
  - [x] Klip X, Y konumu, Ölçek (Scale), Opaklık (Opacity), Döndürme (Rotation)
  - [x] Ses Seviyesi (Volume) ve Mute ayarı

---

## ⚡ Faz 4: FFmpeg Entegrasyonu & Canlı İlerlemeli Video Dışa Aktarma (Export)
- [x] FFmpeg `filter_complex` komut üreteci (`src/core/export/ffmpegBuilder.ts`)
- [x] Canlı FFmpeg stdout/stderr ayrıştırma ve Tauri IPC olay akışı (`export-progress`)
- [x] Canlı ilerleme çubuğu (%0 -> %100 ve geçen zaman göstergesi)
- [x] Render tamamlandığında tek tıkla "Klasörde Göster (Open in Explorer)" butonu
- [x] Otomatik FFmpeg yolu bulucu (`C:\ffmpeg\bin\ffmpeg.exe`, `.\ffmpeg.exe` veya PATH)
- [x] Otomatik hedef klasör oluşturma desteği (`create_dir_all` - Rust backend)

---

## 🔮 Gelecek Fazlar & Geliştirme Fikirleri (Backlog)
- [ ] Metin / Altyazı katmanı ekleme (Text & Subtitle track)
- [ ] Video filtreleri (LUT, Parlaklık/Kontrast, Blur)
- [ ] Geçiş efektleri (Cross dissolve, Slide, Fade)
- [ ] Dalga formu (Audio Waveform) görselleştiricisi
