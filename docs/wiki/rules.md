# Çalışma Kuralları (Anayasa)

Bu sayfa, Mivid üzerinde (insan ya da AI ile) çalışırken geçerli kuralları toplar: wiki mekanizması, inceleme ve doğrulama akışı, commit kuralları ve kodlama standartları. Kaynak metodoloji `AI-Gelistirme-Metodolojisi.md` (kullanıcının genel şablonu); aşağısı bu projeye uyarlanmış halidir. Giriş: [[index]].

## 1. Wiki mekanizması

- **Katmanlar:** ham kaynaklar (kod, dış dokümanlar, salt okunur) → `docs/wiki/` (AI'ın tam kontrol ettiği, `[[sayfa_adi]]` bağlantılı Markdown) → bu sayfa.
- **`index.md`:** tüm wiki'nin içerik haritası. Yeni sayfa açılınca buraya tek cümlelik özetle eklenir.
- **`log.md`:** kronolojik kayıt, **en yeni en üstte**. Biçim: `## [YYYY-AA-GG] [İŞLEM_TİPİ] | Kısa açıklama`. Tipler: `INGEST` (yeni özellik/bilgi), `REVIEW` (inceleme/düzeltme), `LINT` (bakım).
- **Önce oku:** kod yazmadan ya da mimari karar vermeden önce `index.md` okunur, gerekirse bağlantılar izlenir. Proje sıfırdan keşfedilmez.
- **Proaktif güncelleme:** yeni kütüphane, yapılandırma ya da karmaşık karar sohbette bırakılmaz; ilgili sayfa **aynı turda** güncellenir, `index.md` ve `log.md`'ye işlenir. Kod değişikliği ile wiki güncellemesi aynı iş birimidir.
- **Bağlantısallık:** her sayfa ilgili sayfalara `[[link]]` verir. Öksüz sayfa bırakılmaz. Sayfa silinirse ona işaret eden tüm bağlantılar temizlenir.
- **Sözdizimi örneği:** `[[...]]` yazımını örnek olarak göstermek gerekirse inline code içinde yazılır; çıplak bırakılırsa kırık link sayılır.

### Operasyon komutları

| Kullanıcı der ki | AI ne yapar |
|---|---|
| "Bunu ingest et" | Kaynağı oku → yeni wiki sayfası aç → çelişen sayfaları güncelle → `index.md`'ye ekle → `log.md`'ye yaz |
| Detaylı proje sorusu | Önce `index.md` üzerinden ilgili sayfaları oku, wiki bilgisiyle cevapla; kalıcı değerliyse sayfa olarak ekle |
| "Wiki'yi lint et" | Tüm sayfaları tara: çelişki, eski karar, öksüz sayfa, kırık link → rapor → onay sonrası düzelt |

## 2. Kod inceleme akışı

1. **Rapor önce:** bulgular uygulanmadan raporlanır (konum `dosya:satır`, ne bozuk, hangi senaryoda patlar, önerilen düzeltme; önem sırasıyla). Örnek: [[audit-report]].
2. **Onay:** kullanıcı "uygula" demeden düzeltme yapılmaz.
3. **Sıralı düzeltme:** her bulgu ayrı adım; her adımdan sonra hızlı doğrulama.
4. **Kalıntı referans taraması:** silinen kod/dosyanın bıraktığı dokümantasyon ve wiki bağlantıları temizlenir.
5. **Kayıt:** iş bitince `log.md`'ye `REVIEW` girdisi.
6. Düzeltmenin yan etkisi yeni bir hata doğurursa ayrı bulgu olarak raporlanır; sessizce geçilmez.

Mantık hatası geçişi ayrıdır: yarış durumu, cebirsel hatalı formül, tek yönlü binding, eksik validasyon, gereksiz sık işlem, davranışsal DRY ihlali.

## 3. Büyük özellikler: plan modu

3+ dosyayı etkileyen ya da birden fazla makul yaklaşımı olan işlerde: netleştirici sorular → salt okunur plan → plan dosyası (bağlam, dosya dosya tasarım, **sıralı adımlar; her adımda yazılacak ve doğrulama**, riskler, kapsam dışı kararlar) → onay → adımlar birebir sırayla uygulanır. Bilinçli kapsam dışı bırakmalar plana gerekçesiyle yazılır.

## 4. Doğrulama

Bu projede:

```bash
npx vitest run     # birim testleri (npm run test)
npx tsc -b         # tip denetimi
npx oxlint         # lint (3 bilinen uyarı, bkz. [[known-issues]])
npm run build      # üretim derlemesi
```

- Mantık değişikliği testle doğrulanır; yalnızca derleme yetmez.
- **Export/FFmpeg değişikliği** gerçek `C:\ffmpeg\bin\ffmpeg.exe` ile üretilip çıktı kareleriyle karşılaştırılır (bkz. [[qa-playbook]]).
- **Rust değişikliği** `cargo test` ister (bkz. [[desktop-security]]). Derlenemeyen kod "doğrulandı" diye sunulmaz; commit mesajında belirtilir.
- **Tarayıcı QA** gerçek fare/klavye ile yapılır. Görsel ya da etkileşimli kısımda test edilemeyen yer açıkça "test edemedim, elle kontrol et" diye söylenir.
- Çıktı alınamayan her şey doğrulanmış gibi sunulmaz.

## 5. Commit kuralları

- Dil Türkçe; ı, ğ, ü, ş, ö, ç, İ, Ğ, Ü, Ş, Ö, Ç ASCII'ye çevrilmez.
- **Commit mesajına ya da PR açıklamasına `Co-Authored-By`, "Generated with", robot emojisi gibi AI/asistan referansı eklenmez.**
- Biçim: kısa emir kipinde özet satırı (`feat:`, `fix:`, `chore:`), gerekirse boş satırdan sonra madde madde gövde.
- Commit yalnızca kullanıcı isteyince, yalnızca `feature` dalına; push yalnızca kullanıcı isteyince (`origin` = github.com/Yusufygc/Mivid, açık kaynak: repoya sır, anahtar, kişisel medya girmez).
- Commit öncesi `git status` gözden geçirilir; geçici QA dosyaları (`.claude/launch.json`, `public/qa-*`, `zz_*.test.ts`) dahil edilmez.

## 5.1 Genel prensipler

- **Sessiz değil:** düzeltme sırasında görülen yan bulgular raporlanır.
- **Kapsamı istekle sınırla:** istenmeyen genişleme sorulur ya da planda gerekçeli kapsam dışı bırakılır.
- **Silmeden önce referans tara.**
- **Doğrulanamayanı doğrulanmış gibi sunma.**

## 6. Kodlama standartları

### SOLID ve temiz kod
- **SRP:** her sınıf/hook/servis tek sorumluluk (ör. `TimelineEngine` yalnızca zaman çizelgesi hesabı, `Logger` yalnızca loglama).
- **OCP:** yeni filtre, efekt ya da klip tipi mevcut kodu bozmadan eklenebilmeli. Not: bugün tam uyulmuyor, bkz. [[audit-report]] Bulgu 6 ve 14.
- **DIP:** yüksek seviyeli bileşenler soyutlamalara bağımlı olmalı.
- **DRY/KISS:** zaman hesabı, FPS dönüşümü ve timecode `src/utils/time.ts` içinde merkezi; gereksiz karmaşıklıktan kaçınılır.

### Modülerlik
- **Engine/UI ayrımı:** UI bileşenleri doğrudan dosya ya da FFmpeg çalıştırmaz; yalnızca store ya da core servis çağırır. `src/core` içinde React importu yok.
- **Komut deseni:** timeline'daki her kullanıcı eylemi geri alınabilir komut olarak kaydedilir (`src/core/command/`).
- **Merkezi loglama:** `console.log` yerine `Logger.info/warn/error`. Bugün 10 yerde `console.warn/error` var, bkz. [[audit-report]] Bulgu 13.

### Test ve kalite
- Çekirdek matematik ve mantık (split, trim, reorder, FFmpeg komut üretimi) birim testle kapsanır.
- Hata durumları sessizce yutulmaz: `Logger.error` ve kullanıcıya bilgi.

### Doküman sürekliliği
- Yeni özellik ya da mimari değişiklik aynı turda ilgili wiki sayfasına ve `log.md`'ye işlenir (bkz. §1). Görev durumu [[roadmap]], sonraki adım [[next-session]].
