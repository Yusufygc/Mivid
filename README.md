# CapCut Pro - Masaüstü Video Kurgu & Editör

CapCut benzeri, modern, hafif ve genişletilebilir bir masaüstü video düzenleme uygulaması. **Tauri v2 + React 19 + TypeScript + Vite + Tailwind CSS + FFmpeg** teknolojileriyle geliştirilmiştir.

---

## ✨ Özellikler

- 🎬 **Çok Kanallı Zaman Çizelgesi (Multi-track Timeline):**
  - Ana Video (V1), Bindirme / PiP Katmanı (V2) ve Ses / Müzik (A1) kanalları.
  - Klip bölme (Split - `Ctrl+B` / Makas).
  - Klip kırpma (Sol ve Sağ Trim tutamaçları ile anında süre/in-point ayarlama).
  - Sürükle & Bırak ile klibi zaman çizelgesinde taşıma.
  - Manyetik Yapışma (Magnetic Snapping) ve dinamik Zoom kontrolü.
  - Kanal gizleme (Hide), sessize alma (Mute) ve kilitleme (Lock).
- 📺 **Gerçek Zamanlı Önizleme Oynatıcısı (Canvas Composition Player):**
  - Çoklu video ve katmanları anında ekranda bindirme (Overlay / Picture-in-Picture).
  - Dinamik en-boy oranları (16:9 Yatay, 9:16 TikTok/Reels, 1:1 Kare, 4:3, 21:9).
  - Canlı Timecode (SS:DD:SS:KK) ve transport kontrolleri.
- 🎛️ **Özellikler Paneli (Inspector):**
  - Konum X/Y, Ölçek (Scale), Opaklık (Opacity), Döndürme (Rotation).
  - Ses seviyesi (Volume) ve Mute kontrolü.
- 📂 **Medya Havuzu (Asset Pool):**
  - Video, Ses ve Görsel dosyalarını sürükle-bırak veya dosya seçici ile içe aktarma.
  - Otomatik küçük resim (Thumbnail) ve süre tespiti.
- ⚡ **FFmpeg Dışa Aktarma Motoru (Export Engine):**
  - Zaman çizelgesindeki tüm kırpmaları, katmanları ve ses miksini tek bir optimize `filter_complex` komutuna dönüştürür.
  - Hızlı H.264 / AAC render çıktısı.
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
