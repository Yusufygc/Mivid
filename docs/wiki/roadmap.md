# Yol Haritası ve Görev Listesi

Proje boyunca tamamlanan, devam eden ve planlanan geliştirme maddelerini takip eder. Sonraki oturumun ilk adımı: [[next-session]]. Kod/güvenlik bulguları: [[audit-report]]. Giriş: [[index]].

---

## 🚀 Faz 1: Temel Altyapı & Mimarinin Kurulması
- [x] Tauri v2 + React (TypeScript + Vite) iskeletinin oluşturulması
- [x] Tailwind CSS, PostCSS ve koyu tema renk paletinin yapılandırılması
- [x] Vitest test ortamının entegrasyonu (`vitest.config.ts`, `setupTests.ts`)
- [x] Dokümantasyon altyapısının kurulması; 2026-10-21'de `docs/wiki/` yapısına taşındı ([[rules]], [[architecture]], [[index]])
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

## 🎨 Faz 3: Modern Arayüz & Yüksek Performanslı Önizleme (Preview Engine)
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
- [x] Rotation keyframe + export: `rotate` filtresi (sabit kare çıkış, saydam köşeler), animasyonlu açı; döndürme + animasyonlu ölçek birlikte çalışır
- [x] Animasyonlu/döndürülmüş metin export'u: metin saydam bir katmana çizilir ve video klipleriyle aynı hattan geçer (konum, ölçek, döndürme, opaklık keyframe'leri)
- [x] Export: sola/sağa hizalı metin artık preview gibi tuval merkezine çapalanır (eskiden %10 kenar boşluğu kullanılıyordu)
- [x] Keyframe'i timeline'da sürükleyerek taşıma, tıklayınca seçme + playhead'i götürme, Delete ile silme; keyframe başına easing düğmesi (doğrusal / yumuşak)
- [x] Preview üzerinde seçili klibi (video veya metin) fareyle sürükleyerek konumlandırma: Inspector X/Y canlı güncellenir, canvas merkezine yapışır (Alt = serbest), keyframe varsa auto-key
- [x] Preview üzerinde köşe tutamaçlarıyla ölçekleme, üstteki yuvarlak tutamaçla döndürme (Shift = 15° adım); tutamaçlar tuval içinde kalır, keyframe'li özellikte auto-key
- [ ] Hız eğrisi (ramp), ters oynatma

---

## 💾 Faz 6: Proje Kaydet/Aç, Otomatik Kayıt ve Timeline Kalitesi
- [x] Proje dosyası (`.kurgu.json`, sürümlü): kaydet (Ctrl+S), farklı kaydet (Ctrl+Shift+S), aç (Ctrl+O). File System Access API, yoksa indirme/`input` yedeği (`src/core/project/`)
- [x] Otomatik kayıt (localStorage, 1.5 sn gecikmeli) ve açılışta "Geri Yükle / Yoksay" bandı; boş proje gerçek yedeğin üstüne yazılmaz
- [x] Açılan projede bulunamayan medya (blob olarak içe aktarılmış) uyarılır
- [x] Klip üzerinde film şeridi küçük resimleri (video) ve ses dalga formu (ses), kırpma ve hıza göre kesilir (`src/core/media/mediaCache.ts`)
- [x] Çoklu seçim (Ctrl/Shift + tık), kopyala/kes/yapıştır (Ctrl+C/X/V), çoğalt (Ctrl+D), ripple silme (Shift+Delete)
- [x] Ses fade in/out (Inspector slider'ları, preview ve export `afade`) ve gürültü azaltma (export `afftdn`, preview'da duyulmaz) (`src/core/audio/fades.ts`)
- [x] Renk ayarı: parlaklık / kontrast / doygunluk + hazır ayarlar (Canlı, Parlak, Sinematik, Soluk, Siyah-Beyaz). Preview canvas `filter`, export `eq`. Parlaklık preview'da çarpımsal, export'ta toplamsal olduğu için yaklaşık eşleşir (`src/core/color/colorGrading.ts`)
- [ ] Tauri'de yerel kaydet/aç diyalogları (WebView2'de File System Access API denenmedi; gerekirse Rust komutu)
- [ ] Timeline zoom'unu içeriğe sığdır, sürükle-bırak ile medya havuzundan yerleştirme iyileştirmeleri
- [x] Undo/Redo gerçekten bağlandı (`src/core/command/timelineHistory.ts`): timeline `tracks` değişimleri otomatik kaydedilir, sürükleme/slider düzenlemeleri tek adımda birleşir, Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z ve Header butonları çalışır

---

## 🌫️ Faz 7: Kolay Blur Sistemi ve Sığdırma
- [x] Bölge efektleri: blur, mozaik, siyah kutu; dikdörtgen/elips, güç, kenar yumuşatma. `effect` kanalında klip olarak durur (konum/ölçek keyframe'lenir)
- [x] Preview'da "Bölge" aracı: önizlemede dikdörtgen sürükleyerek efekt ekle; köşe tutamaçlarıyla bölgeyi yeniden boyutlandır
- [x] Medya havuzunda "Efektler" sekmesi, Inspector'da "Bölge Efekti" bölümü
- [x] Export: efekt hattı (`split` + tür filtresi + maske + `alphamerge` + `overlay`), yalnızca efektin süresi boyunca; gerçek ffmpeg ile doğrulandı
- [x] Sığdırma (Gerdir / Sığdır / Doldur): yeni klipler oranı korur, eski projeler değişmez
- [x] Bulanık arka plan dolgusu (dikey proje + yatay video gibi durumlar için), preview ve export
- [x] Export'ta resim klipleri için ses akışı istemeyi bıraktı
- [ ] Yüz/nesne takibi, efekt gücü keyframe'i, döndürülmüş bölge, ters mod (bölge hariç bulanıklaştır)
- [x] Resim / sticker klipleri: preview'da çizilir (şeffaf PNG dahil), export `-loop 1`, sığdırma, ölçek, döndürme, keyframe, renk ayarı çalışır; klibin varsayılan süresi 5 sn

---

## 🧩 Faz 8: Kompozisyon Araçları
- [x] Chroma key (yeşil perde): renk, benzerlik, kenar yumuşatma, damlalık (EyeDropper) ve yeşil/mavi hazır renkler. Preview yazılımla anahtarlar, export FFmpeg `chromakey`; formül FFmpeg ile aynı, gerçek ffmpeg çıktısıyla karşılaştırıldı (`src/core/chroma/`)
- [x] Dondurma karesi ("Dondur" düğmesi): playhead'deki kare, klibi böler ve araya 2 sn'lik bir kare klibi ekler, sonrası kayar. Preview'da video duraklı, export'ta `select` + `loop`
- [x] Çoklu seçilen kliplerin birlikte sürüklenmesi (çarpışma ve kilitli kanal korumalı, 0'ın altına inmez); sürükleme sonrası seçim korunur
- [x] Sessiz medya: ses akışı olmayan dosyalar export'ta ses istemiyor. Masaüstünde export öncesi `ffmpeg -i` çıktısından anlaşılır (`core/media/probe.ts`, yeni Rust komutu gerekmez)
- [x] Kanal üstünlüğü düzeltildi: timeline'da üstteki kanal artık önizlemede ve export'ta üstte çiziliyor (eskiden ters). Export artık `zIndex`'i de preview gibi dikkate alıyor
- [x] QA düzeltme turu (gerçek Reels kurgusu denendi): export artık metin yazı tipini gerçek dosyayla seçiyor (`core/export/fonts.ts`, `drawtext fontfile=`; Impact/kalın/italik doğru çıkıyor); yeni video klip ana video kanalına (V1) düşüyor; sabit yerleşim: dar pencerede başlık/panel sığıyor, timeline yüksekliği sürükleyerek ayarlanıyor (`mivid.timelineHeight`), `minWidth 960`/`minHeight 600`; önizlemede "Görüntü yükleniyor…" göstergesi; "Oto keyframe" (taşı/ölçekle/döndür = playhead'e keyframe, ilk keyframe başa eski değeri sabitler); başlıkta FPS seçici (24/25/30/50/60)
- [x] Güvenlik (denetim Bulgu 1-2): CSP açıldı, asset kapsamı `[]` + kalıcı dinamik izin listesi, export çıktısı Rust kayıt diyaloğundan, `run_ffmpeg_export` argüman doğrulayıcısı (`export_guard.rs`), `probe_media` komutu, native proje aç diyaloğu. Rust kısmı VS C++ iş yükü kurulunca `cargo test` ve masaüstünde elle doğrulanacak
- [ ] Karışım modları (multiply, screen, overlay): preview'da kolay, FFmpeg `blend` filtresi şeffaf katmanı ve alfa'yı doğru karıştırmadığı için preview ile export eşleşmiyor; ayrı tasarım gerekir
- [ ] Çoklu seçimde birlikte kırpma

---

## ✨ Faz 10: Geçişler ve Efektler (yeni)
- [x] Geçişler: 8 tür (+ iris, zoom, flaş, bulanık), süre kaydırıcısı (0,2-3 sn), yön (slide/wipe, gerçek silme), eğri (doğrusal/yumuşak), süre değişince bindirme ve ripple, çıkışta aynı tür tekrar eklenince çift kayma düzeltildi
- [x] Efektler: renk tonu, keskinleştir, vinyet; **ters mod** (bölge dışı), **tüm kare**, **güç animasyonu** (başlangıç → bitiş, 0,2 sn dilimler); bölme kesimde animasyonu sürekli tutar
- [x] Bölme: giriş geçişi sol yarıda, çıkış geçişi sağ yarıda kalır (kesim geçiş sayılmaz)
- [x] Gerçek FFmpeg parite testleri (opt-in) ve preview/export tarayıcı karşılaştırması ([[qa-playbook]])
- [ ] Yumuşak kenarlı wipe, gerçek "siyaha dalma", slide/wipe'te arka plan, efekt gücü için tam keyframe, vinyet bölgesi

## 🛡️ Faz 9: Denetim Düzeltmeleri ([[audit-report]])
- [x] Bulgu 1-2: export komutu doğrulaması, CSP, dinamik asset izin listesi ([[desktop-security]]). **Rust derlenmedi, `cargo test` ve masaüstü denemesi bekliyor**
- [x] Bulgu 18 (kısmen): `Co-Authored-By` satırları commit geçmişinden silindi; wiki ve `CLAUDE.md` iskeleti kuruldu
- [ ] Bulgu 3: FFmpeg'i sidecar olarak paketle, göreli yolları kaldır
- [ ] Bulgu 4: export iptali, `spawn_blocking`, stdout okunması
- [ ] Bulgu 5: `parseProjectFile` aralık doğrulaması
- [ ] Bulgu 6-7: `useTimelineStore` slice'lara, `previewEngine` parçalara bölünmesi
- [ ] Bulgu 8: UI testleri, Rust testleri, coverage
- [ ] Bulgu 9: CI, `identifier`, sürüm tek kaynak
- [ ] Bulgu 10-17: sessiz varsayılanlar, nesne URL sızıntısı, `probe` temizliği, Logger dosyası, `pushVisualLayer` bölünmesi, platform yolları, hook uyarıları

---

## 🔮 Aday Özellikler (Backlog)
- [ ] LUT desteği (`lut3d`; renk ayarı şimdilik parlaklık/kontrast/doygunluk)
- [ ] Hız eğrisi (ramp), ters oynatma
- [ ] Sessizlik silici (`silencedetect` + ripple), SRT içe/dışa aktarma, ses ducking + `loudnorm`
- [ ] Stil kopyala/yapıştır, timeline marker'ları, hedef dosya boyutlu export
- [ ] Blur devamı: yüz/nesne takibi, efekt gücü keyframe'i, döndürülmüş bölge, "bölge hariç bulanıklaştır", statik bölgede `crop+gblur` hızlı yol
- [ ] Otomatik altyazı (yerel whisper.cpp), TTS (Windows SAPI)
- [ ] Ağır: arka plan silme, sahne algılama (`scdet`), stabilizasyon (`vidstab`), akıcı yavaş çekim (`minterpolate`)
