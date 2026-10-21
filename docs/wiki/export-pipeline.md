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

## Karar ve kurallar

- **Easing/ifade paritesi:** `buildKeyframeExpr` ile TS `evaluateProp` aynı `p*p*(3-2*p)` eğrisini kullanır. Chroma key formülü (`src/core/chroma/chromaKey.ts`) gerçek ffmpeg çıktısıyla karşılaştırılarak doğrulandı: `f = 1 - clamp((fark - benzerlik)/blend, 0, 1)`, `alfa = 1 - f²`.
- **Yazı tipi:** `drawtext` CSS yazı ailesini bilmez. `fonts.ts` ailenin ilk adını ve kalınlık/italik durumunu Windows yazı tipi dosyasına çevirir (`C:/Windows/Fonts/impact.ttf` vb.; bilinmeyen aile Arial) ve `fontfile='C\:/Windows/Fonts/…'` olarak yazılır. `fontDirectory: null` ise yazılmaz. Bu aynı zamanda proje köküne konan fontconfig'siz FFmpeg derlemesinin çökmesini önler.
- **Metin kaçışı** (`escapeFFmpegText`): `\`, `'`, `:`, `%` kaçırılır, satır sonu boşluğa çevrilir (çok satırlı metin export'ta tek satır, [[known-issues]]).
- **Sessiz medya:** masaüstünde export öncesi `probeUsedAssets` her kullanılan dosyayı `probe_media` ile sorar; `hasAudio: false` ise `[i:a]` istenmez (aksi halde "matches no streams" hatası).
- **FFmpeg sürümü:** Rust önce `C:\ffmpeg\bin\ffmpeg.exe` (9.0.2) sonra göreli yolları dener. Elle export testinde de bu sürüm kullanılır ([[qa-playbook]]).
- **Performans:** animasyonlu opaklık ve bölge maskesi `geq` kullanır (1080p, 3 sn için yaklaşık 1,7 sn). 4K ve uzun kliplerde ölçülmedi.
- **Sözleşme testi:** `src/core/export/guardFixtures.test.ts` her özellik için gerçek builder çıktısını `src-tauri/tests/fixtures/export_args.json`'a yazar; kullanılan filtre ve bayrak listesi snapshot'ta tutulur. Builder yeni filtre/bayrak kullanırsa bu test kırılır ve Rust `ALLOWED_FILTERS` listesi bilinçli güncellenir.

## Testler

`ffmpegBuilder.test.ts` (53+ test): dize eşleşmesiyle her özellik (keyframe, renk, bölge efekti, fit, katman sırası, resim, chroma, dondurma, ses, yazı tipi, döndürme). Görsel doğrulama gerçek ffmpeg ile karelerde yapılır.
