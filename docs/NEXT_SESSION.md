# Sonraki Oturum Planı (NEXT_SESSION.md)

Son güncelleme: 2026-10-18. Dal: `feature`. Bu belge, bir sonraki oturumda nereden devam edileceğini anlatır. Genel görev takibi için `TODO.md`'ye bakın.

---

## 1. Şu anki durum

- `feature` dalının son commit'leri:
  - `5dccaf5` Rust derlemeden masaüstü başlatıcı (`npm run desktop`) ve pencere ortalama
  - `ba9245d` Preview üzerinde seçili klibi (video/metin) fareyle konumlandırma
  - `f2f8c00` Keyframe animasyonu (konum, ölçek, opaklık) ve klip hızı (0.25x–4x)
- Çalışma ağacı temiz (bu belge hariç). Hiçbir şey push edilmedi.
- Testler: 77 birim testi geçiyor (`npm run test`), `npx tsc -b` ve `npm run build` temiz.
- Tamamlanan son özellikler:
  - Keyframe sistemi: `src/core/animation/keyframes.ts`, Inspector ◇/◀/▶ kontrolleri, Timeline keyframe elmasları, preview ve export desteği
  - Klip hızı: Inspector hız bölümü, ripple, export'ta `setpts` + `atempo` zinciri
  - Preview'da fareyle sürükleme: `previewEngine.hitTest`, seçili klip çerçevesi, merkez yapışma (Alt = serbest), Inspector X/Y canlı güncellenir

## 2. Ortam notları

- **Masaüstü uygulamasını açmak:** `npm run desktop`. vite'ı başlatır, `src-tauri/target/debug/app.exe`'yi açar, pencereyi birincil monitöre ortalar. Pencere önceden bağlı olmayan/sanal bir ekranda (-2722,-303) açılıp kayboluyordu.
- **`npm run tauri dev` çalışmıyor:** Rust 1.99.1 kuruldu (`%USERPROFILE%\.cargo\bin`, PATH'e yeni shell'de eklenir), ama Visual Studio 2026 Community'de "C++ ile masaüstü geliştirme" iş yükü ve Windows SDK yok; derleme `link.exe` bulunamadığı için düşüyor.
  - Bu yalnızca Rust tarafı için gerekli: `src-tauri/src/lib.rs` (`select_media_files`, `run_ffmpeg_export`, `open_file_location`), `Cargo.toml`, `tauri.conf.json`, capabilities, ikonlar veya `npm run tauri build`.
  - Frontend işleri için gerekmez.
  - Gerekirse VS Installer ile `Microsoft.VisualStudio.Workload.NativeDesktop` kurulur (~3–7 GB, UAC onayı).
- `tauri.conf.json`'daki `"center": true` henüz derlenmedi, çalıştığı doğrulanmadı.
- Tarayıcıda hızlı QA: `npm run dev`, ardından `http://localhost:5173`. Medya içe aktarma için gizli `input[type=file]` kullanılabilir (Tauri dosya seçicisi tarayıcıda yok).
- Test videosu: ffmpeg ile `testsrc` + `sine` üretilebilir. FFmpeg yolu: `C:\ffmpeg\bin\ffmpeg.exe` ve proje kökündeki `ffmpeg.exe`.

## 3. Öncelikli işler (önerilen sıra)

1. **Gerçek export'u Tauri içinde denemek.** Export komutu headless ffmpeg ile doğrulandı (hız 2x, animasyonlu konum/ölçek/opaklık, süre 3.00s, sesli), ama uygulama içindeki Export butonu, ilerleme olayı (`export-progress`) ve "dosya konumunu aç" yeni değişikliklerle denenmedi. `npm run desktop` ile deneyin.
2. ~~**Undo / Redo'yu gerçekten bağlamak.**~~ Yapıldı: `src/core/command/timelineHistory.ts`. Timeline `tracks` değişimlerini store aboneliğiyle kaydeder (aynı kliplerde 800 ms içindeki düzenlemeler tek adım). Kapsam dışı kalanlar: asset ekleme/silme, proje ayarları (en-boy oranı, ad), seçim ve playhead; bunlar geri alınmaz.
3. **Preview'da köşe tutamaçlarıyla ölçekleme ve döndürme.** Şu an yalnızca konum sürükleniyor. Tutamaçlar `updateClipTransform` ile gitmeli (auto-key zaten çalışır). `hitTest` dönüşü ve ölçeği zaten dikkate alıyor.
4. **Rotation keyframe + export.** Preview rotation'ı uyguluyor, export (FFmpeg) hiç uygulamıyor. `AnimatableProp`'a `rotation` eklenmeli, export'ta `rotate` filtresi (`ow`/`oh` sabit boyut, alfa için `fillcolor=none`) yazılmalı.
5. **Keyframe düzenleme iyileştirmeleri.** Timeline'da elmasları sürükleyerek taşıma, keyframe başına easing seçici (modelde `linear`/`ease-in-out` var, UI yok, `setKeyframeEasing` store'da hazır), seçili keyframe'i silme kısayolu.
6. **Proje kaydet/yükle + otomatik kaydetme.** Şu an hiçbir kalıcılık yok. JSON proje dosyası (tracks, assets yolları, project ayarları). Asset yolları için Tauri tarafında dosya okuma/yazma gerekebilir.
7. **Timeline kalitesi.** Ses dalga formu (waveform), klip küçük resimleri, çoklu seçim, kopyala/yapıştır, ripple delete.

## 4. Sonraki kademe (CapCut incelemesinden)

CapCut 9.6.0.4097 kurulum klasörü (`C:\Users\yusuf\AppData\Local\CapCut\Apps\9.6.0.4097`) yalnızca klasör, model ve DLL adlarıyla envanterlendi; decompile yapılmadı. Çıkarım olarak şu özellikler var: renk (`Curves`, `PrimaryWheel`, `lut`), karışım modları (`MixMode`), chroma key (`Chroma`), arka plan silme ve takip (`matting*`, `Tracking.dll`), kare ara değerleme (`interpolation`), ses gürültü azaltma (`rnnoise`), TTS, otomatik altyazı. CapCut'ın model, LUT ve şablon dosyalarını kopyalamayın (lisans). Açık kaynak alternatif kullanın.

- Renk ayarı (`eq`) ve LUT (`lut3d`); preview'da canvas filter
- Karışım modları (`blend` / `globalCompositeOperation`)
- Chroma key (`chromakey`), maske şekilleri
- Resim ve sticker katmanı
- Ses: fade in/out UI (modelde `fadeIn`/`fadeOut` var, export'ta uygulanıp uygulanmadığı doğrulanmadı), gürültü azaltma (`arnndn`/`afftdn`)
- Otomatik altyazı: yerel whisper.cpp; TTS: Windows SAPI
- Hız eğrisi (ramp), ters oynatma, dondurma karesi
- AI (ağır): arka plan silme (açık model, onnxruntime), sahne algılama (`scdet`), stabilizasyon (vidstab), akıcı yavaş çekim (`minterpolate`)

## 5. Bilinen sorunlar ve sınırlamalar

- **Yeni video klip varsayılan olarak "Video 2 (Overlay)" kanalına düşüyor**, "Ana Video (V1)" yerine. `TimelineEngine.findOrCreateTrackForPlacement` kanalları sırayla gezip ilk boş olanı seçiyor. Beklenen davranış olup olmadığı netleştirilmeli.
- **`videoPool` asset başına tek `<video>`:** aynı asset'in iki klibi aynı anda aktifse (örn. üst üste iki kopya) aynı elemanı paylaşır ve çakışır.
- **Preview ve export videoyu tüm kareye gerdiriyor** (en-boy oranı korunmuyor, `drawImage(video, -W/2, -H/2, W, H)`). Aspect-fit seçeneği yok.
- **Sol kırpma + keyframe:** sol tutamacı içeri sürükleyince kırpılan bölgedeki keyframe'ler kaybolur; geri sürükleyince eğri orijinaline dönmez (sınır keyframe'inin değeri tutulur).
- **Slide/wipe geçiş + keyframe x:** giriş ve çıkış ofsetleri artık toplanıyor (eskiden çıkış girişi eziyordu); bu davranış değişikliği ayrıca test edilmedi.
- **Animasyonlu opaklık export'u `geq` ile** (4K veya uzun kliplerde yavaş olabilir); 1080p, 3 sn için 1.7 sn sürdü. Çok uzun projelerde ölçüm yapılmalı.
- **Resim klipleri export'ta** `-loop` almıyor, süre boyunca görünmeyebilir (eski sorun, doğrulanmadı).
- Timeline sürükleme/trim işlemleri `updateClipTiming` üzerinden mutlak değerlerle gidiyor; hız ≠ 1 iken kaynak aralığı (`outPoint - inPoint = duration * speed`) korunuyor, yeni kod buna güveniyor.
- `npm run lint` mevcut 3 uyarı veriyor (`PreviewPlayer` ve `Timeline` `exhaustive-deps`, `ExportModal` `set-state-in-effect`); yeni uyarı eklenmedi.

## 6. Mimari hatırlatmaları

- Keyframe zamanı **klip-yerel saniye** (klibin başından), kaynak hızından bağımsız; hız değişince `scaleKeyframeTimes` ile ölçeklenir.
- Easing formülü TS ve FFmpeg'de aynı olmalı: `p*p*(3-2*p)` (`applyEasing` ↔ `buildKeyframeExpr`).
- Preview'da transform'u her zaman `resolveTransform(clip, currentTime - clip.startTime)` ile okuyun; `clip.transform`'u doğrudan okumayın.
- Keyframe'li bir özellik `updateClipTransform` ile düzenlenirse playhead'e keyframe yazılır (auto-key); keyframe'siz özellik statik güncellenir.
- Export'ta kaynak süresi `duration * speed`; `outPoint`'e güvenilmez (eski Inspector "Sıfırla" bunu bozuyordu, düzeltildi).
