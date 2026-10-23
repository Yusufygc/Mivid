# Timeline ve Klip Modeli

Veri modeli (`src/types/timeline.ts`), yerleşim kuralları, keyframe sistemi, geri alma ve proje dosyası. Mimari: [[architecture]]. Çizim: [[preview-engine]]. Export: [[export-pipeline]].

## Kanallar (Track)

- Tipler: `video`, `overlay`, `audio`, `text`, `effect`. Varsayılan sıra (üstten alta): `Metin / Başlık (T1)`, `Video 2 (Overlay / PiP)`, `Ana Video (V1)`, `Ses / Müzik (A1)`.
- **Üstteki kanal üstte çizilir** (önizleme ve export). Aynı kanal içinde önce `transform.zIndex`, sonra kanal sırası belirler (`TimelineEngine.getActiveClipsAtTime`, export `layers`).
- **Yerleşim** (`TimelineEngine.findOrCreateTrackForPlacement`): önce uygun tipteki **boş** kanal; video için **ana video kanalı (V1) overlay'den önce** denenir. Hepsi doluysa yeni kanal açılır (`track-<tip>-<Date.now()>`, adı `Video N (VN)` vb.). Efekt kanalları metinlerin altında, videoların üstünde durur.
- Kanal bayrakları: `isMuted`, `isLocked`, `isHidden`.

## Klip alanları

Zorunlu: `id`, `trackId`, `assetId`, `name`, `type` (`video|audio|image|text|effect`), `startTime`, `duration` (timeline saniyesi), `inPoint`, `outPoint` (kaynak saniyesi), `speed` (0.25x-4x), `transform`, `audio`.

- `duration = (outPoint - inPoint) / speed`. Export kaynak süresi için `duration * speed` kullanır; `outPoint`'e güvenilmez.
- `transform`: `x, y` (tuval merkezine göre piksel), `scaleX, scaleY`, `rotation` (derece), `opacity` (0-1), `zIndex`.
- `audio`: `volume` (0-2), `muted`, `fadeIn`, `fadeOut`, `denoise?` (export'ta `afftdn`, önizlemede yok).
- `text?`: içerik, yazı tipi ailesi/boyut/kalınlık/italik, hizalama, `stroke`, `shadow`, `backgroundBox`, `animation` (`typewriter|slide|zoom` / `fade`).
- `transitionIn?`/`transitionOut?`: `Transition { type, duration, direction?, easing? }`. Tipler: `cross-dissolve | fade-to-black | slide | wipe | iris | zoom | flash | blur`. `direction` (`left|right|up|down`) yalnızca slide ve wipe için; `easing` tanımsızsa doğrusal (eski projeler değişmez), yeni geçiş `ease-in-out`. Süre 0,2-3 sn ve komşu klip sürelerinin yarısıyla sınırlı (`clampTransitionSeconds`). Mantık: `src/core/transitions/transitions.ts` ([[preview-engine]], [[export-pipeline]]).
- **Geçiş bindirmesi:** geçiş eklenince klip komşusunun üstüne `süre` kadar bindirilir (giriş: klip sola, çıkış: sonraki klip sola) ve **arkasındaki bütün klipler aynı miktarda kayar** (ripple), böylece uçta boşluk kalmaz. `updateTransition` süreyi değiştirince bindirme süreye eşit kalır; `removeTransition` zamanı geri verir. Komşuya bitişik değilse (arada boşluk) hiçbir klip kaymaz.
- `colorGrading?`: parlaklık, kontrast, doygunluk (+ ön ayarlar: Orijinal, Canlı, Parlak, Sinematik, Soluk, Siyah-Beyaz). Export `eq`, önizleme canvas filter.
- `keyframes?`: `x, y, scale, opacity, rotation` için sıralı `Keyframe { id, time, value, easing }`.
- `effect?` (yalnızca `effect` kanalındaki klipte): `kind` (`blur|pixelate|blackbox|tint|sharpen|vignette`), `shape` (`rect|ellipse`), `strength`, `feather`, `width`, `height` (proje pikseli, ölçek 1). Bölge `transform` ile (konum/ölçek, keyframe'lenebilir) tanımlanır. Ek alanlar: `invert` (bölge dışına uygula), `fullFrame` (bölgesiz, tüm kare; vinyet her zaman), `color` (renk tonu), `strengthEnd` + `strengthEasing` (klip boyunca güç animasyonu: `strength` → `strengthEnd`). Güç animasyonu **0,2 sn'lik sabit dilimlerle** oynar (`effectStrengthAt`), çünkü FFmpeg filtreleri kare başına güç değiştiremez; önizleme aynı dilimleri kullanır.
- `fit?`: `stretch` (tanımsızsa eski davranış), `contain`, `cover`. **Yeni video/resim klibi varsayılan `contain`**.
- `backdropBlur?` (0-1): klibin arkasına tuvali dolduran bulanık kopya.
- `chromaKey?`: `{ color, similarity, blend }`.
- `freeze?`: kaynağın `inPoint` karesi klip boyunca sabit. "Dondur" düğmesi klibi böler ve araya 2 sn'lik kare klibi koyar.

`MediaAsset` (`src/types/asset.ts`): `path`, `url`, `type`, `duration`, `width/height?`, `hasAudio?` (masaüstünde `probe_media` ile bulunur; `false` ise export ses istemez).

## Keyframe sistemi

- Zaman **klip-yerel saniye**, kaynak hızından bağımsız; hız değişince `scaleKeyframeTimes` ile ölçeklenir.
- Easing: `linear` ve `ease-in-out` = `p*p*(3-2*p)`. TS (`applyEasing`) ve FFmpeg (`buildKeyframeExpr`) **aynı formülü** kullanmak zorunda.
- Önizlemede transform her zaman `resolveTransform(clip, currentTime - clip.startTime)` ile okunur; `clip.transform` doğrudan okunmaz.
- `updateClipTransform`: keyframe'li özellik düzenlenirse playhead'e keyframe yazılır. **Oto keyframe** açıksa (`autoKeyframe`, önizleme araç satırındaki düğme) keyframe'siz özellik de keyframe'lenir; ilk keyframe playhead > 0.02 sn'deyse başa eski değeri sabitleyen bir keyframe eklenir.
- Sol kırpma + keyframe sınırı: bkz. [[known-issues]].

## Bölme

`TimelineEngine.splitClip`: sol yarı giriş geçişini, sağ yarı çıkış geçişini korur (kesim geçiş sayılmaz); efektin güç animasyonu kesimde sürekli devam eder (`splitEffectRamp`: sol yarı `strengthEnd`'i kesim noktasındaki değere, sağ yarı `strength`'i aynı değere alır).

## Geri alma

`timelineHistory.ts` (`COALESCE_WINDOW_MS = 800`): arka arkaya aynı türden eylemler (sürükleme, slider) tek kayıtta birleşir. Kısayollar Ctrl+Z / Ctrl+Y. Proje açılınca geçmiş temizlenir.

## Proje dosyası ve otomatik kayıt

- `ProjectFile { version, savedAt, project, tracks, assets }`, sürüm `1` (`PROJECT_FILE_VERSION`), uzantı `.kurgu.json`. Asset'in `url`'si kaydedilmez, açılışta `path`'ten kurulur (`resolveAssetUrl`).
- `parseProjectFile` yalnızca üst düzey alan tiplerini doğrular. Aralık denetimi yok: [[audit-report]] Bulgu 5.
- Otomatik kayıt: değişiklikten 1,5 sn sonra `localStorage['kurgu.autosave.v1']`; yeniden açılışta kurtarma şeridi (`RecoveryBanner`). Blob olarak içe aktarılmış medyanın yolu mutlak olmadığı için kurtarılamaz (`findMissingAssetIds`).
- Masaüstünde proje açma Rust diyaloğu üzerinden (`open_project_dialog`), tarayıcıda File System Access API ya da `<input type=file>`.

## Store'lar

`useTimelineStore` (1300+ satır, 94 eylem; bölünmesi [[audit-report]] Bulgu 6), `useAssetStore` (içe aktarma, süre/metadata, küçük resim; metadata okunamazsa 10 sn ve 1920x1080 varsayar, Bulgu 10), `useProjectStore` (çözünürlük, en-boy, FPS 24/25/30/50/60).
