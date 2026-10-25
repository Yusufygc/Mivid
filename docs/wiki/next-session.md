# Sonraki Oturum Planı

Son güncelleme: 2026-10-21. Dal: `feature`. Bir sonraki oturumda nereden devam edileceği. Görev listesi: [[roadmap]]. Giriş: [[index]].

## 1. Şu anki durum

- `feature` dalı temiz; son commit'ler: `6c8b386` (export doğrulaması, CSP, izin listesi), `1209dac` (QA düzeltme turu), `e9ad6e0` (ürün adı Mivid). Hiçbir şey push edilmedi. Remote tanımlı değil.
- Testler: 355 birim testi (29'u gerçek ffmpeg isteyen opt-in parite testi, `FFMPEG_PARITY=1`), `npx tsc -b`, `npm run build` temiz; `oxlint` 3 eski uyarı ([[known-issues]]).
- **Rust derleniyor ve testleri geçiyor** (`cargo test --lib`: 24/24). Native pencerede elle denemeler hâlâ bekliyor ([[desktop-security]]), aşağıda bölüm 2.
- Karar: bu projede REA / CapCut incelemesi yok; özgün, iş akışını kolaylaştıran özellikler yapılır. Commit yalnızca kullanıcı isteyince, yalnızca `feature` dalına, AI satırı olmadan ([[rules]]).
- Denetim raporu: [[audit-report]] (18 bulgu; 1-2 kodlandı ve Rust testleri geçti, 17-18 kapandı).
- **Native pencere denendi (2026-10-25)**: dev ve üretim derlemesi uzaktan sürüldü, CSP/asset/diyalog/export doğrulandı, üç hata düzeltildi (canvas kirlenmesi, ilerleme çubuğu, `identifier`); ayrıntı [[desktop-security]]. Commit bekliyor.
- **Yeni (2026-10-23): geçişler ve efektler** kodlandı, testlendi, gerçek ffmpeg ve önizleme karşılaştırmasıyla doğrulandı, commit bekliyor ([[roadmap]] Faz 10, [[log]]). Rust `cargo test` 24/24 geçti (VS C++ kuruldu), `npm run tauri dev` açılıyor; `vite.config.ts`'e `watch.ignored: ['**/src-tauri/**']` eklendi (cargo çıktısı vite'ı EBUSY ile çökertiyordu).

## 2. Native pencerede elle bakılacaklar (kullanıcı; otomasyon yapılanları geçti)

1. `npm run tauri dev` ile aç (PATH'te `%USERPROFILE%\.cargo\bin`). Elle deneme:
   - medya içe aktar ve önizle (asset kapsamı `[]` iken `asset://` çalışıyor mu)
   - uygulamayı kapat/aç, otomatik kaydı kurtar: önizleme çalışmalı (kalıcı izin listesi)
   - proje aç diyaloğu (`open_project_dialog`)
   - **Konum Seç** + export + "Klasörde göster"
   - sessiz medya (`probe_media`) ve resim/dondurma karesi export'u
   - **saldırı denemeleri** (devTools): `invoke('run_ffmpeg_export', {args:['-y','-i','C:/Windows/win.ini','x.mp4'], totalDuration:1})` reddedilmeli; `fetch('asset://localhost/C:/Windows/win.ini')` açılmamalı
   - konsolda "Refused to …" varsa `tauri.conf.json` `csp`/`devCsp` güncelle
   - Ctrl+S/Ctrl+O (WebView2'de `showSaveFilePicker` çalışıyor mu), film şeridi/dalga formu (asset protokolünden `fetch`), chroma önizlemesi (kirli canvas yedeği), `minWidth/minHeight`, resizable timeline
2. Yeni geçiş ve efektleri de native pencerede dene (Inspector'da süre/yön/eğri, efekt ters/tüm kare/güç animasyonu, export). Sonuçları [[desktop-security]] ve `log.md`'ye işle; sonra [[roadmap]] Faz 9'dan devam.

## 3. Derleme gerektirmeden yapılabilecekler (önerilen sıra)

1. **Bulgu 5:** `parseProjectFile` aralık doğrulaması (fps, genişlik/yükseklik, süre, `NaN`), bozuk otomatik kaydı temizleme. En değerlisi.
2. Bulgu 10-11: metadata okunamazsa hata bildir; `removeAsset` içinde `revokeObjectURL` ve referans kontrolü.
3. Bulgu 13: Logger'ı dosyaya bağla, `console.*` çağrılarını `Logger` ile değiştir.
4. Bulgu 16: hook bağımlılık uyarıları (önce sürükleme hesabını saf fonksiyona çıkarıp test et).
5. Bulgu 8: UI testleri, `coverage-v8`.
6. Bulgu 6-7, 14: store ve motor bölünmesi (büyük iş; önce testler).

## 4. Rust gerektirenler

Bulgu 3 (FFmpeg sidecar), Bulgu 4 (export iptali), Bulgu 9 (`identifier`, CI), Bulgu 12 kalan kısmı, Tauri yerel kaydet diyaloğu (`save_project_dialog`), yeni yazı tipi dizini yapılandırması (Bulgu 15).

## 5. Ortam notları

- **Masaüstü uygulamasını açmak:** `npm run desktop` (vite + `src-tauri/target/debug/app.exe`, pencereyi birincil monitöre ortalar; pencere önceden sanal ekranda kayboluyordu). `src-tauri/src` ya da `tauri.conf.json` değiştiyse `npm run tauri dev` ile yeniden derlemek gerekir.
- Rust 1.99.1 kurulu (`%USERPROFILE%\.cargo\bin`, yeni shell'de PATH'e girer). VS 2026 Community: `C:\Program Files\Microsoft Visual Studio\18\Community`; installer ile `Microsoft.VisualStudio.Workload.NativeDesktop` eklenir.
- Tarayıcıda hızlı QA ve başsız export: [[qa-playbook]]. FFmpeg: `C:\ffmpeg\bin\ffmpeg.exe`.

## 6. Mimari hatırlatmaları

- Keyframe zamanı klip-yerel saniye; easing `p*p*(3-2*p)` TS ve FFmpeg'de aynı olmalı; önizlemede transform `resolveTransform` ile okunur ([[timeline-model]]).
- Export'ta kaynak süresi `duration * speed`; `outPoint`'e güvenilmez.
- Builder yeni filtre/bayrak kullanırsa `guardFixtures.test.ts` snapshot'ı ve Rust `ALLOWED_FILTERS` birlikte güncellenir ([[export-pipeline]]).
