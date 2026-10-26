# Sürüm Yayınlama ve Otomatik Güncelleme

Kurulu uygulama kendini günceller. Kullanıcı yeni kurulum dosyası aramaz. Bağlantılar: [[desktop-security]], [[roadmap]], [[audit-report]] Bulgu 9.

## Nasıl çalışır

1. `v*` etiketi push edilir. `.github/workflows/release.yml` çalışır: LGPL FFmpeg indirilir (`scripts/fetch-ffmpeg.ps1`), NSIS kurulum paketi derlenir, güncelleme imzalanır, GitHub Release açılır, `latest.json` yüklenir.
2. Kurulu uygulama açıldıktan 4 saniye sonra `https://github.com/Yusufygc/Mivid/releases/latest/download/latest.json` adresine bakar (`UpdateBanner.tsx`, `tauri-plugin-updater`).
3. Daha yeni sürüm varsa üstte bir bant çıkar. "Güncelle": paket indirilir, imza `tauri.conf.json` içindeki public key ile doğrulanır, sessiz kurulum (`installMode: passive`), uygulama yeniden açılır. Proje otomatik kaydedilir ([[timeline-model]]).
4. Kontrol hatası (çevrimdışı, henüz release yok) sessizce günlüğe yazılır; arayüzde bir şey çıkmaz.

**Sınır:** Fark (delta) güncellemesi yok. Her güncelleme tam kurulum paketini indirir (FFmpeg dahil, 80-130 MB civarı). Yalnızca arayüzü uzaktan güncelleme bilinçli olarak yapılmadı: CSP (`'self'`) ve Rust doğrulayıcı modelini bozar.

## Yeni sürüm çıkarma

1. `package.json` ve `src-tauri/Cargo.toml` içindeki `version` aynı değere çekilir (`version.test.ts` eşitliği denetler; `tauri.conf.json`'da sürüm yoktur).
2. Commit, sonra:
   ```bash
   git tag v0.2.0
   git push origin feature --tags
   ```
   Etiket, `package.json` sürümüyle `v` + sürüm olarak eşleşmezse iş akışı ilk adımda durur.
3. Actions sekmesinde "Release" bitince Releases sayfasında `Mivid_0.2.0_x64-setup.exe` ve `latest.json` görünür. Kurulu uygulamalar bir sonraki açılışta teklif alır.

## Tek seferlik kurulum (yapıldı / yapılacak)

| Öğe | Durum |
|---|---|
| Güncelleme anahtar çifti (`~/.tauri/mivid.key` ve `.pub`) | Üretildi, şifresiz |
| Public key `tauri.conf.json` `plugins.updater.pubkey` | Yazıldı |
| Private key GitHub secret `TAURI_SIGNING_PRIVATE_KEY` | **Yapılmadı: elle eklenecek** (Settings > Secrets and variables > Actions). Değer: `~/.tauri/mivid.key` dosyasının tüm içeriği |
| İlk kurulum paketi ve gerçek güncelleme döngüsü | **Denenmedi** |

**Private key kaybolursa** kurulu uygulamalar bir daha güncellenemez: yeni anahtar + elle yeniden kurulum gerekir. Anahtar repoya girmez; yedeğini repo dışında tut.

## Bilinen eksikler

- **Windows kod imzalama yok.** Kurulumda SmartScreen "bilinmeyen yayıncı" uyarısı çıkar; "Yine de çalıştır" ile kurulur. Güncelleme imzası (minisign) bundan ayrıdır ve çalışır.
- Yalnızca Windows x64 (NSIS). `bundle.targets` `["nsis"]`.
- Açık kaynak lisansı dosyası (`LICENSE`) repoda yok. FFmpeg LGPL bildirimi için de bir `THIRD_PARTY` notu gerekir.
- Geri alma: eski sürüm Release sayfasından elle kurulur; uygulama içi geri alma yok.
