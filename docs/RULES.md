# Proje Kuralları & Geliştirme Standartları (RULES.md)

Bu belge, **Mivid** projesinin kodlama standartlarını, tasarım prensiplerini ve kalite yönergelerini içerir.

---

## 1. Temel Prensipler

### 1.1 SOLID & Clean Code
- **Single Responsibility (SRP):** Her sınıf, hook, servis veya fonksiyon yalnızca bir tek sorumluluğa sahip olmalıdır (Örn: `TimelineService` sadece zaman çizelgesi hesaplamalarını yapar, `Logger` sadece loglama yapar).
- **Open / Closed (OCP):** Yeni bir filtre, efekt veya klip tipi eklendiğinde mevcut kodları bozmadan eklenebilir (pluggable) olmalıdır.
- **Liskov Substitution (LSP):** Tüm klip türleri (VideoClip, AudioClip, TextClip) ortak `BaseClip` arayüzünü hatasız sağlamalıdır.
- **Interface Segregation (ISP):** Tek bir devasa interface yerine küçük ve amaca yönelik interfaceler (`ITransformable`, `ITrimmable`, `IAudioAdjustable`) tanımlanmalıdır.
- **Dependency Inversion (DIP):** Yüksek seviyeli bileşenler somut uygulamalara değil, soyutlama ve arayüzlere bağımlı olmalıdır.

### 1.2 DRY (Don't Repeat Yourself) & KISS (Keep It Simple, Stupid)
- Zaman hesaplamaları, kare hızı (FPS) dönüşümleri, timecode formatlayıcıları `src/utils/time.ts` içinde merkezi tutulmalıdır.
- Gereksiz karmaşıklıktan kaçınılmalı, en okunabilir ve en basit çözüm tercih edilmelidir.

---

## 2. Modülerlik & Tak-Çıkar Mimarisi (Pluggable)
- **Engine - UI Ayrımı:** UI bileşenleri doğrudan dosya veya FFmpeg çalıştırmaz. UI sadece Store veya Core Service çağrısı yapar.
- **Komut Deseni (Undo/Redo):** Kullanıcının zaman çizelgesindeki her eylemi (Klip ekleme, kesme, silme, taşıma) bir `Command` objesi olarak kaydedilir.
- **Merkezi Loglama:** `console.log` yerine doğrudan `Logger.info()`, `Logger.warn()`, `Logger.error()` servisleri kullanılır.

---

## 3. Test ve Kalite Standartları
- Tüm çekirdek matematiksel ve mantıksal fonksiyonlar (Split, Trim, Reorder, FFmpeg command generation) birim testlerle kapsanmalıdır.
- `npm run test` komutu hatasız geçmelidir.
- Hata durumları sessizce yutulmamalı, `Logger.error` ile yakalanıp kullanıcıya bilgilendirici geri bildirim verilmelidir.

---

## 4. Dokümantasyon Sürekliliği
- Yapılan her yeni özellik `docs/TODO.md` dosyasında güncellenmelidir.
- Mimari değişiklikler `docs/ARCHITECTURE.md` dosyasına işlenmelidir.
