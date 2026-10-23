# Önizleme Motoru

`src/core/preview/previewEngine.ts` (971 satır, modül düzeyinde tekil `previewEngine`) klipleri bir `<canvas>` üzerine çizer; `PreviewPlayer.tsx` bunun arayüzüdür. Model: [[timeline-model]]. Export karşılığı: [[export-pipeline]]. Mimari: [[architecture]].

## Zamanlama

- Oynatma sırasında ana saat, aktif ilk video ya da ses klibinin medya elemanının saatidir ("master hardware clock"): `playhead = klip.startTime + (el.currentTime - inPoint) / speed`, böylece görüntü ve ses kaymaz. Aktif medya yoksa (klipler arası boşluk) saat `requestAnimationFrame` zaman farkıyla ilerler. Proje süresine gelince oynatma durur ve başa sarar. Döngü `render` içinde `drawComposition` ile her karede çizer.
- `videoPool`: asset başına **tek** `<video>` elemanı. Aynı asset'in iki klibi aynı anda aktifse eleman paylaşılır ve çakışır ([[known-issues]]). Ses için ayrı `<audio>` elemanları.
- Seek/kare hazır değilse (`srcW === 0` ya da `readyState < 2`) motor `waitingForPicture` sayar ve **yükleme durumu** yayar (`getIsLoading`, `subscribeLoading`). Arayüz 250 ms gecikmeyle "Görüntü yükleniyor…" gösterir; hızlı çözülen kareler titretmez.

## Çizim sırası (`drawComposition`)

1. Aktif klipler `getActiveClipsAtTime` ile bulunur: kanallar tersten gezilir, `zIndex`'e göre sıralanır, yani **üst kanal üstte**.
2. Görsel klipler (video/resim): `fitRect` ile `fit` moduna göre yerleştirilir; `backdropBlur > 0` ise klibin altına tuvali dolduran bulanık kopya çizilir; sonra renk ayarı (canvas filter), chroma key, transform (`resolveTransform`) ve **geçişler**: `combineTransitionVisuals` alfa, kayma ofseti (`dx`, `dy`), zoom ölçeği, wipe dikdörtgeni / iris dairesi (`ctx.clip()`, katman koordinatında), geçiş bulanıklığı ve flaş verir; flaş klip çizildikten sonra tüm karenin üstüne beyaz `fillRect` olarak gelir.
3. **Efekt klipleri** (blur, mozaik, siyah kutu, renk tonu, keskinleştir, vinyet): `effectRenderer.ts` ana canvas'ın işlenmiş kopyasını şekil maskesiyle geri çizer (`destination-in`; **ters** modda `destination-out`; **tüm kare**/vinyette maske yok). Güç, `effectStrengthAt` ile 0,2 sn'lik dilimler halinde okunur. Video katmanlarının üstünde, metinlerin altında.
   - blur: kenar pikselleri tekrarlanan dolgulu bir canvas bulanıklaştırılır (düz canvas blur'ü kenarda saydamlığa solup koyu çerçeve bırakır; FFmpeg `gblur` kenarı tekrarlar).
   - tint: kopyanın üstüne renk katmanı (`tintAlpha`); sharpen: `ctx.filter` ile SVG `feConvolveMatrix` (export ile aynı 3x3 çekirdek, okuma gerekmez); vinyet: `vignetteAlpha` değerlerinden 24 duraklı radyal gradyan.
4. Metin klipleri (animasyon, kenarlık, gölge, kutu).
5. Seçili klip için tutamaç katmanı (`drawSelectionOverlay`).

Resim klipleri `<img>` elemanlarıyla çizilir (`getOrCreateImageElement`); `<video>` kullanılmaz.

## Etkileşim

- Tutamaç geometrisi `getSelectionGeometry`, vuruş testi `hitTest`/`hitHandle`, sürükleme matematiği `handleMath.ts`: taşıma, köşeden ölçekleme, döndürme; efekt kliplerinde köşe sürükleme **bölgeyi yeniden boyutlar** (karşı köşe sabit) ve döndürme tutamacı gizlidir.
- Önizleme canvas'ında sürükleme `updateClipTransform` üzerinden gider; keyframe'li ya da **Oto keyframe** açıksa playhead'e keyframe yazılır ([[timeline-model]]).
- "Bölge" araç satırı (Blur, Mozaik, Siyah Kutu): önizlemede dikdörtgen sürüklenince efekt klibi oluşur, seçilir, araç kapanır; Esc iptal eder.

## Bilinen farklar (preview ile export)

- **Blur kenarı:** önizlemede kenar yumuşatma bulanık maske, export'ta aynı sigmalı `gblur`'lu şekil; gaussian ikisi de ama piksel düzeyinde birebir değil.
- **Chroma key:** önizleme 960 px genişliğe indirilmiş yazılım işlemesi (kare başı yaklaşık 10 ms), formül FFmpeg ile aynı; FFmpeg 3x3 komşuluk ortalaması ve gerçek YUV matrisi kullandığı için kenarda yaklaşık 0,1 alfa farkı olabilir. Tauri asset protokolünden gelen video canvas'ı kirletirse `getImageData` hata verir; kod yakalar ve anahtarsız çizer (önizlemede perde silinmez, export çalışır). Bulanık arka plan chroma'dan önceki kaynağı kullanır.
- Önizlemede `denoise` yok.

Ayrıntılı liste: [[known-issues]].
