# Export Hattı (FFmpeg)

`src/core/export/ffmpegBuilder.ts` (`FFmpegCommandBuilder.buildExportCommand`) proje, kanallar ve medya listesinden tek bir `filter_complex` komutu üretir; Rust komutu doğrulayıp çalıştırır ([[desktop-security]]). Model: [[timeline-model]]. Önizleme eşleşmesi: [[preview-engine]].

## Çıktı

`buildExportCommand(project, tracks, assets, { outputPath, preset?, audioBitrate?, fontDirectory? })` → `{ args, filterComplex, actualDuration }`.

Argüman sırası: `-y`, girdiler (`-i yol`; resim için önce `-loop 1 -framerate fps -t süre`), `-filter_complex`, `-map [video]`, (ses varsa `-map [final_a] -c:a aac -b:a 192k`), `-c:v libx264 -preset <p> -pix_fmt yuv420p -t <süre>`, çıktı yolu. Rust doğrulayıcı tam olarak bu bayrak kümesini bekler.

`actualDuration` = en geç biten klibin sonu (proje süresi değil).

## Grafın yapısı

1. Taban: `color=c=<arka plan>:s=WxH:r=fps:d=süre[base_v]`.
2. **Görsel katmanlar** (`pushVisualLayer`), `zIndex` sonra kanal sırasına göre (alt kanal önce çizilir, üst kanal üstte):
   `trim` → `setpts` → `format=yuva420p` → (chroma key) → (`eq` renk) → (`fit`: `scale…decrease/increase` + `pad`/`crop`) → ölçek (sabit ya da keyframe'li `scale` ifadesi, `eval=frame`) → `rotate` → opaklık (`colorchannelmixer` / animasyonluysa `geq`) → geçiş `fade` → `overlay=x:y:enable='between(t,a,b)'`.
   Bulanık arka plan: kaynak `split`, bir kol `increase,crop,gblur` ile tuvali doldurur ve klibin altına bindirilir.
   Dondurma karesi: `trim`+`select='eq(n,0)'`+`loop`.
3. **Bölge efektleri** (`pushRegionEffect`): video katmanlarından sonra, metinlerden önce. `split` → efektli kopya (`gblur`, mozaik için `scale` küçült/büyüt `neighbor`, siyah kutu `drawbox`) → `geq` ile üretilmiş şekil maskesi (`color` kaynağı, klip süresi kadar) → `alphamerge` → `overlay`. Konum/ölçek keyframe'leri maske ifadesine girer.
4. **Metin**: doğrudan `drawtext`; döndürme ya da animasyon varsa şeffaf metin katmanı üretilip normal katman gibi bindirilir.
5. **Ses**: klip başına `atrim` → `asetpts` → (`afftdn`) → (`afade` giriş/çıkış) → `atempo` zinciri (hız) → `volume` → `adelay`; hepsi `amix=normalize=0`. Metin, efekt, resim, dondurma kareleri ve `asset.hasAudio === false` olan medya ses döngüsünde atlanır.

## Geçişler (`pushVisualLayer`)

Ortak mantık `src/core/transitions/transitions.ts` (önizleme ile aynı sayılar ve formüller).

- **Doğrusal** dissolve / kararma: FFmpeg `fade` (çıktı eskisiyle aynı).
- **Piksel gerektirenler** (wipe, iris, blur, zoom'un alfası, `ease-in-out` dissolve): katman proje boyutuna getirilir (`framed_i`), `split` ile baş / orta / kuyruk parçalarına ayrılır, her parça `trim` ile kendi zaman aralığına kesilir ve kendi `overlay=enable='between(t,a,b)'`'i ile bindirilir. `geq` (alfa çarpanı, `T` = zaman damgası) ve `gblur` yalnızca geçiş penceresindeki karelerde çalışır; `concat` kullanılmaz.
  - wipe: `gte(X,W*(1-(E)))` / `lt(X,W*(E))` (yöne göre, `wipeKeep`); iris: `lt(hypot(X+0.5-W/2,Y+0.5-H/2),(E)*hypot(W/2,H/2))`; blur: sabit sigma (kare yüksekliğinin %2,5'i) + alfa; E = `easedExpr(progressExpr(...))`.
- **slide:** overlay `x`/`y` ifadesine yön ve easing'li terim, parantez içinde (`+(-W*(...))`; FFmpeg `+-` yazımını reddeder).
- **zoom:** ölçek ifadesi `(1+0.5*(1-(E)))` çarpanıyla `eval=frame` yoluna girer.
- **flash:** `color=c=white` tek kare katmanı, `geq` ile yalnızca alfa (`255*(1-(E))`), geçiş penceresinde klibin üstüne bindirilir.
- Arka plan bulanıklığı (backdrop) dissolve, kararma, zoom ve blur'da doğrusal `fade` ile klibi izler; slide/wipe/iris'te maskelenmez ([[known-issues]]).

## Efektler (`pushRegionEffect`)

- İşlenmiş kopya + maske + `alphamerge` + `overlay` hattı aynı; yeni: **ters** (maske, siyah şekil beyaz zeminde: tek kare `geq lum='255-lum(X,Y)'`), **tüm kare** (maske hattı atlanır), **güç animasyonu** (kopya ve maske `split=N`, dilim başına `trim` ve kendi sigma / blok / çekirdek değeri).
- **tint:** renk katmanı (`color` + `colorchannelmixer=aa`) kopyanın üstüne `overlay` (drawbox alfa'yı yok sayar, aşağıda).
- **sharpen:** `format=gbrp,convolution=0m='k':1m='k':2m='k',format=yuv420p`; `k` önizlemenin SVG çekirdeğiyle aynı 3x3 (`sharpenKernel`).
- **vinyet:** kendi formülümüz (`vignetteAlpha`): siyah `color` tek kare + `geq` alfa (`pow(clip(...),2)`) + `loop`, dilim süresince `overlay`. FFmpeg'in `vignette` filtresi kullanılmaz.

## FFmpeg tuzakları (ölçülerek bulundu)

- `drawbox=...:color=renk@alfa:t=fill` alfa'sız karede (yuv420p, yuva420p dahil) alfa'yı **yok sayar**: tam opak doldurur. Yarı saydam katman için `color` + `format=yuva420p` + `colorchannelmixer=aa` + `overlay` kullanın.
- Siyah/beyaz katmanı `geq=lum=0` gibi sabit değerle yazmayın: yuv sınırlı aralığında siyah 16, beyaz 235'tir; 0 / 255 kısmi alfa'da RGB'de fazladan koyulaşma / parlama verir. Renk kaynağını `color=c=black|white` bırakıp `geq` ile yalnızca alfa'yı hesaplayın (`lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)'`).
- `gblur` sigma'sı ifade almaz (kare başına animasyon yok): güç animasyonu dilimli, geçiş bulanıklığı sabittir.

## Karar ve kurallar

- **Easing/ifade paritesi:** `buildKeyframeExpr` ile TS `evaluateProp` aynı `p*p*(3-2*p)` eğrisini kullanır. Chroma key formülü (`src/core/chroma/chromaKey.ts`) gerçek ffmpeg çıktısıyla karşılaştırılarak doğrulandı: `f = 1 - clamp((fark - benzerlik)/blend, 0, 1)`, `alfa = 1 - f²`.
- **Yazı tipi:** `drawtext` CSS yazı ailesini bilmez. `fonts.ts` ailenin ilk adını ve kalınlık/italik durumunu Windows yazı tipi dosyasına çevirir (`C:/Windows/Fonts/impact.ttf` vb.; bilinmeyen aile Arial) ve `fontfile='C\:/Windows/Fonts/…'` olarak yazılır. `fontDirectory: null` ise yazılmaz. Bu aynı zamanda proje köküne konan fontconfig'siz FFmpeg derlemesinin çökmesini önler.
- **Metin kaçışı** (`escapeFFmpegText`): `\`, `'`, `:`, `%` kaçırılır, satır sonu boşluğa çevrilir (çok satırlı metin export'ta tek satır, [[known-issues]]).
- **Sessiz medya:** masaüstünde export öncesi `probeUsedAssets` her kullanılan dosyayı `probe_media` ile sorar; `hasAudio: false` ise `[i:a]` istenmez (aksi halde "matches no streams" hatası).
- **FFmpeg sürümü:** Rust önce uygulama klasöründeki `ffmpeg.exe`, sonra `C:\ffmpeg\bin\ffmpeg.exe` (9.0.2), sonra PATH'i dener. Kodlayıcı: `ExportOptions.videoEncoder` (`libx264` + `-preset`, ya da LGPL build için `h264_mf` + `-b:v`, varsayılan `defaultVideoBitrate`). Elle export testinde de bu sürüm kullanılır ([[qa-playbook]]).
- **Performans:** animasyonlu opaklık ve bölge maskesi `geq` kullanır (1080p, 3 sn için yaklaşık 1,7 sn). 4K ve uzun kliplerde ölçülmedi.
- **Sözleşme testi:** `src/core/export/guardFixtures.test.ts` her özellik için gerçek builder çıktısını `src-tauri/tests/fixtures/export_args.json`'a yazar; kullanılan filtre ve bayrak listesi snapshot'ta tutulur. Builder yeni filtre/bayrak kullanırsa bu test kırılır ve Rust `ALLOWED_FILTERS` listesi bilinçli güncellenir.

## Testler

`ffmpegBuilder.test.ts` ve `ffmpegBuilder.fx.test.ts`: dize eşleşmesiyle her özellik (keyframe, renk, bölge efekti, fit, katman sırası, resim, chroma, dondurma, ses, yazı tipi, döndürme, geçişler, yeni efektler).

**Gerçek FFmpeg ile parite testleri** (isteğe bağlı: `FFMPEG_PARITY=1 npx vitest run src/core/export`): `transitionParity.test.ts` iki düz renkli klip (kırmızı/mavi + beyaz çubuk) üretip her geçişin ortasındaki kareyi önizleme formülleriyle ölçer (wipe sınır sütunu 4 yönde ±3 px, iris yarıçapı, dissolve alfa, slide ofseti, zoom çubuk genişliği, blur yumuşaması, flash beyazlığı); `effectParity.test.ts` çizgili klipte blur'ün bölge içi/dışı/ters/tüm kare, güç animasyonunun dilimleri, tint rengi, sharpen çekirdeği (RGB 3x3 evrişimiyle ±8) ve vinyet profilini (`vignetteAlpha`, ±7) ölçer.
