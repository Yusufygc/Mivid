# Mivid: Claude Code için giriş kapısı

Tauri v2 + React 19 + TypeScript + FFmpeg masaüstü video editörü. Detay `docs/wiki/` altındadır; bu dosya kısa tutulur.

## Her oturumda
1. **Önce `docs/wiki/index.md` oku**, gerekirse `[[link]]`leri izle. Projeyi sıfırdan keşfetme.
2. Sıradaki iş için `docs/wiki/next-session.md`.
3. Kurallar: `docs/wiki/rules.md` (wiki, inceleme, plan modu, doğrulama, commit).

## Wiki komutları
- **"Bunu ingest et":** kaynağı oku, wiki sayfası aç, çelişenleri güncelle, `index.md` ve `log.md`'ye işle.
- **"Wiki'yi lint et":** çelişki, eski karar, öksüz sayfa, kırık link tara, rapor et, onayla düzelt.
- Kod değişikliği ile wiki güncellemesi **aynı turda** yapılır (`log.md` en yeni en üstte).

## Doğrulama
```bash
npx vitest run && npx tsc -b && npx oxlint && npm run build
```
Rust (`src-tauri`) için `cargo test`; bu makinede VS C++ iş yükü kurulana kadar derlenemiyor (`docs/wiki/next-session.md`).

## Sabit kurallar
- Commit yalnızca kullanıcı isteyince, yalnızca `feature` dalına; push yalnızca kullanıcı isteyince (`origin` = github.com/Yusufygc/Mivid). Mesaj Türkçe, `Co-Authored-By` / "Generated with" **yok**.
- Bu projede REA / CapCut incelemesi yapma; özgün, iş akışını kolaylaştıran özellikler öner.
- Rapor önce, uygulama onaydan sonra. Doğrulanamayanı doğrulanmış gibi sunma.
- Geçici QA dosyalarını (`.claude/launch.json`, `public/qa-*`, `zz_*.test.ts`) commit etme.
