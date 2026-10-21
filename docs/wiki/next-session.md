# Sonraki Oturum Planı

Son güncelleme: 2026-10-21. Dal: `feature`. Bir sonraki oturumda nereden devam edileceği. Görev listesi: [[roadmap]]. Giriş: [[index]].

## 1. Şu anki durum

- `feature` dalı temiz; son commit'ler: `6c8b386` (export doğrulaması, CSP, izin listesi), `1209dac` (QA düzeltme turu), `e9ad6e0` (ürün adı Mivid). Hiçbir şey push edilmedi. Remote tanımlı değil.
- Testler: 257 birim testi, `npx tsc -b`, `npm run build` temiz; `oxlint` 3 eski uyarı ([[known-issues]]).
- **Rust derlenmedi.** `export_guard.rs`, `media_access.rs` ve `lib.rs` yeni komutları yazıldı ama bu makinede `link.exe` (Visual Studio C++ iş yükü) yok. Kullanıcı VS Installer'da "C++ ile masaüstü geliştirme"yi kurmaya başlıyor ([[desktop-security]]).
- Karar: bu projede REA / CapCut incelemesi yok; özgün, iş akışını kolaylaştıran özellikler yapılır. Commit yalnızca kullanıcı isteyince, yalnızca `feature` dalına, AI satırı olmadan ([[rules]]).
- Denetim raporu: [[audit-report]] (18 bulgu; 1-2 kodlandı, 18 kısmen).

## 2. Sıradaki adım: C++ iş yükü kurulunca

1. `link.exe` geldi mi: `vswhere -all -prerelease -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`.
2. `cd src-tauri; cargo test`: `export_guard` (fixture sözleşmesi dahil), `media_access` ve `lib.rs` testleri. Derleme hatası çıkarsa düzelt (kod hiç derlenmedi: tür/ödünç alma hataları beklenir).
3. `npm run tauri dev` ya da `npm run desktop` ile elle deneme:
   - medya içe aktar ve önizle (asset kapsamı `[]` iken `asset://` çalışıyor mu)
   - uygulamayı kapat/aç, otomatik kaydı kurtar: önizleme çalışmalı (kalıcı izin listesi)
   - proje aç diyaloğu (`open_project_dialog`)
   - **Konum Seç** + export + "Klasörde göster"
   - sessiz medya (`probe_media`) ve resim/dondurma karesi export'u
   - **saldırı denemeleri** (devTools): `invoke('run_ffmpeg_export', {args:['-y','-i','C:/Windows/win.ini','x.mp4'], totalDuration:1})` reddedilmeli; `fetch('asset://localhost/C:/Windows/win.ini')` açılmamalı
   - konsolda "Refused to …" varsa `tauri.conf.json` `csp`/`devCsp` güncelle
   - Ctrl+S/Ctrl+O (WebView2'de `showSaveFilePicker` çalışıyor mu), film şeridi/dalga formu (asset protokolünden `fetch`), chroma önizlemesi (kirli canvas yedeği), `minWidth/minHeight`, resizable timeline
4. Sonuçları [[desktop-security]] ve `log.md`'ye işle; sonra [[roadmap]] Faz 9'dan devam.

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
