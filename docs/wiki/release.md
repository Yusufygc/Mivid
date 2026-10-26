# Sürüm Yayınlama ve Otomatik Güncelleme

Kurulu uygulama kendini günceller. Kullanıcı yeni kurulum dosyası aramaz. Bağlantılar: [[desktop-security]], [[roadmap]], [[audit-report]] Bulgu 9.

## Nasıl çalışır

1. `v*` etiketi push edilir. `.github/workflows/release.yml` çalışır: LGPL FFmpeg indirilir (`scripts/fetch-ffmpeg.ps1`), NSIS kurulum paketi derlenir, güncelleme imzalanır, GitHub Release açılır, `latest.json` yüklenir.
2. Kurulu uygulama açıldıktan 4 saniye sonra `https://github.com/Yusufygc/Mivid/releases/latest/download/latest.json` adresine bakar (`UpdateBanner.tsx`, `tauri-plugin-updater`).
3. Daha yeni sürüm varsa üstte bir bant çıkar. "Güncelle": paket indirilir, imza `tauri.conf.json` içindeki public key ile doğrulanır, sessiz kurulum (`installMode: passive`), uygulama yeniden açılır. Proje otomatik kaydedilir ([[timeline-model]]).
4. Kontrol hatası (çevrimdışı, henüz release yok) sessizce günlüğe yazılır; arayüzde bir şey çıkmaz.

**Sınır:** Fark (delta) güncellemesi yok. Her güncelleme tam kurulum paketini indirir (FFmpeg dahil, 80-130 MB civarı). Yalnızca arayüzü uzaktan güncelleme bilinçli olarak yapılmadı: CSP (`'self'`) ve Rust doğrulayıcı modelini bozar.

## Yeni sürüm çıkarma

Çalışma ağacı temizken (her şey commit'li):

```bash
npm run release -- patch      # 0.1.0 -> 0.1.1   (minor: 0.2.0, major: 1.0.0, ya da tam sürüm: 0.3.0)
git push origin feature v0.1.1
```

`scripts/release.mjs` sırayla: sürümleri kontrol eder (`package.json` ve `Cargo.toml` aynı olmalı), `tsc` ve `vitest` çalıştırır, `package.json` + `package-lock.json` + `Cargo.toml` + `Cargo.lock` sürümünü yükseltir, `chore: sürüm X` commit'i ve `vX` etiketini oluşturur. **Push etmez**: etiket push'u yayını başlatır, o adım sende. `--dry-run` hiçbir şeyi değiştirmeden yeni sürümü gösterir.

Etiket push edilince `release.yml` çalışır; etiket `package.json` sürümüyle eşleşmezse ilk adımda durur. Actions bitince Releases sayfasında `Mivid_X_x64-setup.exe` ve `latest.json` görünür; kurulu uygulamalar bir sonraki açılışta güncelleme teklif alır.

## Tek seferlik kurulum (yapıldı / yapılacak)

| Öğe | Durum |
|---|---|
| Güncelleme anahtar çifti (`~/.tauri/mivid.key` ve `.pub`) | Üretildi, şifresiz |
| Public key `tauri.conf.json` `plugins.updater.pubkey` | Yazıldı |
| Private key GitHub secret `TAURI_SIGNING_PRIVATE_KEY` | Eklendi (kullanıcı, 2026-10-26) |
| İlk kurulum paketi ve gerçek güncelleme döngüsü | **Denenmedi** |

**Private key kaybolursa** kurulu uygulamalar bir daha güncellenemez: yeni anahtar + elle yeniden kurulum gerekir. Anahtar repoya girmez; yedeğini repo dışında tut.

## Lisans

Apache-2.0 (`LICENSE`, `NOTICE`). Kurulum paketindeki LGPL FFmpeg için `THIRD_PARTY_NOTICES.md`. Üçü de kurulu uygulamanın kaynak klasörüne kopyalanır (`bundle.resources`). Kurulum sihirbazında lisans onay sayfası yok: sessiz güncellemeyi bozmasın diye `licenseFile` kullanılmadı.

## Bilinen eksikler

- **Windows kod imzalama yok.** Kurulumda SmartScreen "bilinmeyen yayıncı" uyarısı çıkar; "Yine de çalıştır" ile kurulur. Güncelleme imzası (minisign) bundan ayrıdır ve çalışır.
- Yalnızca Windows x64 (NSIS). `bundle.targets` `["nsis"]`.
- Geri alma: eski sürüm Release sayfasından elle kurulur; uygulama içi geri alma yok.
