# Bilinen Sorunlar ve Sınırlamalar

Davranışsal sınırlar ve bilinen farklar. Kod kalitesi ve güvenlik bulguları ayrı: [[audit-report]]. Plan: [[next-session]], [[roadmap]].

## Önizleme ve export

- **`videoPool` asset başına tek `<video>`:** aynı asset'in iki klibi aynı anda aktifse (üst üste iki kopya) aynı eleman paylaşılır ve çakışır ([[preview-engine]]).
- **Sol kırpma + keyframe:** sol tutamacı içeri sürükleyince kırpılan bölgedeki keyframe'ler kaybolur; geri sürükleyince eğri orijinaline dönmez (sınır keyframe'inin değeri tutulur).
- **Çok satırlı metin:** export'ta tek satıra çevrilir (`escapeFFmpegText` `\n` → boşluk); önizleme çok satır çizer ([[export-pipeline]]).
- **Blur paritesi:** kenar yumuşatma önizlemede bulanık maske, export'ta aynı sigmalı `gblur`'lu şekil; piksel düzeyinde birebir değil. Önizlemede blur canvas kenarında saydama solar, export'ta kenar kopyalanır (yalnızca tuval kenarındaki bölgelerde fark).
- **Bulanık arka plan export'ta** klip opaklığını sabit değerle alır (opaklık keyframe'i arka plana uygulanmaz) ve slide/wipe geçişinde arka plan kaymaz. Chroma key'den önceki (anahtarsız) kaynağı kullanır.
- **Chroma key önizlemesi:** 960 px'e indirilmiş yazılım işlemesi; kenarlarda yaklaşık 0,1 alfa farkı olabilir. Asset protokolünden gelen video canvas'ı kirletirse önizleme anahtarsız çizer, export çalışır.
- **Dondurma karesi:** klip uzunluğu 2 sn başlar, sağ kenardan kırpılarak değişir. Kare, yarım saniyelik pencerede ilk kare seçilerek alınır (çok seyrek anahtar kareli dosyada birkaç kare kayabilir).
- **Slide/wipe geçiş + keyframe x:** giriş ve çıkış ofsetleri toplanıyor; bu davranış ayrıca test edilmedi.
- **Animasyonlu opaklık ve bölge maskesi `geq` ile:** 1080p, 3 sn için yaklaşık 1,7 sn; 4K ve uzun kliplerde ölçülmedi.
- **Karışım modları yok:** FFmpeg `blend` şeffaf katmanı ve alfa'yı doğru karıştırmadığı için önizleme/export eşleşmiyor.
- **Önizleme `denoise` göstermez** (yalnızca export'ta `afftdn`).

## Medya

- **Film şeridi:** her video için 12 kare, tüm asset'e esnetilmiş tek şerit; **dalga formu** 10 dakikadan uzun seslerde üretilmez (`MAX_WAVEFORM_SECONDS`).
- **Sessiz medya probe'u** yalnızca masaüstünde çalışır (`probe_media`); web modunda `hasAudio` bilinmez ve ses var sayılır.
- **Metadata okunamazsa** içe aktarma sessizce 10 sn ve 1920x1080 varsayar ([[audit-report]] Bulgu 10).
- **Blob olarak içe aktarılan medya** (tarayıcı modu) kaydedilen projede açılışta bulunamaz.

## Ortam

- **FFmpeg:** Rust önce `C:\ffmpeg\bin\ffmpeg.exe` (9.0.2 essentials) kullanır. Proje köküne konan 2025-08 `ffmpeg.exe` fontconfig'siz derlenmiş; `drawtext` `fontfile=` verilmezse çöker (artık export `fontfile=` veriyor). Elle export testinde `C:\ffmpeg\bin` sürümü kullanılır.
- **Rust derlenmiyor** bu makinede: Visual Studio C++ iş yükü (MSVC + Windows SDK) kurulu değil, `link.exe` yok. `npm run tauri dev`, `cargo test` ve `src-tauri` değişiklikleri buna bağlı. `npm run desktop` daha önce derlenmiş `app.exe`'yi açar ([[desktop-security]]).
- Eski `app.exe` pencere başlığı yeniden derlenene kadar "CapCut Clone" kalabilir; `npm run desktop` ikisini de tanır. `tauri.conf.json` değişiklikleri (`center`, `minWidth`, CSP) yeniden derleme ister.

## Teknik notlar

- Timeline sürükleme/trim `updateClipTiming` ile mutlak değerlerle gider; hız ≠ 1 iken kaynak aralığı `outPoint - inPoint = duration * speed` korunur, yeni kod buna güvenir ([[timeline-model]]).
- `npm run lint` 3 uyarı veriyor: `PreviewPlayer` ve `Timeline` `exhaustive-deps`, `ExportModal` `set-state-in-effect`. Yeni uyarı eklenmedi.
