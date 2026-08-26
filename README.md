# CapCut Pro - Masaüstü Video Kurgu & Editör

CapCut benzeri, modern, hafif ve genişletilebilir bir masaüstü video düzenleme uygulaması. **Tauri v2 + React 19 + TypeScript + Vite + Tailwind CSS + FFmpeg** teknolojileriyle geliştirilmiştir.

---

## ✨ Özellikler

- 🎬 **Çok Kanallı Zaman Çizelgesi (Multi-track Timeline):**
  - Akıllı Katmanlama: Otomatik yeni kanal oluşturma ve çakışma önleme.
  - Video (V1, V2), Ses (A1, A2) ve Metin (T1, T2) kanalları.
  - Klip bölme (Split - `Ctrl+B`), Sol/Sağ Trim (Kırpma) ve sürükle-bırak sıralama.
  - Sınırsız dikey kaydırma ve yapışkan zaman cetveli (Sticky Ruler).
  - Manyetik Yapışma (Magnetic Snapping) ve dinamik Zoom kontrolü.
- 📺 **Gerçek Zamanlı Önizleme Oynatıcısı (Canvas Player):**
  - **Master Hardware Clock:** Oynatılan videonun GPU saatine kilitlenen, sıfır-gecikmeli (Zero-lag), pürüzsüz çoklu video oynatma altyapısı.
  - Dinamik en-boy oranları (16:9, 9:16, 1:1 vb.) ve katman bindirme (PiP).
- 🔤 **Metin ve Başlık Sistemi:**
  - Zengin metin düzenleyici: Yazı tipi, boyut, kalınlık/italik, hizalama.
  - Özel stiller: Kenarlık (Stroke), Arka plan kutusu, Gölge (Shadow).
  - Sinematik, Neon, Kutulu Altyazı gibi hazır şablonlar.
- 🎛️ **Özellikler Paneli (Inspector):**
  - Video İçi Başlangıç (In-Point) göstergesi ve anında sıfırlama.
  - Konum X/Y, Ölçek, Opaklık ve Döndürme kontrolleri.
- 📂 **Medya Havuzu (Asset Pool):**
  - Video, Ses ve Görsel dosyalarını sürükle-bırak veya dosya seçici ile içe aktarma.
  - Otomatik küçük resim (Thumbnail) ve süre tespiti.
- ⚡ **FFmpeg Dışa Aktarma Motoru (Export Engine):**
  - Zaman çizelgesindeki tüm klipleri (`setpts` ile saniyesi saniyesine), metinleri (`drawtext` filtresi) ve sesleri (`adelay`) tek bir karmaşık `filter_complex` komutuna dönüştürür.
  - Hızlı ve kayıpsız H.264 / AAC render çıktısı.
- 🏗️ **Yazılım Mimarisi & Standartlar:**
  - **SOLID, Clean Code, DRY, KISS** ilkeleri.
  - Undo / Redo komut deseni (`CommandManager`).
  - Seviyeli Loglama Mekanizması (`LoggerService`).
  - Vitest ile %100 birim test kapsamı.

---

## ⌨️ Klavye Kısayolları

| Kısayol | İşlem |
| :--- | :--- |
| `Space` | Oynat / Duraklat (Play / Pause) |
| `Ctrl + B` | Seçili Klibi Oynatma Kafasında Böl (Split) |
| `Delete` / `Backspace` | Seçili Klibi Sil |
| `Sol Ok` / `Sağ Ok` | 0.1 sn Geri / İleri Sar |
| `Ctrl + Z` | Geri Al (Undo) |
| `Ctrl + Y` | İleri Al (Redo) |

---

## 🛠️ Kurulum ve Çalıştırma

### 1. Web Geliştirme Modunda Çalıştırma (Hızlı UI Testi):
```bash
npm run dev
```
Tarayıcınızda `http://localhost:5173` adresinde açılır.

### 2. Masaüstü Uygulaması Olarak Çalıştırma (Tauri):
```bash
npm run tauri dev
```

### 3. Testleri Çalıştırma:
```bash
npm run test
```

### 4. Üretim Derlemesi (Production Build):
```bash
npm run build
```

---

## 📚 Dokümantasyon

- [Sistem Mimarisi](file:///docs/ARCHITECTURE.md)
- [Geliştirme Kuralları & Standartlar](file:///docs/RULES.md)
- [Yapılanlar ve Görev Listesi](file:///docs/TODO.md)
