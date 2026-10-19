# Mivid Sistem Denetim Raporu

Tarih: 2026-10-19. Dal: `feature` (son commit `3723a25`). Şablon: `V2-GenelSablon.md`. Süreç referansı: `AI-Gelistirme-Metodolojisi.md`.

## Tarama planı ve yöntem

Dizin ağacı (`git ls-files`, 112 dosya): `src/core` 36 dosya, `src/components` 15, `src/stores` 4, `src/types` 4, `src/utils` 2, `src-tauri/src` 2 (199 satır Rust), `docs` 4, ikonlar 16. `src` altında testler dahil toplam 12.410 satır TypeScript. 17 test dosyası, 250 test.

Giriş noktaları (`main.tsx`, `App.tsx`, `src-tauri/src/lib.rs`) okundu. Rust tarafı ve `projectFile.ts` satır satır okundu. Büyük dosyalarda ölçüm betiği çalıştırıldı (fonksiyon uzunluğu, süslü parantez sayımı). `grep` ile `console.*`, `catch`, `as any`, `localStorage`, `setTimeout`, tarih/yerel kullanımı, ID üretimi, nesne URL'leri tarandı. `npm audit` çalıştırıldı: 0 açık.

Ölçülemeyenler: cyclomatic ve kognitif karmaşıklık için araç yok (projede `oxlint` var, karmaşıklık kuralı kapalı). Parametre sayısı ve iç içe blok derinliği taranmadı. Test coverage yüzdesi ölçülemedi (`@vitest/coverage-v8` kurulu değil); aşağıdaki oran dosya eşleşmesinden çıkarıldı.

## Bölüm A — Yönetici özeti

Mivid, çekirdek mantığı (keyframe, export grafı, geçmiş yönetimi, proje dosyası) iyi test edilmiş, katmanları net ayrılmış bir Tauri + React video editörü. Zayıf noktalar üç grupta toplanıyor. Birincisi, Rust tarafı: `run_ffmpeg_export` komutu arayüzden gelen herhangi bir FFmpeg argümanını çalıştırıyor, CSP kapalı ve asset protokolü tüm diske açık. İkincisi, boyut: üç dosya 650-1230 satır, `useTimelineStore` tek başına 92 eylem taşıyor. Üçüncüsü, güvence: arayüz katmanında (3.570 satır) sıfır test, CI yok, kurulum paketine FFmpeg girmiyor. Methodoloji dosyasına göre wiki, `CLAUDE.md` ve `log.md` yok; son altı commit'in altısında `Co-Authored-By` satırı var ve bu §6'ya aykırı.

| # | Bulgu | Öncelik | Boyut | Efor | Etki |
|---|-------|---------|-------|------|------|
| 1 | `run_ffmpeg_export` rastgele argüman ve çıktı yolu kabul ediyor | 🔴 | Güvenlik | M | Yüksek |
| 2 | CSP `null`, asset protokolü kapsamı `**` | 🟠 | Güvenlik | S | Yüksek |
| 3 | FFmpeg çalışma dizininden aranıyor, pakete girmiyor | 🟠 | Production | M | Yüksek |
| 4 | Export engelleyici çalışıyor: iptal yok, zaman aşımı yok | 🟠 | Production | M | Yüksek |
| 5 | Proje dosyası doğrulaması yüzeysel | 🟠 | Güvenlik | M | Orta-Yüksek |
| 6 | `useTimelineStore` God Object (1228 satır, 92 eylem) | 🟠 | Mimari | XL | Yüksek |
| 7 | `previewEngine.ts` 971 satır, `drawComposition` 215 satır | 🟠 | Mimari | L | Orta-Yüksek |
| 8 | Arayüz katmanında sıfır test, Rust'ta sıfır test | 🟠 | Test | L | Yüksek |
| 9 | CI/CD ve imzalama yok, `identifier` varsayılan | 🟠 | Production | M | Orta-Yüksek |
| 10 | Sessiz varsayılanlar: süre 10 sn, 1920x1080 | 🟡 | Kod Kalitesi | S | Orta |
| 11 | Nesne URL'i sızıntısı, `removeAsset` referans kontrolü yapmıyor | 🟡 | Kod Kalitesi | S | Orta |
| 12 | Probe için export komutu kötüye kullanılıyor | 🟡 | Mimari | M | Orta |
| 13 | Logger yalnızca bellekte; 10 `console.*` çağrısı | 🟡 | Production | S | Orta |
| 14 | `pushVisualLayer` 168 satır, DRY: ID üretimi 8 yerde | 🟡 | Kod Kalitesi | M | Orta |
| 15 | Windows'a sabitlenmiş yollar | 🟡 | Production | M | Orta |
| 16 | Eksik bağımlılık dizisi uyarıları (2 adet) | 🟡 | Kod Kalitesi | S | Orta |
| 17 | Dokümantasyon çelişkileri (`NEXT_SESSION.md`) | 🟡 | Dokümantasyon | S | Düşük |
| 18 | Methodoloji uyumsuzluğu: wiki yok, commit'lerde AI referansı | 🟡 | Süreç | S | Orta |

## Bölüm B — Korunması gereken iyi pratikler

1. **Çekirdek/UI ayrımı.** `src/core` içinde React importu yok; export grafı, keyframe, geçmiş ve proje dosyası saf TypeScript. Testlenebilirliğin nedeni bu. Dokunulmamalı.
2. **Preview/export paritesi testle sabitlenmiş.** Keyframe easing, chroma formülü, geçiş ve bölge efekti hem TS'de hem FFmpeg ifadesinde aynı formüle bağlı; gerçek `ffmpeg` çıktısıyla karşılaştırıldı (zoom ölçümü: PSNR 34,9 dB).
3. **Komut/geçmiş deseni.** `timelineHistory.ts` (birleştirme penceresi, undo/redo) 202 satırlık testle korunuyor.
4. **Proje dosyası sürümlü.** `PROJECT_FILE_VERSION`, "daha yeni sürüm" reddi, otomatik kayıt kurtarma. `parseProjectFile` bozuk veriyi `ProjectFileError` ile reddediyor (kapsamı Bulgu 5'te).
5. **Yerel bağlam doğru.** `e.key.toLowerCase()` yerel-bağımsız (Türkçe 'İ/ı' sorunu yok), tarih `tr-TR` ile biçimleniyor, yazı tipi eşlemesi `Arial` yedeğine düşüyor, UTF-8 JSON yolu sorunsuz. Kilit dosyaları (`package-lock.json`, `Cargo.lock`) depoda; `npm audit` 0 açık.

## Bölüm C — İncelenmedi listesi

- `src/components/**` (15 dosya) ve `useTimelineStore.ts` gövdeleri satır satır okunmadı: yalnızca ölçüm betiği ve `grep` uygulandı. Neden: boyut (4.800+ satır) ve öncelik sırası. Bu dosyalarda ölçüm dışı bulgu aranmadı; kanıtlayamadığım hiçbir iddiayı rapora almadım.
- Test dosyalarının içeriği (sayı ve eşleşme dışında).
- `src-tauri/icons`, `public/*.svg`, `*.css`: görsel varlık.
- `package-lock.json`, `Cargo.lock`: yalnızca varlık raporlandı. `cargo audit` çalıştırılmadı (araç kurulu değil).
- Git geçmişi: `git grep` ile çalışma ağacında sır arandı, sonuç 0. Önceki commit'lerin tüm diff'leri taranmadı.

## Bölüm D — Detaylı bulgular

### [🔴] 1. `run_ffmpeg_export` rastgele FFmpeg argümanı ve çıktı yolu kabul ediyor
- **Durum (2026-10-19):** Kod yazıldı (`export_guard.rs`, `media_access.rs`, `lib.rs`, `ExportModal`), TS testleri geçiyor; Rust derlenip test edilmedi (VS C++ iş yükü bekleniyor).
- **Persona:** DevSecOps
- **Dosya/Konum:** `src-tauri/src/lib.rs:77-171`
- **Kategori:** Güvenlik
- **Sorun:** Komut, `args: Vec<String>` ve `output_path: String` değerlerini doğrulamadan `Command::new(ffmpeg).args(&args)` içine veriyor. `output_path` yalnızca klasör oluşturmak için kullanılıyor; `args` içindeki gerçek çıktı yoluyla bağlantısı kontrol edilmiyor. Hiçbir uzantı, klasör veya argüman beyaz listesi yok.
- **Etki:** Webview'de bir betik çalıştırabilen her kod (örneğin ileride eklenecek bir uzak içerik, bozuk bir bağımlılık) `invoke('run_ffmpeg_export', { args: ['-y','-i','C:/Users/x/belge.docx','C:/Users/x/Desktop/x.mp4'] })` ile diskteki herhangi bir dosyayı okuyup başka bir yere yazdırır ve `-y` ile var olan dosyanın üzerine yazar. Bulgu 2 ile birleşince (CSP yok) önkoşul tek bir betik enjeksiyonudur.
- **Kanıt:**
```rust
let mut child = Command::new(&ffmpeg_bin)
    .args(&args)
```
- **Çözüm:** Rust tarafında argüman listesini sunucu tarafında kur: arayüz yalnızca yapılandırılmış proje JSON'unu ve çıktı yolunu (`rfd::FileDialog::save_file` ile Rust'ın seçtirdiği) göndersin. En az: argümanlarda yalnızca ilk `-i` yolları ve son eleman olarak `output_path` kabul et, `-i`/`-y`/`-f` dışı bayrakları reddet, `output_path` uzantısını `.mp4/.mov/.webm` ile sınırla.
```rust
fn validate_args(args: &[String], output: &str) -> Result<(), String> {
    if args.last().map(String::as_str) != Some(output) {
        return Err("Çıktı yolu argümanlarla eşleşmiyor".into());
    }
    // yalnızca izin verilen bayraklar: -y -hide_banner -i -filter_complex -map -c:v ...
    Ok(())
}
```
- **Düzeltme Eforu:** M
- **Bağımlılık:** `probe.ts` (Bulgu 12) aynı komutu kullanıyor; önce ayrı bir `probe_media` komutu açılmalı.

### [🟠] 2. CSP kapalı, asset protokolü tüm diske açık
- **Durum (2026-10-19):** `csp`/`devCsp` yazıldı, `scope: []` + dinamik izin listesi; masaüstünde elle doğrulanmadı (derleme bekliyor).
- **Persona:** DevSecOps
- **Dosya/Konum:** `src-tauri/tauri.conf.json:25-31`
- **Kategori:** Güvenlik
- **Sorun:** `"csp": null` ve `"assetProtocol": { "enable": true, "scope": ["**"] }`. Webview her origin'e bağlanabilir ve `asset://` ile makinedeki her dosyayı okuyabilir.
- **Etki:** Bir betik enjeksiyonu (Bulgu 1'in önkoşulu) hem dosya okur hem ağa gönderir. Kapsam daraltılsaydı yalnızca kullanıcının seçtiği klasörler okunurdu.
- **Kanıt:**
```json
"security": { "csp": null, "assetProtocol": { "enable": true, "scope": ["**"] } }
```
- **Çözüm:** `"csp": "default-src 'self'; img-src 'self' asset: data: blob:; media-src 'self' asset: blob:; style-src 'self' 'unsafe-inline'"` ve kapsam çalışma anında eklensin: kullanıcı dosya seçince `app.asset_protocol_scope().allow_file(path)`.
- **Düzeltme Eforu:** S
- **Bağımlılık:** Vite dev sunucusu için `connect-src ws://localhost:5173` gerekir; `devCsp` ayrı verilir.

### [🟠] 3. FFmpeg çalışma dizininden aranıyor ve kurulum paketine girmiyor
- **Persona:** SRE / DevOps
- **Dosya/Konum:** `src-tauri/src/lib.rs:6-22`
- **Kategori:** Production
- **Sorun:** Aday yollar `C:\ffmpeg\bin\ffmpeg.exe`, `.\ffmpeg.exe`, `..\ffmpeg.exe`. İlk iki göreli yol çalışma dizinine göre çözülüyor. `ffmpeg.exe` `.gitignore`'da, `bundle` bölümünde `externalBin` yok.
- **Etki:** Kullanıcı uygulamayı içinde sahte `ffmpeg.exe` bulunan bir klasörden (örneğin İndirilenler) başlatırsa o dosya çalışır. Temiz bir makinede FFmpeg yoksa export ve sessiz medya probe'u ilk denemede düşer; hata iletisi yol listesi vermiyor.
- **Kanıt:**
```rust
let candidate_paths = ["C:\\ffmpeg\\bin\\ffmpeg.exe", "C:\\ffmpeg\\ffmpeg.exe", ".\\ffmpeg.exe", "..\\ffmpeg.exe"];
```
- **Çözüm:** FFmpeg'i Tauri sidecar olarak paketle (`bundle.externalBin: ["binaries/ffmpeg"]`, `app.shell().sidecar("ffmpeg")`). Göreli yolları kaldır; `ffmpeg` PATH araması son çare olarak kalsın.
- **Düzeltme Eforu:** M
- **Bağımlılık:** FFmpeg lisansı (GPL/LGPL yapı) dağıtım şartlarını belirler; build seçimi lisansla birlikte yapılmalı.

### [🟠] 4. Export engelleyici çalışıyor: iptal yok, zaman aşımı yok, stdout okunmuyor
- **Persona:** SRE / DevOps
- **Dosya/Konum:** `src-tauri/src/lib.rs:77-155`
- **Kategori:** Production
- **Sorun:** `async fn` içinde `std::process::Command` ve engelleyici `reader.lines()` döngüsü çalışıyor; `child` bir yerde saklanmıyor, bu yüzden dışarıdan öldürülemiyor. `stdout` borulanıyor ama hiç okunmuyor. Başarısız export'ta tüm stderr belleğe biriktiriliyor (`all_stderr`).
- **Etki:** Kullanıcı 20 dakikalık export sırasında "İptal" diyemez; pencere kapanınca FFmpeg alt süreci kalır. Async çalıştırıcının bir iş parçacığı export boyunca bloke olur; eşzamanlı ikinci komut (probe) o iş parçacığı yüzünden gecikir.
- **Kanıt:**
```rust
.stdout(Stdio::piped())
.stderr(Stdio::piped())
.spawn()
...
for line in reader.lines() {
```
- **Çözüm:** `tauri::async_runtime::spawn_blocking` ya da `tokio::process`; `child` bir `State<Mutex<Option<Child>>>` içinde tutulup `cancel_export` komutuyla `kill()`; `stdout` için `Stdio::null()`; stderr'i son 200 satırla sınırla.
- **Düzeltme Eforu:** M
- **Bağımlılık:** `ExportModal.tsx` iptal düğmesi ve ilerleme olayı değişir.

### [🟠] 5. Proje dosyası doğrulaması yüzeysel
- **Persona:** DevSecOps / QA
- **Dosya/Konum:** `src/core/project/projectFile.ts:44-77`
- **Kategori:** Güvenlik / Test
- **Sorun:** Doğrulama yalnızca üst düzey alan tiplerine bakıyor. `fps`, `width`, `height` için aralık kontrolü yok; `duration` ve `startTime` için negatiflik ve `NaN` kontrolü yok; `effect`, `keyframes`, `transitionIn`, `text` alanlarının içi doğrulanmıyor ve `as unknown as Track[]` ile geçiriliyor.
- **Etki:** `"fps": 0` bir dosya `color=...:r=0` üretir ve export çöker; `"width": 100000` bir dosya FFmpeg'de gigabayt tahsis ettirir; `"duration": -5` timeline motorunda negatif süreli klip yaratır. Otomatik kurtarma da aynı yoldan geçtiği için bozuk bir otomatik kayıt uygulamayı her açılışta kurtarma banner'ına kilitler.
- **Kanıt:**
```ts
typeof project.width !== 'number' || typeof project.height !== 'number' || typeof project.fps !== 'number'
...
tracks: tracks as unknown as Track[],
```
- **Çözüm:** `zod` ya da elle `clampNumber` ile aralıklar: `fps ∈ [1,120]`, `width,height ∈ [16,8192]`, `duration > 0`, `Number.isFinite`. Bozuk otomatik kaydı sil.
```ts
const finite = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
```
- **Düzeltme Eforu:** M
- **Bağımlılık:** `project.test.ts` yeni geçersiz durumlarla genişletilmeli.

### [🟠] 6. `useTimelineStore` God Object
- **Persona:** Kıdemli Yazılım Mimarı
- **Dosya/Konum:** `src/stores/useTimelineStore.ts:223-1228`
- **Kategori:** Mimari
- **Sorun:** Tek `create(...)` çağrısı 1006 satır; 92 eylem (eşik 20). Klip ekleme, bölme, dondurma karesi, efekt, geçiş, keyframe, seçim, otomatik keyframe ve oynatma zamanı aynı dosyada. `addTextClip` 85 satır, `insertFreezeFrame` 70, `addClipFromAsset` 62, `addEffectClip` 52, `addTransition` 51 satır (eşik 50).
- **Etki:** Yeni bir klip türü eklemek (Open/Closed) `addClipFromAsset`, `addTextClip`, `addEffectClip` ve `TimelineEngine.findOrCreateTrackForPlacement` içinde eşzamanlı değişiklik gerektiriyor (Shotgun Surgery). Son turdaki V1 yerleşim düzeltmesi bu yüzden iki dosyaya dokundu.
- **Kanıt:**
```ts
export const useTimelineStore = create<TimelineStoreState>((set, get) => ({
```
(1006 satırlık gövde)
- **Çözüm:** Zustand slice deseni: `createClipSlice`, `createSelectionSlice`, `createKeyframeSlice`, `createEffectSlice`, `createTransitionSlice` dosyaları; ortak `commit(tracks)` yardımcısı. Mantık (`TimelineEngine`) zaten ayrı; eylemler yalnızca bu motoru çağıran ince katman olmalı.
- **Düzeltme Eforu:** XL
- **Bağımlılık:** `useTimelineStore.test.ts` (636 satır) import yolu değişmediği sürece çalışmaya devam eder; dış arayüz aynı kalmalı.

### [🟠] 7. `previewEngine.ts` 971 satır; `drawComposition` 215 satır
- **Persona:** Kıdemli Yazılım Mimarı
- **Dosya/Konum:** `src/core/preview/previewEngine.ts:736`, `:623`, `:971`
- **Kategori:** Mimari
- **Sorun:** `drawComposition` 215 satır, `syncActiveClipsDuringPlayback` 112 satır, `getSelectionGeometry` 67 satır. Sınıf video havuzu, ses, çizim, seçim tutamaçları, yükleme durumu ve oynatma döngüsünü birlikte yönetiyor. Dosya sonunda modül düzeyinde tekil nesne var: `export const previewEngine = new PreviewEngine();`.
- **Etki:** Testler özel metotlara `engine as unknown as {...}` dökümüyle erişiyor (`previewEngine.test.ts`, `setLoading`); bağımlılık enjekte edilemediği için DOM `<video>` oluşturan her test jsdom kuruluma bağlı.
- **Kanıt:**
```ts
export const previewEngine = new PreviewEngine();
```
- **Çözüm:** `VideoPool`, `AudioSync`, `SelectionOverlay`, `CompositionRenderer` sınıflarına böl; `PreviewEngine` yalnızca orkestratör kalsın.
- **Düzeltme Eforu:** L
- **Bağımlılık:** `PreviewPlayer.tsx` ve `effectRenderer.ts`/`chromaRenderer.ts` çağrıları.

### [🟠] 8. Arayüz katmanında ve Rust'ta test yok
- **Persona:** QA / Test Mühendisi
- **Dosya/Konum:** `src/components/**` (15 dosya, 3.570 satır), `src-tauri/src/lib.rs`
- **Kategori:** Test
- **Sorun:** 17 test dosyası var; hepsi `src/core` ve `src/stores` içinde. `Inspector.tsx` (749), `Timeline.tsx` (668), `PreviewPlayer.tsx` (460), `ExportModal.tsx` (329) için test yok; `@testing-library/react` kurulu ama kullanılmıyor. Rust'ta `#[test]` yok. E2E yok. Test piramidi: yaklaşık 250 birim, 0 entegrasyon, 0 e2e. Dosya adı eşleşmesi: 46 kaynak dosyasından 15'inin aynı adlı testi var; kalan 31 dosyanın 15'i bileşen, 6'sı tip dosyası/giriş noktası (`App.tsx`, `main.tsx`, `types/*`); kalan 10'u aynı adlı test taşımıyor: `useAssetStore.ts`, `useProjectStore.ts`, `projectFile.ts`, `projectIO.ts`, `projectSession.ts`, `commandManager.ts`, `effectRenderer.ts`, `chromaRenderer.ts`, `fit.ts`, `logger/index.ts` (son ikisi dışında bazıları `project.test.ts`, `logger.test.ts` gibi farklı adlı testlerle kısmen kapsanıyor). Kapsam yüzdesi ölçülmedi.
- **Etki:** `Timeline.tsx:180` içindeki 82 satırlık `handleMouseMove` (sürükleme, kırpma, yapışma) test dışı; bu yolda bir regresyon QA'ya kadar fark edilmez. Geçen turda bulunan beş QA bulgusunun beşi de arayüz yolundaydı.
- **Çözüm:** (1) `@vitest/coverage-v8` ekle, eşik koy. (2) En kritik 5 fonksiyon için testler: `Timeline` sürükleme hesabı (saf fonksiyona çıkar), `ExportModal` hata yolu, `run_ffmpeg_export` ilerleme ayrıştırıcısı (Rust `#[test]`, `time=00:00:05.20` örnekleri), `findMissingAssetIds` bozuk yol, `parseProjectFile` sınır değerleri.
- **Düzeltme Eforu:** L
- **Bağımlılık:** Bulgu 6-7 refactor'larından önce yazılmalı.

### [🟠] 9. CI/CD ve imzalama yok; `identifier` varsayılan
- **Persona:** SRE / DevOps
- **Dosya/Konum:** `.github/` (yok), `src-tauri/tauri.conf.json:5`, `src-tauri/Cargo.toml:4-6`
- **Kategori:** Production
- **Sorun:** CI yapılandırması yok; `npm test`, `tsc -b`, `oxlint` yalnızca elle çalışıyor. `"identifier": "com.tauri.dev"` Tauri şablonunun varsayılanı; `authors = ["you"]`, `license = ""`. `bundle.targets` `"all"` ve `android` bloğu var ama mobil hedef derlenmiyor. Sürüm `0.1.0` iki yerde elle tutuluyor. Geri alma stratejisi tanımlı değil.
- **Etki:** Test bozan bir commit `feature` dalına girer, kimse fark etmez. `com.tauri.dev` kimliği başka Tauri şablon uygulamalarıyla çakışır (AppData klasörü paylaşımı). İmzasız exe Windows SmartScreen uyarısı verir.
- **Çözüm:** `.github/workflows/ci.yml`: `npm ci`, `tsc -b`, `oxlint`, `vitest run`, `cargo check`. `identifier` → `com.yusufygc.mivid`. Sürümü tek kaynaktan (`package.json`) oku.
- **Düzeltme Eforu:** M
- **Bağımlılık:** Kimlik değişince mevcut kullanıcıların AppData/localStorage verisi taşınmaz (henüz dağıtım yok, maliyet sıfır).

### [🟡] 10. Sessiz varsayılanlar: süre 10 sn, çözünürlük 1920x1080
- **Persona:** QA / Test Mühendisi
- **Dosya/Konum:** `src/stores/useAssetStore.ts:62-185`
- **Kategori:** Test / Hata yönetimi
- **Sorun:** `importFromPath` ve `importFile` metadata okunamazsa `duration = 10.0`, `width = 1920`, `height = 1080` ile devam ediyor; hata yutuluyor (`video.onerror = () => resolve(false)`). `withTimeout` da süre aşımında sessizce varsayılan değeri döndürüyor.
- **Etki:** Bozuk bir 3 dakikalık dosya 10 saniyelik görünür; kullanıcı klibi uzatınca kaynağın ötesine geçer ve export'ta boş kare ya da FFmpeg hatası çıkar. Kullanıcıya hiçbir uyarı gitmiyor.
- **Kanıt:**
```ts
let duration = 10.0;
let width: number | undefined = 1920;
...
video.onerror = () => resolve(false);
```
- **Çözüm:** Hata olursa varlığı eklemeyip `Logger.error` ve kullanıcıya bildirim; ya da `metadataFailed: true` bayrağı ile klip uzatmayı engelle.
- **Düzeltme Eforu:** S
- **Bağımlılık:** `MediaPool.tsx` hata gösterimi.

### [🟡] 11. Nesne URL'i sızıntısı ve `removeAsset` referans kontrolü
- **Persona:** SRE / DevOps
- **Dosya/Konum:** `src/stores/useAssetStore.ts:189`, `:49-56`
- **Kategori:** Bellek
- **Sorun:** `URL.createObjectURL(file)` çağrılıyor, `revokeObjectURL` hiçbir yerde yok (yalnızca `projectIO.ts:64` kendi blob'u için çağırıyor). `removeAsset` asset'i siliyor ama bu asset'i kullanan kliplerin timeline'da kalıp kalmadığına bakmıyor.
- **Etki:** Tarayıcı modunda her içe aktarım dosya boyutunca bellek tutar; 2 GB'lık bir video silindikten sonra da bellekte kalır. Silinen asset'e bağlı klip önizlemede boş, export'ta `asset bulunamadı` verir.
- **Kanıt:**
```ts
const url = URL.createObjectURL(file);
```
- **Çözüm:** `removeAsset` içinde `URL.revokeObjectURL(asset.url)` (yalnızca `blob:` önekli); klip varsa kullanıcıdan onay iste ya da klipleri de sil.
- **Düzeltme Eforu:** S
- **Bağımlılık:** `useTimelineStore` silme eylemi.

### [🟡] 12. Probe için export komutu kötüye kullanılıyor
- **Persona:** Kıdemli Yazılım Mimarı
- **Dosya/Konum:** `src/core/media/probe.ts:20-21`
- **Kategori:** Mimari
- **Sorun:** Sessiz medya tespiti, `run_ffmpeg_export` komutunu `outputPath: path` (kaynak dosyanın kendisi) ve `-i path` ile çağırıp FFmpeg'in "çıktı belirtilmedi" hatasındaki stderr'i okuyarak çalışıyor. Hata mesajı biçimine ve `-y` yokluğuna güveniyor.
- **Etki:** FFmpeg sürümü hata metnini değiştirirse `hasAudio` sessizce yanlış çıkar. Argüman sırası bir gün bozulursa kaynak medyanın kendisi çıktı yolu olduğu için üzerine yazılma riski doğar.
- **Kanıt:**
```ts
await invoke('run_ffmpeg_export', { args: ['-hide_banner', '-i', path], outputPath: path, totalDuration: 1 });
```
- **Çözüm:** Rust'ta `probe_media(path) -> {has_audio, duration, width, height}` komutu (`ffmpeg -i` ya da `ffprobe -show_streams -of json`); Bulgu 1'in doğrulamasıyla birlikte yapılır.
- **Düzeltme Eforu:** M
- **Bağımlılık:** `ExportModal.tsx` ve `probe.test` yoksa yeni test.

### [🟡] 13. Logger yalnızca bellekte; üretim kodunda 10 `console.*`
- **Persona:** SRE / DevOps
- **Dosya/Konum:** `src/core/logger/index.ts:12-60`; `ExportModal.tsx:136`, `MediaPool.tsx:31`, `Timeline.tsx:559`, `chromaRenderer.ts:46`, `previewEngine.ts:96,525,536`, `useAssetStore.ts:84,128,237`; `lib.rs:16,55,85-88,165`
- **Kategori:** Production
- **Sorun:** `Logger` 1000 girişlik bellek tamponu; dosyaya yazmıyor, seviye başlangıçta `DEBUG` sabit. `RULES.md` §2 `console.log` yerine `Logger` kullanımını şart koşuyor ama 10 yerde `console.warn/error` var. Rust `println!` ile her export'ta tüm FFmpeg argümanlarını (kullanıcının dosya yolları) yazıyor.
- **Etki:** Uygulama çökünce (Tauri penceresi kapanınca) tampon yok olur; kullanıcı hata bildirdiğinde elde iz yoktur. Dosya yolları (kullanıcı adı içerir) log çıktısına girer.
- **Çözüm:** Logger'a `tauri-plugin-log` hedefi (dosya) bağla; `console.*` çağrılarını `Logger.warn` ile değiştir; Rust'ta `println!` yerine `log::info!` ve yolları kısalt.
- **Düzeltme Eforu:** S
- **Bağımlılık:** Rust `tauri_plugin_log` yalnızca `debug_assertions` altında aktif (`lib.rs:177`); release'te de açılmalı.

### [🟡] 14. `pushVisualLayer` 168 satır; ID üretimi 8 yerde tekrar
- **Persona:** Kıdemli Yazılım Mimarı
- **Dosya/Konum:** `src/core/export/ffmpegBuilder.ts:171-338`; `keyframes.ts:100`, `logger/index.ts:60`, `timelineEngine.ts:109,169,177`, `useAssetStore.ts:65,188`
- **Kategori:** Kod Kalitesi
- **Sorun:** `pushVisualLayer` fit, backdrop, chroma, renk, keyframe ölçek, döndürme, opaklık ve geçiş mantığını tek fonksiyonda taşıyor (eşik 50). `crypto.randomUUID ? crypto.randomUUID() : fallback` kalıbı 8 yerde kopyalanmış. `timelineEngine.ts:109` kanal ID'si `track-${type}-${Date.now()}`: aynı milisaniyede iki kanal yaratılırsa ID çakışır.
- **Etki:** Yeni bir görsel filtre eklemek `pushVisualLayer`'ın içine girmeyi gerektirir (OCP). Çakışan kanal ID'si bir kanalın kliplerini diğerine karıştırır (şu an tek çağrı yolu olduğu için tetiklenmiyor, ama toplu klip ekleme eklenirse tetiklenir).
- **Çözüm:** `src/utils/id.ts` içinde `newId(prefix?)`; `pushVisualLayer`'ı `fitStage`, `colorStage`, `keyframeStage`, `fadeStage` boru hattına böl (her aşama `string[]` filtre döndürsün).
- **Düzeltme Eforu:** M
- **Bağımlılık:** `ffmpegBuilder.test.ts` (833 satır) çıktı dizesini birebir karşılaştırdığı için aşama sırası korunmalı.

### [🟡] 15. Windows'a sabitlenmiş yollar
- **Persona:** SRE / DevOps
- **Dosya/Konum:** `src/core/export/fonts.ts:1`, `lib.rs:7-12`, `lib.rs:51-75`
- **Kategori:** Production
- **Sorun:** Yazı tipi dizini `C:/Windows/Fonts`, FFmpeg yolu `C:\ffmpeg\...`, "dosya konumunu aç" Windows'ta `explorer`, diğerlerinde `open` (macOS komutu; Linux'ta yok). `bundle.targets` `"all"` ama yalnızca Windows yolları işliyor.
- **Etki:** Linux/macOS derlemesi export'ta ya yazı tipini bulamaz (`fontfile` yolu geçersiz, FFmpeg hata verir) ya da FFmpeg'i bulamaz.
- **Çözüm:** Hedefi şimdilik `["nsis","msi"]` ile Windows'a daralt ya da yazı tipi dizinini Rust'tan (`dirs`) ver; Linux için `xdg-open`.
- **Düzeltme Eforu:** M
- **Bağımlılık:** Bulgu 3 sidecar kararı.

### [🟡] 16. Eksik bağımlılık dizisi uyarıları
- **Persona:** QA / Test Mühendisi
- **Dosya/Konum:** `src/components/preview/PreviewPlayer.tsx:307`, `src/components/timeline/Timeline.tsx:182`
- **Kategori:** Kod Kalitesi
- **Sorun:** `oxlint` iki `react-hooks/exhaustive-deps` uyarısı veriyor: `handleSeek`, `handleTogglePlay` (PreviewPlayer) ve `updateTimeFromPointer`, `getAllSnapPoints` (Timeline). Efekt ilk render'daki fonksiyon sürümüne bağlı kalıyor. Ayrıca `ClipVisuals.tsx:34,46` iki yerde kuralı `eslint-disable` ile susturuyor.
- **Etki:** Klavye kısayolu ya da sürükleme sırasında klip listesi değiştiyse eski kapanıştaki veriyle çalışır; yapışma noktaları güncel olmaz.
- **Çözüm:** Fonksiyonları `useCallback` ile sar ve bağımlılık dizisine ekle, ya da `useRef` ile en güncel sürümü tut.
- **Düzeltme Eforu:** S
- **Bağımlılık:** Bulgu 8 (testsiz alan); düzeltmeden önce sürükleme hesabını saf fonksiyona çıkarıp test et.

### [🟡] 17. Dokümantasyon çelişkileri
- **Persona:** Kıdemli Yazılım Mimarı
- **Dosya/Konum:** `docs/NEXT_SESSION.md:69,75` ve `:14`
- **Kategori:** Dokümantasyon
- **Sorun:** §1 resim/sticker desteğini tamamlandı olarak yazıyor; §5 satır 69 "Resim klipleri hiç çizilmiyor" ve satır 75 "Resim klipleri export'ta `-loop` almıyor" diyor. İki satır eski ve birbirine bile aykırı. `docs/ARCHITECTURE.md` bu turlarda güncellenmedi (değişen dosya listesinde yok).
- **Etki:** Sonraki oturum bu satırlara güvenip tamamlanmış işi yeniden yapar.
- **Çözüm:** Satır 69 ve 75'i sil; `ARCHITECTURE.md`'ye `fonts.ts`, `fit.ts`, `regionEffects.ts`, oto keyframe ve resizable timeline ekle.
- **Düzeltme Eforu:** S
- **Bağımlılık:** Yok.

### [🟡] 18. Methodoloji uyumsuzluğu: wiki yok, commit'lerde AI referansı
- **Persona:** Kıdemli Yazılım Mimarı
- **Dosya/Konum:** `docs/wiki/` (yok), `CLAUDE.md` (yok), son 6 commit
- **Kategori:** Süreç
- **Sorun:** `AI-Gelistirme-Metodolojisi.md` §1 `docs/wiki/{index,log,rules}.md` ve `CLAUDE.md` ister; depoda yok (`docs/` altında `RULES.md`, `TODO.md`, `NEXT_SESSION.md`, `ARCHITECTURE.md` var). §6 "Co-Authored-By" satırını yasaklıyor; `git log -n 6` altı commit'in altısında da bu satır var. Commit `3723a25` benim ürettiğim ve aynı satırı taşıyor; harness yapılandırması bu satırı istiyor, doküman yasaklıyor.
- **Etki:** Her oturum projeyi `NEXT_SESSION.md`'den yeniden keşfediyor; `log.md` olmadığı için kararlar commit mesajlarına gömülü. Commit geçmişi methodoloji kuralını ihlal ediyor.
- **Çözüm:** `docs/wiki` iskeleti + kısa `CLAUDE.md` (index'e giriş kapısı) aç; mevcut `docs/*.md` içeriğini wiki sayfalarına taşı. Commit satırı için karar ver: kural geçerliyse `git rebase` ile son 6 commit mesajı temizlenir (push yapılmadığı için güvenli).
- **Düzeltme Eforu:** S (iskelet), M (içerik taşıma)
- **Bağımlılık:** Yeniden yazma `3723a25` dahil 6 commit'in hash'ini değiştirir.

## Bölüm E — Aksiyon planı

### 🚨 24 saat içinde

1. **Bulgu 1: komut doğrulaması.** Eylem: `validate_args` ile çıktı yolu ve bayrak beyaz listesi. Sonuç: arayüzden gelen rastgele argüman reddedilir. Bağımlılık: yok. Risk: meşru bir export bayrağı listeden çıkarsa export "geçersiz argüman" verir; `ffmpegBuilder.test.ts` çıktısındaki tüm bayraklar listeye eklenerek doğrulanır.
2. **Bulgu 2: CSP ve asset kapsamı.** Eylem: `csp` yaz, `scope`'u dinamik yap. Sonuç: webview dış kaynağa bağlanamaz, diskin tamamı okunamaz. Bağımlılık: Tauri yeniden derleme (C++ iş yükü). Risk: CSP dev sunucusunu keserse `devCsp` ile ayrılır; medya önizlemesi `asset:` kapsamı eksikse siyah kalır, ilk elle test Tauri'de yapılır.
3. **Bulgu 5: proje dosyası aralık doğrulaması.** Eylem: sayısal aralıklar ve bozuk otomatik kayıt temizliği. Sonuç: `fps=0` dosya reddedilir. Bağımlılık: `project.test.ts`. Risk: eski kayıtlar sınır dışı değer içeriyorsa reddedilir; ilk sürümde yalnızca 0/negatif/`NaN` reddedilir.

### 📅 Bu hafta

1. **Bulgu 3: FFmpeg sidecar.** Eylem: `externalBin` ve sidecar çağrısı. Sonuç: temiz makinede export çalışır. Bağımlılık: FFmpeg lisans seçimi. Risk: paket boyutu 80-130 MB artar.
2. **Bulgu 4: export iptali.** Eylem: `child` durumu, `cancel_export`, `spawn_blocking`. Sonuç: iptal düğmesi çalışır. Bağımlılık: `ExportModal`. Risk: kill sonrası yarım `.mp4` kalır; silme adımı eklenir.
3. **Bulgu 9: CI.** Eylem: GitHub Actions iş akışı + `identifier`. Sonuç: her push'ta test çalışır. Bağımlılık: GitHub deposu. Risk: Windows runner'da Rust derlemesi 8-12 dk sürer.
4. **Bulgu 12 + 13: `probe_media` komutu ve Logger dosyası.** Sonuç: probe metin ayrıştırmaya bağımlı kalmaz. Bağımlılık: Bulgu 1. Risk: `ffprobe` yoksa `ffmpeg -i` yedeği tutulur.
5. **Bulgu 10 + 11: metadata hata yolu ve `revokeObjectURL`.** Sonuç: hatalı medya kullanıcıya bildirilir. Bağımlılık: `MediaPool`. Risk: bildirim eklemek mevcut içe aktarma akışını yavaşlatmaz, ama hata gösteren dosyalar listeden düşer.

### 🗓 Bu ay

1. **Bulgu 8: testler.** `coverage-v8`, `Timeline` sürükleme hesabını saf fonksiyona çıkarma, Rust `#[test]`. Risk: çıkarma sırasında sürükleme davranışı değişir; önce davranış testi yazılır.
2. **Bulgu 6: `useTimelineStore` slice bölünmesi.** Risk: 92 eylemin dış arayüzü korunmazsa tüm bileşenler kırılır; bölünme dosya içi taşıma ile başlar.
3. **Bulgu 7: `previewEngine` ayrıştırma.** Risk: oynatma senkronu; her ayrıştırma adımından sonra tarayıcı QA'sı.
4. **Bulgu 14 + 15 + 16: `pushVisualLayer` boru hattı, platform yolları, hook uyarıları.** Risk: export çıktısı dizesi değişir; `ffmpegBuilder.test.ts` birebir karşılaştırıyor.
5. **Bulgu 17 + 18: doküman düzeltmeleri, wiki iskeleti, `CLAUDE.md`.** Risk: commit yeniden yazımı hash değiştirir; push öncesi yapılmalı.

## Bölüm F — Sonraki adım

Hangi bulgudan başlamak istersin? Seçtiğin maddenin detaylı refactor planını, etkilenecek dosyaları ve örnek "before/after" kodunu üretebilirim.
