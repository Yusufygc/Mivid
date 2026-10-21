# Mivid Wiki: İçerik Haritası

Mivid, Tauri v2 + React 19 + TypeScript + FFmpeg ile yazılmış bir masaüstü video kurgu uygulaması. Bu wiki projenin kalıcı hafızasıdır: kodu yazmadan önce buradan okuyun. Çalışma kuralları [[rules]] sayfasındadır.

## Çalışma düzeni
- [[rules]]: wiki mekanizması, inceleme/plan/doğrulama akışı, commit kuralları, kodlama standartları
- [[log]]: kronolojik değişiklik kaydı (en yeni en üstte)

## Mimari ve konular
- [[architecture]]: katmanlar, dizin yapısı, veri akışı, teknoloji
- [[timeline-model]]: kanal ve klip alanları, yerleşim, keyframe/oto keyframe, geri alma, proje dosyası
- [[preview-engine]]: canvas önizleme, zamanlama, çizim sırası, tutamaçlar, önizleme/export farkları
- [[export-pipeline]]: FFmpeg `filter_complex` üretimi, yazı tipleri, ses, sözleşme testi
- [[desktop-security]]: Rust komutları, izin listesi, argüman doğrulayıcı, CSP

## Durum ve plan
- [[next-session]]: şu anki durum, sıradaki adım, yapılabilecek işler
- [[roadmap]]: faz faz tamamlanan ve açık görevler
- [[known-issues]]: bilinen sorunlar ve sınırlamalar
- [[audit-report]]: 2026-10-19 sistem denetimi, 18 bulgu ve aksiyon planı

## Uygulamalı rehber
- [[qa-playbook]]: tarayıcıda elle QA, başsız gerçek ffmpeg export ve sayısal doğrulama
