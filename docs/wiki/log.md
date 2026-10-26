# Wiki Kayıt Defteri

En yeni girdi en üstte. Biçim ve işlem tipleri: [[rules]]. Harita: [[index]].

## [2026-10-26] INGEST | Otomatik güncelleme ve GitHub sürümleri
`origin` eklendi (github.com/Yusufygc/Mivid), `main` ve `feature` push edildi. `tauri-plugin-updater` + `tauri-plugin-process`, `UpdateBanner.tsx`, `tauri.conf.json` `plugins.updater` (public key, GitHub `latest.json`), `createUpdaterArtifacts`, hedef yalnızca NSIS, izinler `updater:default` ve `process:allow-restart`. `.github/workflows/release.yml` (`v*` etiketi). npm paketleri crate sürümlerine sabitlendi (`tauri` CLI uyumsuzlukta hata verir). Debug exe güncelleyici yapılandırmasıyla açılıyor. **Denenmedi:** private key GitHub secret'ı (elle eklenecek), release iş akışı, gerçek güncelleme. Bkz. [[release]], [[desktop-security]].

## [2026-10-26] INGEST | Denetim düzeltmeleri: Bulgu 5, 4, 3, 9
Bulgu 5: `projectValidation.ts` aralık doğrulaması, bozuk otomatik kayıt temizliği. Bulgu 4: `export_job.rs`, `cancel_export`, iptalde yarım dosya silinir, `ExportModal` iptal düğmesi. Bulgu 3: göreli FFmpeg yolu kalktı, `video_encoder` komutu (libx264 yoksa `h264_mf`, guard `-c:v h264_mf` ve `-b:v` kabul eder), `tauri.bundle.conf.json` + `scripts/fetch-ffmpeg.ps1` + `npm run bundle` (LGPL sidecar; **denenmedi**). Bulgu 9: `.github/workflows/ci.yml` (**çalışmadı**, remote yok), sürüm tek kaynak (`Cargo.toml`). `cargo test --lib` 34/34, vitest 360. Bkz. [[desktop-security]], [[export-pipeline]], [[audit-report]], [[roadmap]].

## [2026-10-25] REVIEW | Native pencerede elle QA (CDP ile)
Tauri penceresi WebView2 uzaktan hata ayıklama portuyla sürüldü ([[qa-playbook]] 5c): gerçek dosya diyalogları, 3 klip, 3 geçiş, 4 efekt, Konum Seç + export, proje kaydet/aç, saldırı denemeleri, üretim derlemesinde CSP. Üç hata bulundu ve düzeltildi: asset videosu canvas'ı kirletiyordu (`crossOrigin='anonymous'`: thumbnail/film şeridi/chroma), export ilerlemesi bitene kadar %5'te kalıyordu (FFmpeg `\r` satırları), `identifier` varsayılan olduğu için `tauri build` reddediyordu. Bkz. [[desktop-security]], [[known-issues]].

## [2026-10-23] INGEST | Geçişler ve efektler: yeni özellikler
Geçişlere süre/yön/eğri ve 4 yeni tür (iris, zoom, flaş, bulanık), gerçek wipe; efektlere ters mod, tüm kare, güç animasyonu, renk tonu, keskinleştir, vinyet. Yeni `core/transitions`, `TransitionPanel`, `EffectSettingsPanel`; `pushVisualLayer` baş/kuyruk ayrımı, `pushRegionEffect` dilimleri; Rust `ALLOWED_FILTERS` + `convolution`. Gerçek ffmpeg parite testleri ve gerçek Reels kaynaklarıyla tarayıcı QA'sı: önizleme ile export 2-3,3/255 fark. Bulgular: drawbox alfa'yı yok sayar, sınırlı aralık siyah/beyaz, `+-` ifadesi, canvas blur kenar koyulaşması, geçişte ripple eksikliği (düzeltildi). Bkz. [[export-pipeline]], [[preview-engine]], [[timeline-model]], [[known-issues]], [[qa-playbook]].

## [2026-10-21] LINT | Dokümanlar docs/wiki yapısına taşındı
`docs/ARCHITECTURE.md`, `RULES.md`, `TODO.md`, `NEXT_SESSION.md`, `DENETIM_RAPORU.md` `docs/wiki/` altına taşındı ([[architecture]], [[rules]], [[roadmap]], [[next-session]], [[audit-report]]). Yeni sayfalar: [[index]], [[log]], [[timeline-model]], [[preview-engine]], [[export-pipeline]], [[desktop-security]], [[known-issues]], [[qa-playbook]]. Kökte kısa `CLAUDE.md` giriş kapısı açıldı. Eski satırlar temizlendi: resim klipleri, V1 yerleşimi ve `NEXT_SESSION` "commit bekliyor" notları. Denetim Bulgu 17 ve 18 kapandı.

## [2026-10-21] REVIEW | Commit geçmişinden AI satırı silindi
11 commit'ten (`f2f8c00`..`297c8c2`) `Co-Authored-By` satırı silindi (`git filter-branch`, remote yoktu, ağaçlar birebir aynı). Kural [[rules]] §5'e işlendi.

## [2026-10-19] INGEST | Güvenlik: export komutu doğrulaması, CSP, izin listesi
Denetim Bulgu 1-2. Yeni Rust modülleri `export_guard.rs` ve `media_access.rs`, komutlar `select_export_path`, `open_project_dialog`, `probe_media`; `csp`/`devCsp`, `assetProtocol.scope: []`; `ExportModal` "Konum Seç"; `guardFixtures.test.ts` sözleşme testi. Commit `6c8b386`. **Rust derlenmedi.** Bkz. [[desktop-security]], [[export-pipeline]].

## [2026-10-19] REVIEW | Sistem denetimi
`V2-GenelSablon.md` şablonuyla tüm proje tarandı: 18 bulgu (1 kritik). Rapor: [[audit-report]]. Plan: [[roadmap]] Faz 9.

## [2026-10-19] REVIEW | QA düzeltme turu (gerçek Reels kaynaklarıyla)
Beş bulgu düzeltildi ve senaryo yeniden denendi: metin yazı tipi `fontfile` ile ([[export-pipeline]]), yeni klip V1'e ([[timeline-model]]), yeniden boyutlanır timeline ve dar pencere düzeni, önizleme yükleme göstergesi ([[preview-engine]]), Oto keyframe, FPS seçici. Renk ön ayarı, ölçek keyframe ve çapraz geçiş export'ta doğrulandı (zoom 1,285x, PSNR 34,9 dB). Commit `1209dac`. Yöntem: [[qa-playbook]].

## [2026-10-19] INGEST | Ürün adı Mivid
Ürün adı Mivid olarak değiştirildi, CapCut Pro adı kaldırıldı. Commit `e9ad6e0`. Karar: bu projede REA / CapCut incelemesi yok.

## [2026-10] INGEST | Özellik turları (özet)
Resim/sticker, chroma key, dondurma karesi, çoklu klip sürükleme, sessiz medya (`ce78972`); bölge blur/mozaik/siyah kutu ve bulanık arka plan (`b57b73d`); ses fade/gürültü azaltma ve renk ayarı (`15f8b53`); önizleme tutamaçları, rotation keyframe, proje kaydet/aç (`47f11ba`); Undo/Redo geçmişi (`623db96`). Ayrıntı: [[roadmap]].
