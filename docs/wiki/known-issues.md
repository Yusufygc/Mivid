# Bilinen Sorunlar ve Sınırlamalar

Davranışsal sınırlar ve bilinen farklar. Kod kalitesi ve güvenlik bulguları ayrı: [[audit-report]]. Plan: [[next-session]], [[roadmap]].

## Önizleme ve export

- **`videoPool` asset başına tek `<video>`:** aynı asset'in iki klibi aynı anda aktifse (üst üste iki kopya) aynı eleman paylaşılır ve çakışır ([[preview-engine]]).
- **Sol kırpma + keyframe:** sol tutamacı içeri sürükleyince kırpılan bölgedeki keyframe'ler kaybolur; geri sürükleyince eğri orijinaline dönmez (sınır keyframe'inin değeri tutulur).
- **Çok satırlı metin:** export'ta tek satıra çevrilir (`escapeFFmpegText` `\n` → boşluk); önizleme çok satır çizer ([[export-pipeline]]).
- **Blur paritesi:** kenar yumuşatma önizlemede bulanık maske, export'ta aynı sigmalı `gblur`'lu şekil; piksel düzeyinde birebir değil. Önizlemede blur canvas kenarında saydama solar, export'ta kenar kopyalanır (yalnızca tuval kenarındaki bölgelerde fark).
- **Bulanık arka plan export'ta** klip opaklığını sabit değerle alır (opaklık keyframe'i arka plana uygulanmaz) ve slide/wipe geçişinde arka plan kaymaz. Chroma key'den önceki (anahtarsız) kaynağı kullanır.
- **Chroma key önizlemesi:** 960 px'e indirilmiş yazılım işlemesi; kenarlarda yaklaşık 0,1 alfa farkı olabilir. Masaüstünde medya elemanları `crossOrigin='anonymous'` ile açıldığı için canvas kirlenmiyor; yine de kirlenirse önizleme anahtarsız çizer, export çalışır. Chroma'nın masaüstünde gerçek yeşil perdeyle denenmesi bekliyor.
- **Dondurma karesi:** klip uzunluğu 2 sn başlar, sağ kenardan kırpılarak değişir. Kare, yarım saniyelik pencerede ilk kare seçilerek alınır (çok seyrek anahtar kareli dosyada birkaç kare kayabilir).
- **Slide/wipe geçiş + keyframe x:** giriş ve çıkış ofsetleri toplanıyor; bu davranış ayrıca test edilmedi.
- **Animasyonlu opaklık ve bölge maskesi `geq` ile:** 1080p, 3 sn için yaklaşık 1,7 sn; 4K ve uzun kliplerde ölçülmedi.
- **Karışım modları yok:** FFmpeg `blend` şeffaf katmanı ve alfa'yı doğru karıştırmadığı için önizleme/export eşleşmiyor.
- **Önizleme `denoise` göstermez** (yalnızca export'ta `afftdn`).

## Geçişler ve efektler

- **Bulanık arka plan** slide, wipe ve iris geçişlerinde klibi izlemez (maskelenmez / kaymaz); dissolve, kararma, zoom ve blur'da doğrusal solar.
- **Blur geçişi** sabit sigma kullanır (kare yüksekliğinin %2,5'i): FFmpeg `gblur` kare başına sigma değiştiremez. Önizleme de aynı sabiti kullanır.
- **Efekt gücü animasyonu** sürekli eğri değil, 0,2 sn'lik sabit dilimlerdir (en çok 16 dilim); önizleme aynı dilimleri oynar. Tam keyframe (`clip.keyframes` üzerinden) yok.
- **Yumuşak kenarlı wipe yok**: sert kenar. Wipe/iris maskesi katman koordinatındadır (döndürülmüş klipte maske de döner).
- **`fade-to-black`** doğrusal dissolve ile aynıdır (alfa solması): komşu klip bindirmesi altında kararmaya değil çapraz geçişe benzer. Gerçek "siyaha dalma" için ayrı iş.
- **Sharpen** önizlemede SVG filtre, export'ta RGB `convolution`: aynı çekirdek, kenar piksellerinde birkaç seviye fark.
- **Vinyet** yalnızca tüm kare; bölge desteği yok. **Önizlemede ters/tüm kare** efektin tutamaçları gizlidir (tüm kare efektte bölge yok).
- **Geçişte arkadaki klipler kayar** (ripple); aralarında boşluk olan klipler kaymaz. İkinci kanaldaki klipler etkilenmez.

## Medya

- **Film şeridi:** her video için 12 kare, tüm asset'e esnetilmiş tek şerit; **dalga formu** 10 dakikadan uzun seslerde üretilmez (`MAX_WAVEFORM_SECONDS`).
- **Sessiz medya probe'u** yalnızca masaüstünde çalışır (`probe_media`); web modunda `hasAudio` bilinmez ve ses var sayılır.
- **Metadata okunamazsa** içe aktarma sessizce 10 sn ve 1920x1080 varsayar ([[audit-report]] Bulgu 10).
- **Blob olarak içe aktarılan medya** (tarayıcı modu) kaydedilen projede açılışta bulunamaz.

## Masaüstü (WebView2)

- **Proje kaydetme** WebView2'nin File System Access seçicisiyle olur: `AppData`, `Windows` gibi sistem klasörlerine ve bazı korumalı yerlere "bu klasör sistem dosyaları içeriyor" diyerek yazmaz; `Belgeler`/`Masaüstü` çalışır. Seçici kullanıcı hareketi ister (Ctrl+S ve düğme çalışır).
- Dosya seçici açıkken (`rfd`, sync) pencere ve medya yükleme bekler; bu tasarım gereği, ama diyalog açık unutulursa uygulama donmuş gibi görünür.

## Ortam

- **FFmpeg:** Rust önce uygulamanın yanındaki `ffmpeg.exe`'yi, yoksa `C:\ffmpeg\bin\ffmpeg.exe` (9.0.2 essentials) kullanır. Paketlenecek LGPL build'de `h264_mf` kodlayıcısı kullanılır (kalite bitrate ile); bu yol gerçek LGPL binary ve kurulum paketiyle henüz denenmedi, yalnızca yerel GPL build'in `h264_mf`'iyle sentetik kaynakta. Proje köküne konan 2025-08 `ffmpeg.exe` fontconfig'siz derlenmiş; `drawtext` `fontfile=` verilmezse çöker (artık export `fontfile=` veriyor). Elle export testinde `C:\ffmpeg\bin` sürümü kullanılır.
- **Rust derlenmiyor** bu makinede: Visual Studio C++ iş yükü (MSVC + Windows SDK) kurulu değil, `link.exe` yok. `npm run tauri dev`, `cargo test` ve `src-tauri` değişiklikleri buna bağlı. `npm run desktop` daha önce derlenmiş `app.exe`'yi açar ([[desktop-security]]).
- Eski `app.exe` pencere başlığı yeniden derlenene kadar "CapCut Clone" kalabilir; `npm run desktop` ikisini de tanır. `tauri.conf.json` değişiklikleri (`center`, `minWidth`, CSP) yeniden derleme ister.

## Teknik notlar

- Timeline sürükleme/trim `updateClipTiming` ile mutlak değerlerle gider; hız ≠ 1 iken kaynak aralığı `outPoint - inPoint = duration * speed` korunur, yeni kod buna güvenir ([[timeline-model]]).
- `npm run lint` 3 uyarı veriyor: `PreviewPlayer` ve `Timeline` `exhaustive-deps`, `ExportModal` `set-state-in-effect`. Yeni uyarı eklenmedi.
