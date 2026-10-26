# Üçüncü taraf bileşenler

Mivid Apache-2.0 lisanslıdır ([LICENSE](LICENSE)). Aşağıdaki bileşenler kendi lisanslarıyla gelir.

## FFmpeg (kurulum paketinde ayrı bir program olarak)

Kurulum paketi, videoyu işleyen ve dışa aktaran **FFmpeg** programını `ffmpeg.exe` olarak uygulamanın yanında taşır.

- Lisans: **LGPL v2.1 veya üzeri**. Paketlenen yapı GPL parçaları (`--enable-gpl`, `libx264`) içermez; `scripts/fetch-ffmpeg.ps1` böyle bir yapı olduğunu doğrular, değilse paketi reddeder.
- Kaynak: BtbN FFmpeg-Builds (<https://github.com/BtbN/FFmpeg-Builds>) LGPL yapısı. FFmpeg kaynak kodu: <https://ffmpeg.org/download.html>. Telif: FFmpeg geliştiricileri.
- FFmpeg ayrı bir süreç olarak çalışır; Mivid ona bağlanmaz (link etmez). Kullanıcı `ffmpeg.exe` dosyasını kendi sürümüyle değiştirebilir: Mivid önce uygulama klasöründeki `ffmpeg.exe`'yi, sonra `C:\ffmpeg\bin\ffmpeg.exe`'yi, sonra PATH'i arar.
- H.264 kodlaması LGPL yapıda Windows Media Foundation (`h264_mf`) ile yapılır. GPL yapı (libx264) kullanılırsa o kopya GPL koşullarına tabidir.

## Kütüphaneler

Uygulama Tauri (Apache-2.0 / MIT), React (MIT), Zustand (MIT), Tailwind CSS (MIT), lucide-react (ISC) ve diğer Rust/npm paketlerini kullanır. Tam liste `package-lock.json` ve `src-tauri/Cargo.lock` dosyalarındadır; her paketin lisansı kendi deposunda bulunur.
