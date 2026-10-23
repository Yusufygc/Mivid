# Masaüstü Katmanı ve Güvenlik Modeli

Tauri/Rust tarafı (`src-tauri/src/`). Amaç: webview'de çalışan bir betik diskte dolaşamasın ve keyfi FFmpeg komutu çalıştıramasın. Köken: [[audit-report]] Bulgu 1-2. Export tarafı: [[export-pipeline]]. Mimari: [[architecture]].

> **Durum (2026-10-21):** kod yazıldı ve commit'li ama Rust **derlenmedi** (Visual Studio C++ iş yükü, `link.exe` kurulana kadar). `cargo test` ve masaüstü elle denemeleri [[next-session]]'da.

## Dosyalar

| Dosya | Görev |
|---|---|
| `lib.rs` | Komutlar ve `run()`; FFmpeg çalıştırma, ilerleme olayı |
| `media_access.rs` | Kullanıcının yerel diyalogla seçtiği medya dosyalarının izin listesi, asset kapsamı, export hedefi; `app_data_dir()/media_allowlist.json` (en çok 5000 kayıt, açılışta var olmayanlar elenir) |
| `export_guard.rs` | `run_ffmpeg_export` argüman doğrulayıcı (saf `std`+`serde_json`) |
| `tests/fixtures/export_args.json` | Builder çıktısından üretilen sözleşme dosyası ([[export-pipeline]]) |

## Komutlar

- `select_media_files`: `rfd` çoklu dosya diyaloğu; seçilenler izin listesine ve asset kapsamına eklenir.
- `open_project_dialog`: `rfd` proje açma diyaloğu; dosya metnini döndürür, projedeki `assets[].path` değerlerini izin listesine ekler (64 MB üstü reddedilir).
- `select_export_path`: kayıt diyaloğu; seçilen yol Rust'ta `export_target` olur. Uzantı `.mp4/.mov/.webm` değilse `.mp4` eklenir.
- `run_ffmpeg_export(args, total_duration)`: `output_path` **almaz**. `export_target` yoksa "Önce dışa aktarma konumunu seçin". `export_guard::validate` geçmezse çalıştırmaz. FFmpeg'in `time=` çıktısından `export-progress` olayı yayar.
- `probe_media(path)`: yalnızca izin listesindeki dosyayı `ffmpeg -hide_banner -i` ile sorar; `Some(true|false)` ses var/yok, `None` bilinmiyor.
- `open_file_location(path)`: yalnızca `export_target` ya da izin listesindeki dosya için Explorer'da gösterir.

Betikten çağrılabilen "izin ver" komutu yoktur; izin yalnızca yerel diyaloglardan gelir.

## `tauri.conf.json`

- `csp` / `devCsp`: `default-src 'self'`, betik `'self'` (dev'de vite için `'unsafe-inline'`), stil `'unsafe-inline'` (React `style=`), `img-src`/`media-src` `blob:` + `asset:` + `http://asset.localhost`, `connect-src` IPC (`ipc:`, `http://ipc.localhost`), `asset:`, `blob:`, `data:` (+ dev'de `ws://localhost:5173`).
- `assetProtocol.scope: []`: kapsam çalışma anında `allow_file` ile genişler.
- `minWidth 960`, `minHeight 600`, `center: true`. `identifier` hâlâ varsayılan `com.tauri.dev` ([[audit-report]] Bulgu 9).
- `tauri.conf.json` ve Rust derleme zamanında gömülür; değişince `npm run tauri dev` ile yeniden derleme gerekir.

## `export_guard::validate` kuralları

1. En çok 4096 argüman; `-filter_complex` en çok 2 MB.
2. Son argüman = seçilen çıktı yolu; uzantı `.mp4/.mov/.webm`; mutlak, `..` yok; `C:/Windows`, `C:/Program Files*`, `C:/ProgramData` yasak.
3. İzinli bayraklar: `-y`, `-loop 1`, `-framerate`, `-t`, `-i`, `-filter_complex`, `-map [etiket]`, `-c:a aac`, `-b:a \d+k`, `-c:v libx264`, `-pix_fmt yuv420p`, `-preset <liste>`. Başkası reddedilir.
4. `-i` yolu mutlak, `..` yok, izin listesinde, (üretimde) diskte var.
5. Filtre grafı tırnak/kaçış duyarlı ayrıştırılır; **yalnızca** `ALLOWED_FILTERS` içindeki filtre adları geçer (30 filtre; son eklenen `convolution`, keskinleştirme için). Dosya okuyan seçenekler (`textfile`, `file`, `filename`, `subfile`, `fontsdir`, `font_file`, `lut`, `lutfile`) reddedilir; `fontfile` yalnızca `C:/Windows/Fonts/` altından.

Builder yeni filtre/bayrak kullanırsa `guardFixtures.test.ts` snapshot'ı kırılır; `ALLOWED_FILTERS` bilinçli güncellenir.

## Kalan risk

Betik enjeksiyonu olursa izin listesindeki medya dosyalarını yine export edebilir; diskin geri kalanı kapalıdır. FFmpeg çalışma dizininden aranıyor ve paketlenmiyor (Bulgu 3); export engelleyici çalışıyor, iptal yok (Bulgu 4).
