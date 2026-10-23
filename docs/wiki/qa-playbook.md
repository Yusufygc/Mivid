# QA Tarifi (tarayıcıda elle + gerçek ffmpeg ile export)

Birim testleri mantığı korur; arayüz ve export çıktısı bu tarifle denenir. Doğrulama kuralları: [[rules]]. Export: [[export-pipeline]]. Önizleme: [[preview-engine]]. Bilinen sınırlar: [[known-issues]].

## 1. Tarayıcıda uygulamayı açmak

1. Geçici `.claude/launch.json` (commit edilmez): `{"version":"0.0.1","configurations":[{"name":"vite","runtimeExecutable":"npm","runtimeArgs":["run","dev"],"port":5173}]}`; `preview_start vite` ya da `npm run dev` ve `http://localhost:5173`.
2. Önceki oturumdan otomatik kayıt varsa "Önceki oturumdan kaydedilmemiş bir proje bulundu" şeridi çıkar: **Yoksay**. (Blob medya yeniden açılamaz.)
3. Tauri API'si tarayıcıda yok: dosya seçici yerine gizli `input[type=file]` kullanılır; dışa aktarma "Export Bilgisini Al" modunda komutu gösterir.

## 2. Gerçek medya yüklemek

Kaynak videolar `C:\Users\yusuf\Videos\InstagramIcerık\2-Reels kaynak videoları` altında. Tarayıcıya dosya vermek için geçici bir CORS'lu statik sunucu (bu klasörü dosya adıyla sunan küçük bir `node` betiği, ör. port 8099) açılır ve sayfada:

```js
const b = await fetch('http://localhost:8099/' + encodeURIComponent(ad)).then(r => r.blob());
const dt = new DataTransfer(); dt.items.add(new File([b], ad, { type: 'video/mp4' }));
const inp = document.querySelector('input[type=file]'); inp.files = dt.files;
inp.dispatchEvent(new Event('change', { bubbles: true }));
```

Medya havuzundaki "Zaman Çizelgesine Ekle" ile klip eklenir. Playhead'i bir klibin sonuna götürüp eklemek klibi V1'e arkaya koyar; aynı anda eklenen ikinci klip V1 doluysa overlay'e düşer ([[timeline-model]]).

## 3. Fareyle kullanım ipuçları

- Pencere genişliği değişince ekran görüntüsü ölçeği ve tıklama koordinatı ayrışabilir: önce `find`/`read_page` ile `ref` al, `scroll_to` ile görünür yap, kaydırıcıları `form_input` ile ayarla; koordinat gerekiyorsa taze ekran görüntüsünden al.
- Inspector bölümleri uzun: `scroll_to` ile kaydır (fare tekerleği güvenilir değil).
- Önizlemede bölge çizmek, metni sürüklemek ve Oto keyframe gerçek fare sürüklemesiyle denenir.
- Yükleme göstergesi yerel diskte görünmeyecek kadar hızlı geçer; yalnızca birim testli.

## 4. Projeyi dışarı almak

`showSaveFilePicker`'ı sahte bir yazıcıyla değiştirip `Ctrl+Shift+S` (Farklı kaydet) olayını gönderin; yazılan JSON'u yerel bir alıcıya (ör. port 8098) POST edin:

```js
let captured; window.showSaveFilePicker = async o => ({ name: o.suggestedName,
  createWritable: async () => ({ write: async d => { captured = d; }, close: async () => {} }) });
window.dispatchEvent(new KeyboardEvent('keydown', { key: 'S', ctrlKey: true, shiftKey: true, bubbles: true }));
await fetch('http://localhost:8098/', { method: 'POST', body: captured });
```

## 5. Başsız (headless) export ve doğrulama

1. Geçici vitest dosyası (`src/core/export/zz_qa.test.ts`, **commit edilmez**): proje JSON'unu okur, asset adlarını gerçek yollara eşler, `ffmpeg -i` çıktısından `parseHasAudio` ile `hasAudio` doldurur, `FFmpegCommandBuilder.buildExportCommand` çağırır, `args` ve grafı dosyaya yazar. Vitest'te `process.env.QA_DIR` ile çıktı klasörü verilir.
2. Argümanları `C:\ffmpeg\bin\ffmpeg.exe` ile çalıştırın (proje kökündeki `ffmpeg.exe` fontconfig'siz, `drawtext`'te çöker).
3. Çıktıyı doğrulayın: süre ve fps (`ffmpeg -i`), karelerden bir şerit (`-ss t -frames:v 1`, `hstack`), gerçek kare karşılaştırması.
4. **Sayısal doğrulama örneği:** keyframe'li zoom için çıktı karesini kaynak karenin farklı ölçeklerde büyütülmüş ve aynı renk ayarlı sürümüyle `psnr` ile karşılaştırın; en yüksek değer beklenen ölçekte çıkmalı (1,285x için 34,9 dB, diğer ölçekler 17-19 dB). Gözle karşılaştırma yanıltabilir.

## 5b. Önizleme ile export'u sayısal karşılaştırma

Aynı projeyi önizlemede ve export'ta aynı anda karşılaştırmak için: sayfada `window.__grid()` benzeri bir yardımcı canvas'ı 6x8 hücreye böler, hücre ortalamalarını (RGB) ve ekrandaki zamanı (`dk:sn:kare` → saniye) döndürür; sonuç yerel bir alıcıya (`POST /grid_<ad>`) gönderilir. Betik aynı zamanın export karesini `ffmpeg -ss t -vf scale=6:8:flags=area -f rawvideo` ile alıp 48 hücrenin farkını hesaplar. Ölçülen: tint, sharpen, wipe, iris, vinyet ve ters blur için ortalama mutlak fark 2-3,3 / 255 (video çözme ve kodlama toleransı). Zaman çubuğunda manyetik yapışmayı kapatın, yoksa playhead klip kenarlarına atlar.

**Opt-in FFmpeg parite testleri:** `FFMPEG_PARITY=1 npx vitest run src/core/export` iki sentetik klipte geçişleri ve çizgili klipte efektleri gerçek ffmpeg karelerinde ölçer (`transitionParity.test.ts`, `effectParity.test.ts`, `FFMPEG_BIN` ve `QA_DIR` ile yollar değiştirilebilir). Export builder ya da önizleme formülleri değişince çalıştırın.

**Dikkat:**
- Vite çalışırken `effectRenderer.ts` gibi çekirdek modülleri düzenlemek HMR ile motoru yeniden oluşturur; önizleme eski canvas'ta donar. Sayfayı yeniden yükleyin (blob medya gider, projeyi yeniden kurun).
- Ekran görüntüsü uygulamadan gecikebilir: bir tıklamadan sonra 2 sn bekleyip yeniden alın ya da durumu JavaScript ile okuyun.
- Klavye ok tuşları odak bir kutu ya da kaydırıcıdaysa playhead'i oynatmaz (kaydırıcıyı değiştirir); önce odağı bırakın (Escape) ya da "1 sn" düğmelerini kullanın.
- Masaüstü (Tauri) penceresi bu yöntemle sürülemez; native pencereyi kullanıcı elle dener.

## 6. Bu yöntemle doğrulanamayanlar

Tauri diyalogları, `probe_media`, izin listesi, CSP etkisi, `minWidth/minHeight`, gerçek WebView2 davranışı. Bunlar `npm run desktop` ile elle denenir ([[next-session]], [[desktop-security]]).

## 7. Temizlik listesi

Sunucuları (8099, 8098) kapat, `.claude/launch.json`, `public/qa-*` ve `zz_*.test.ts` dosyalarını sil, `resize_window preset desktop` ile pencere emülasyonunu sıfırla, `preview_stop` ile vite'ı durdur.
