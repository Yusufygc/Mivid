# Wiki Kayıt Defteri

En yeni girdi en üstte. Biçim ve işlem tipleri: [[rules]]. Harita: [[index]].

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
