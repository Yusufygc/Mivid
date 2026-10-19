# Sonraki Oturum Planı (NEXT_SESSION.md)

Son güncelleme: 2026-10-19. Dal: `feature`. Bu belge, bir sonraki oturumda nereden devam edileceğini anlatır. Genel görev takibi için `TODO.md`'ye bakın.

---

## 1. Şu anki durum

- `feature` dalı. Commit'ler: `6f2a263` (tutamaçlar, rotation, proje kaydet/aç, timeline), `d86218d` (ses fade, renk), `ea73c95` (blur sistemi). **Bu oturumun son işleri henüz commit edilmedi** (aşağıda). Hiçbir şey push edilmedi.
- Testler: 250 birim testi geçiyor (`npm run test`), `npx tsc -b` ve `npm run build` temiz.
- **Ürün adı Mivid** (arayüz başlığı, `index.html`, `tauri.conf.json`, README/docs, `package.json`). `tauri.conf.json` derleme zamanında gömüldüğü için eski `app.exe`'nin pencere başlığı yeniden derlenene kadar "CapCut Clone" kalır; `npm run desktop` ikisini de tanır.
- **Karar:** bu projede REA / CapCut incelemesi yok; özgün, işi kolaylaştıran özellikler yapılıyor (hafızada kayıtlı).
- **Commit bekleyen işler** (hepsi tarayıcıda gerçek fare/klavye ile, export ayrıca gerçek ffmpeg ile denendi):
  - **Resim / sticker:** `previewEngine.getOrCreateImageElement`, export `-loop 1`, klipte döşeme küçük resmi
  - **Chroma key:** `core/chroma/chromaKey.ts` (FFmpeg formülü), `core/preview/chromaRenderer.ts`, Inspector bölümü
  - **Dondurma karesi:** `Clip.freeze`, `insertFreezeFrame`, Timeline "Dondur" düğmesi
  - **Çoklu klip sürükleme:** `moveClipsBy`
  - **Sessiz medya:** `core/media/probe.ts`, `MediaAsset.hasAudio`, `ExportModal` export öncesi probe
  - **Kanal üstünlüğü düzeltmesi:** `TimelineEngine.getActiveClipsAtTime` ve export `layers` (üst kanal üstte, `zIndex` önce)
  - **QA düzeltme turu:** metin export'unda gerçek yazı tipi dosyası (`fonts.ts`), yeni klip V1'e, yeniden boyutlanır timeline ve dar pencere düzeni, önizleme yükleme göstergesi, Oto keyframe, FPS seçici. Gerçek Reels kaynaklarıyla yeniden denendi: başlık Impact kalın çıktı, bölge blur keyframe ile LCD'yi takip etti, 60 fps export 36.8 sn.
- **Yapılmayanlar:** karışım modları (FFmpeg `blend` alfa'yı doğru karıştırmadığı için preview/export eşleşmiyor), çoklu seçimde birlikte kırpma.

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

1. **Gerçek export'u ve yeni özellikleri Tauri içinde denemek (senin elle denemen gerekiyor).** `npm run desktop` ile aç. Özellikle: Export butonu + ilerleme olayı (`export-progress`) + "dosya konumunu aç", rotation/keyframe'li ve döndürülmüş metinli bir projenin export'u, Ctrl+S/Ctrl+O (WebView2'de `showSaveFilePicker` çalışıyor mu?), film şeridi/dalga formu (Tauri asset protokolünden `fetch`), **chroma key önizlemesi** (asset protokolünden gelen video canvas'ı kirletirse `getImageData` hata verir; kod bunu yakalayıp anahtarsız çizer, yani önizlemede perde silinmez ama export çalışır), **sessiz medya probe'u** (export öncesi `ffmpeg -i` çıktısı), resim/sticker ve dondurma karesi export'u.
2. **Çoklu seçimi tamamlamak.** Şu an seçili kliplerin silinmesi, kopyalanması, çoğaltılması çalışıyor; birlikte sürükleme/kırpma yok (`Timeline.tsx` sürükleme kodu tek klip).
3. **Tauri yerel kaydet/aç diyalogları.** WebView2'de File System Access API çalışmazsa Rust tarafına (`rfd`) `save_project_dialog` / `open_project_dialog` komutları eklenmeli. Bu, C++ iş yükü kurulumunu gerektirir (bkz. Ortam notları).
4. **Hız eğrisi (ramp), ters oynatma, dondurma karesi.**
5. **Ses:** `fadeIn`/`fadeOut` modelde var, UI ve export'ta uygulanmıyor (doğrulanmadı); gürültü azaltma.

6. **Blur sistemi devamı:** yüz/nesne takibi (şimdilik elle keyframe), efekt gücünü keyframe'lemek, döndürülmüş bölge, çoklu bölgeyi tek tuşla (aynı efekti kopyala), "bölge hariç her yeri bulanıklaştır" (ters mod), statik bölgede `crop+gblur` hızlı export yolu.
7. **Sonraki özgün özellik adayları:** sessizlik silici (`silencedetect` + ripple), SRT içe/dışa aktarma, ses ducking + `loudnorm`, stil kopyala/yapıştır, timeline marker'ları, hedef dosya boyutlu export.

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

- ~~Yeni video klip Overlay kanalına düşüyor~~ düzeltildi: ana video kanalı önce denenir.
- **`videoPool` asset başına tek `<video>`:** aynı asset'in iki klibi aynı anda aktifse (örn. üst üste iki kopya) aynı elemanı paylaşır ve çakışır.
- Klip `fit` (Gerdir/Sığdır/Doldur) var; yalnızca eski projelerdeki klipler gerdirilmiş kalır.
- **Sol kırpma + keyframe:** sol tutamacı içeri sürükleyince kırpılan bölgedeki keyframe'ler kaybolur; geri sürükleyince eğri orijinaline dönmez (sınır keyframe'inin değeri tutulur).
- **Metin export'u:** çok satırlı metin export'ta tek satıra çevriliyor (`escapeFFmpegText` `\n` -> boşluk); preview çok satır çiziyor.
- **Export'ta ffmpeg sürümü:** Tauri önce `C:\ffmpeg\bin\ffmpeg.exe` (9.0.2 essentials) kullanıyor, o çalışıyor. Proje köküne konulan `ffmpeg.exe` (2025-08 full build) `drawtext`'te fontconfig yokken segfault veriyor (`fontfile=` verilmezse); artık export `fontfile=` veriyor. Export testi yaparken `C:\ffmpeg\bin` sürümünü kullanın.
- **Film şeridi** her video asset'i için 12 kare, tüm asset'e esnetilmiş tek şerit (kareler yatayda esnetilir); dalga formu 10 dakikadan uzun seslerde üretilmez.
- **Blur paritesi:** kenar yumuşatma preview'da bulanık maske, export'ta aynı sigma ile `gblur`'lu şekil; ikisi de gaussian ama piksel düzeyinde birebir değil. Preview'da blur canvas kenarında saydama doğru solar, export'ta kenar kopyalanır (sadece tuval kenarındaki bölgelerde fark).
- **Bulanık arka plan export'ta** klip opaklığını sabit değerle alır (opaklık keyframe'i arka plana uygulanmaz) ve slide/wipe geçişinde arka plan kaymaz.
- **Resim klipleri hiç çizilmiyor:** preview resim için `<video>` elemanı kullanıyor (çalışmaz), export `-loop 1` vermiyor. Sadece sesi yok sayma düzeltildi. `fit` ve renk ayarı video içindir; resim desteği ayrı iş.
- **Chroma key önizlemesi** 960 px genişliğe indirilmiş yazılım işlemesi (kare başı ~10 ms); çok yüksek çözünürlükte hafif yumuşak görünür. Anahtar rengi birebir FFmpeg formülüyle hesaplanır, ama FFmpeg 3x3 komşuluk ortalaması ve gerçek YUV matrisini kullandığı için kenarlarda ~0.1 alfa farkı olabilir. Bulanık arka plan chroma key'den önceki kaynağı kullanır (anahtarsız).
- **Dondurma karesi** klip uzunluğu 2 sn sabit başlar; süresi sağ kenardan kırpılarak değiştirilir. Kare, 30 fps'te dahi yarım saniyelik pencerede ilk kare seçilerek alınır (çok seyrek anahtar kareli dosyada birkaç kare kayabilir).
- **Sessiz medya probe'u** yalnızca masaüstünde çalışır (`run_ffmpeg_export` komutunu bilerek hata verdirip stderr'i okur). Web modunda `hasAudio` bilinmez ve ses var sayılır.
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

- **Yeni QA notu:** yeniden boyutlanır timeline ve `minWidth/minHeight` Tauri'de elle denenmedi (`tauri.conf.json` derleme gerektirir). Yükleme göstergesi yalnızca birim testli; gerçek yavaş diskte gözle görülmedi. Renk ön ayarı + ölçek keyframe + çapraz geçiş yeniden denendi: export 55 sn, 60 fps; zoom 1.285x kaynakla PSNR 34.9 dB eşleşti, geçiş 19-20 sn arasında karışıyor.
