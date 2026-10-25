# Downloads the LGPL FFmpeg build the installer bundles (Tauri sidecar) into src-tauri/binaries.
#
# LGPL on purpose: the GPL builds carry libx264, which would make the whole app GPL. The app falls back to the
# Windows Media Foundation encoder (h264_mf) when libx264 is missing, see `video_encoder` in src-tauri/src/lib.rs.
#
# Usage:  npm run fetch:ffmpeg
#         npm run fetch:ffmpeg -- -Sha256 <hash>      (pin the archive: the script refuses any other)
param(
  [string]$Url = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-lgpl.zip',
  [string]$Sha256 = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root 'src-tauri\binaries\ffmpeg-x86_64-pc-windows-msvc.exe'
$work = Join-Path ([System.IO.Path]::GetTempPath()) ('mivid-ffmpeg-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null

try {
  $zip = Join-Path $work 'ffmpeg.zip'
  Write-Host "Indiriliyor: $Url"
  Invoke-WebRequest -Uri $Url -OutFile $zip -UseBasicParsing

  $hash = (Get-FileHash -Algorithm SHA256 -Path $zip).Hash
  Write-Host "SHA256: $hash"
  if ($Sha256 -and ($hash -ne $Sha256.ToUpper())) {
    throw "SHA256 uyusmuyor (beklenen $Sha256). Dosya kullanilmadi."
  }

  $extracted = Join-Path $work 'x'
  Expand-Archive -Path $zip -DestinationPath $extracted
  $exe = Get-ChildItem -Path $extracted -Recurse -Filter ffmpeg.exe | Where-Object { $_.DirectoryName -like '*\bin' } | Select-Object -First 1
  if (-not $exe) { throw 'Arsivde bin\ffmpeg.exe bulunamadi.' }

  # The build must not carry GPL parts, or shipping it would make the app GPL
  $config = (& $exe.FullName -hide_banner -buildconf) -join "`n"
  if ($config -match '--enable-gpl' -or $config -match 'libx264') { throw 'Bu FFmpeg GPL (libx264/--enable-gpl). LGPL build gerekli.' }

  New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
  Copy-Item -Path $exe.FullName -Destination $target -Force
  Write-Host "Hazir: $target"
  & $target -hide_banner -version | Select-Object -First 1
}
finally {
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}
