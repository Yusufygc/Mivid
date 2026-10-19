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
  - [x] `useTimelineStore`: Çok kanallı izler, klip ekleme/taşıma/kesme/kırpma/silme, dinamik süre senkronizasyonu
  - [x] `useProjectStore`: Çözünürlük, en-boy oranı, FPS, proje ayarları
- [x] Timeline Matematiksel & Mantıksal Motoru (`src/core/timeline/timelineEngine.ts`):
  - [x] **Tam Manyetik Yapışma Motoru (Full Magnetic Snapping):** Oynatma kafasını (kırmızı çubuk), klip taşımayı ve sol/sağ kırpmayı nesne sınırlarına ve oynatma kafasına milimetrik mıknatıslama
  - [x] **Çakışma Önleme (Collision Prevention):** Kliplerin aynı kanalda üst üste binmesinin engellenmesi
  - [x] **Akıllı Katmanlama (Smart Track Stacking):** Eş zamanlı birden fazla metin/video/ses eklendiğinde otomatik `T2`, `V2`, `A2` oluşturulması
  - [x] Klip bölme (Split at playhead)
  - [x] Klip kırpma (Trim in/out)
  - [x] Klipleri sürükleyip sıralama & manyetik yapışma (Snapping)
- [x] Undo / Redo Komut Yöneticisi (`src/core/command/commandManager.ts`)
- [x] Zaman ve Kare Yardımcıları (`src/utils/time.ts` ve `time.test.ts`)
- [x] Timeline Motoru Birim Testlerinin yazılması (`src/core/timeline/timelineEngine.test.ts` - 19 test)

---

## 🎨 Faz 3: CapCut Tarzı Modern Arayüz & Yüksek Performanslı Önizleme (Preview Engine)
- [x] **Header Bar (`src/components/header/Header.tsx`):**
  - [x] Proje adı düzenleme
  - [x] Undo / Redo butonları
  - [x] En-boy oranı (16:9, 9:16, 1:1, 4:3, 21:9)
  - [x] Export (Dışa Aktar) butonu
- [x] **Medya & Metin Paneli (`src/components/media-pool/MediaPool.tsx`):**
  - [x] Sekmeli görünüm: Medyalar ve Metinler & Başlık Şablonları
  - [x] Hazır şablonlar (Varsayılan, Sinematik, Kutulu Altyazı, Neon Glow, Sosyal Etiket)
  - [x] Windows yerel dosya seçici entegrasyonu (rfd / Tauri IPC ile tam dosya yolu alma)
- [x] **Çok Kanallı Zaman Çizelgesi (`src/components/timeline/Timeline.tsx`):**
  - [x] **Aktif Mıknatıs (Manyetik Açık/Kapalı Butonu):** Oynatma kafası ve klipler için 14px manyetik çekim yarıçapı
  - [x] **Kusursuz Dikey Kaydırma (Synchronized Vertical Scrolling):** Sınırsız kanal eklendiğinde tüm kanallara fare tekerleğiyle kaydırarak erişebilme
  - [x] **Sabit Zaman Cetveli (Sticky Ruler):** Aşağı kaydırıldığında zaman cetvelinin daima üstte sabit kalması
  - [x] Metin kanalı (T1 - Text Track), Video (V1), Overlay/PiP (V2) ve Ses (A1) kanalları
  - [x] Tek tıkla `+ Metin Ekle` butonu
  - [x] Sürükle-bırak klip yerleşimi ve Sol/Sağ kırpma tutamaçları (Trim handles)
  - [x] Bölme (Split) aracı & Kısayollar (`Ctrl+B`, `Delete`, `Space`, Ok tuşları)
- [x] **Gerçek Zamanlı 60 FPS Önizleme Oynatıcısı (`src/core/preview/previewEngine.ts`):**
  - [x] **Master Donanım Saati & DOM-Attached Video Pipeline:** Oynatılan videonun kendi GPU saatine kilitli, ardışık kliplerin sıfır kaymayla 0.00s'den başlayan kesin senkronizasyonu
  - [x] Canvas 2D dinamik metin, stroke, shadow ve arka plan kutusu çizimi
  - [x] Videoların ve harici seslerin eş zamanlı, net ve yüksek kaliteli ses çıkışı
- [x] **Özellikler Paneli (`src/components/inspector/`):**
  - [x] **Video İçi Başlangıç (In-Point) Göstergesi & Sıfırla Butonu:** Kırpılmış videoları anında orijinal 0.00s başına döndürebilme
  - [x] Canlı `TextInspector`: Metin düzenleme, Yazı tipi seçimi, Boyut, Renk, Hizalama, Kalınlık/İtalik, Kenarlık (Stroke), Arka plan kutusu ve Gölge (Shadow)
  - [x] Klip X, Y konumu, Ölçek (Scale), Opaklık (Opacity), Döndürme (Rotation)

---

## ⚡ Faz 4: FFmpeg Entegrasyonu & Canlı İlerlemeli Video Dışa Aktarma (Export)
- [x] FFmpeg `drawtext` filtresi ile metinlerin tam senkron videoya basılması (`src/core/export/ffmpegBuilder.ts`)
- [x] **FFmpeg `setpts` Zaman Damgası Senkronizasyonu:** Çoklu video kanallarında (V1, V2 vb.) `overlay` edilirken, ikinci videoların donmaması ve ortadan başlamaması için `setpts=PTS-STARTPTS+startTime/TB` zaman kaydırma mimarisinin eklenmesi.
- [x] Dinamik render süresi (video ne kadar uzunsa tam o kadar render alır; fazladan siyah ekran süresi basılmaz)
- [x] Canlı FFmpeg stdout/stderr ayrıştırma ve Tauri IPC olay akışı (`export-progress`)
- [x] Windows Explorer `/select,` ile üretilen MP4 dosyasını doğrudan seçili açma
- [x] Otomatik FFmpeg yolu bulucu (`C:\ffmpeg\bin\ffmpeg.exe`, `.\ffmpeg.exe` veya PATH)

---

## 🎞️ Faz 5: Keyframe Animasyonu & Klip Hızı
- [x] **Keyframe sistemi** (`src/core/animation/keyframes.ts`): Konum X/Y, Ölçek ve Opaklık için klip-yerel zamanlı keyframe'ler, `linear` ve `ease-in-out` (smoothstep) easing
- [x] Auto-key: keyframe'li bir özellik Inspector'dan düzenlenince playhead'e keyframe yazılır
- [x] Klip bölünce keyframe eğrisi iki yarıda sürekli kalır; sol kırpmada keyframe'ler içeriğe sabit kalır
- [x] Inspector: ◇ keyframe ekle/sil, ◀ ▶ önceki/sonraki keyframe; Timeline'da seçili klipte keyframe elmasları
- [x] **Klip hızı** 0.25x–4x (Inspector slider + hazır değerler), hız değişince süre ve sonraki klipler (ripple) güncellenir
- [x] Export: hız (`setpts` + `atempo` zinciri), animasyonlu konum (`overlay` ifadesi), ölçek (`scale eval=frame`) ve opaklık (`geq`)
- [x] Export konum hatası düzeltildi: ölçeği 1 olmayan klip artık preview gibi merkezden konumlanır
- [x] Timeline kırpma tutamaçları `speed` çarpanını dikkate alır
- [ ] Rotation keyframe + export (`rotate` filtresi)
- [ ] Keyframe'i timeline'da sürükleyerek taşıma, keyframe başına easing seçici UI
- [x] Preview üzerinde seçili klibi (video veya metin) fareyle sürükleyerek konumlandırma: Inspector X/Y canlı güncellenir, canvas merkezine yapışır (Alt = serbest), keyframe varsa auto-key
- [ ] Preview üzerinde köşe tutamaçlarıyla ölçekleme ve döndürme
- [ ] Hız eğrisi (ramp), ters oynatma
- [x] Undo/Redo gerçekten bağlandı (`src/core/command/timelineHistory.ts`): timeline `tracks` değişimleri otomatik kaydedilir, sürükleme/slider düzenlemeleri tek adımda birleşir, Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z ve Header butonları çalışır

---

## 🔮 Gelecek Fazlar & Geliştirme Fikirleri (Backlog)
- [ ] Video filtreleri ve Renk Ayarları (LUT, Parlaklık/Kontrast/Doygunluk)
- [ ] Geçiş efektleri (Cross dissolve, Slide, Fade - `xfade`)
- [ ] Ses Dalga Formu (Audio Waveform) görselleştiricisi
