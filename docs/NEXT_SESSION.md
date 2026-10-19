# Sonraki Oturum Planı (NEXT_SESSION.md)

Son güncelleme: 2026-10-19. Dal: `feature`. Bu belge, bir sonraki oturumda nereden devam edileceğini anlatır. Genel görev takibi için `TODO.md`'ye bakın.

---

## 1. Şu anki durum

- `feature` dalında, **commit edilmemiş** çalışma ağacı var (madde 3–7 aşağıda). Son commit: `cde2c13` (Undo/Redo). Hiçbir şey push edilmedi.
- Testler: 132 birim testi geçiyor (`npm run test`), `npx tsc -b` ve `npm run build` temiz.
- Bu oturumda yapılanlar (hepsi tarayıcıda gerçek fare/klavye ile denendi, export ayrıca gerçek ffmpeg ile):
  - **Preview tutamaçları:** köşelerden ölçekleme, yuvarlak tutamaçla döndürme (Shift = 15°), tutamaçlar tuval içinde kalır. `src/core/preview/handleMath.ts`, `previewEngine.getSelectionGeometry/hitHandle`
  - **Rotation keyframe + export:** `AnimatableProp`'a `rotation` eklendi. Export `pushVisualLayer` ile yeniden düzenlendi (video ve metin aynı hat). Animasyonlu/döndürülmüş metin saydam katman üzerinde çiziliyor.
  - **Keyframe düzenleme:** timeline'da elmasları sürükle/seç/Delete, easing düğmesi (`KeyframeMarkers.tsx`, `KeyframeControls.tsx`)
  - **Proje kaydet/aç + otomatik kayıt:** `src/core/project/` (`projectFile`, `projectSession`, `projectIO`), `ProjectActions` ve `RecoveryBanner`
  - **Timeline:** film şeridi + dalga formu (`ClipVisuals`, `mediaCache`), çoklu seçim, kopyala/kes/yapıştır/çoğalt, ripple silme
- Önceki oturumdan: keyframe sistemi + hız, preview'da sürükleme, Undo/Redo, `npm run desktop`.

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

1. **Gerçek export'u ve yeni özellikleri Tauri içinde denemek (senin elle denemen gerekiyor).** `npm run desktop` ile aç. Özellikle: Export butonu + ilerleme olayı (`export-progress`) + "dosya konumunu aç", rotation/keyframe'li ve döndürülmüş metinli bir projenin export'u, Ctrl+S/Ctrl+O (WebView2'de `showSaveFilePicker` çalışıyor mu?), film şeridi/dalga formu (Tauri asset protokolünden `fetch`).
2. **Çoklu seçimi tamamlamak.** Şu an seçili kliplerin silinmesi, kopyalanması, çoğaltılması çalışıyor; birlikte sürükleme/kırpma yok (`Timeline.tsx` sürükleme kodu tek klip).
3. **Tauri yerel kaydet/aç diyalogları.** WebView2'de File System Access API çalışmazsa Rust tarafına (`rfd`) `save_project_dialog` / `open_project_dialog` komutları eklenmeli. Bu, C++ iş yükü kurulumunu gerektirir (bkz. Ortam notları).
4. **Hız eğrisi (ramp), ters oynatma, dondurma karesi.**
5. **Ses:** `fadeIn`/`fadeOut` modelde var, UI ve export'ta uygulanmıyor (doğrulanmadı); gürültü azaltma.

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
- **Metin export'u:** çok satırlı metin export'ta tek satıra çevriliyor (`escapeFFmpegText` `\n` -> boşluk); preview çok satır çiziyor.
- **Export'ta ffmpeg sürümü:** Tauri önce `C:\ffmpeg\bin\ffmpeg.exe` (9.0.2 essentials) kullanıyor, o çalışıyor. Proje köküne konulan `ffmpeg.exe` (2025-08 full build) `drawtext`'te fontconfig yokken segfault veriyor (`fontfile=` verilmezse). Export testi yaparken `C:\ffmpeg\bin` sürümünü kullanın.
- **Film şeridi** her video asset'i için 12 kare, tüm asset'e esnetilmiş tek şerit (kareler yatayda esnetilir); dalga formu 10 dakikadan uzun seslerde üretilmez.
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
