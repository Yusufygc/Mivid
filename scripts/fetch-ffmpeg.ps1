# Puts the LGPL FFmpeg the installer bundles (Tauri sidecar) into src-tauri/binaries. Downloads only when needed.
#
# LGPL on purpose: the GPL builds carry libx264, which would make the whole app GPL. The app falls back to the
# Windows Media Foundation encoder (h264_mf) when libx264 is missing, see `video_encoder` in src-tauri/src/lib.rs.
#
# Looks in this order and stops at the first usable one (usable = LGPL build with h264_mf):
#   1. the sidecar already in src-tauri/binaries
#   2. an FFmpeg already on this machine (C:\ffmpeg\bin, C:\ffmpeg, PATH)
#   3. a download (BtbN FFmpeg-Builds LGPL build)
#
# Usage:  npm run fetch:ffmpeg
#         npm run fetch:ffmpeg -- -Force                (ignore what exists, download again)
#         npm run fetch:ffmpeg -- -Sha256 <hash>        (pin the downloaded archive: any other is refused)
param(
  [string]$Url = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-lgpl.zip',
  [string]$Sha256 = '',
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
# The progress bar makes Invoke-WebRequest several times slower on big files
$ProgressPreference = 'SilentlyContinue'
# .NET calls instead of Get-FileHash/Expand-Archive: those cmdlets are missing when this runs under a pwsh-started
# Windows PowerShell with a foreign PSModulePath (GitHub runners)
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root 'src-tauri\binaries\ffmpeg-x86_64-pc-windows-msvc.exe'

# True for an FFmpeg that is safe to ship: no GPL parts (`--enable-gpl`, libx264/libx265, nonfree) and the Media
# Foundation H.264 encoder. `--disable-libx264` in the build line is fine: only `--enable-...` counts.
function Test-ShippableFfmpeg([string]$exe) {
  try {
    $config = (& $exe -hide_banner -buildconf) -join "`n"
    if ($config -match '--enable-(gpl|libx264|libx265|nonfree)\b') { return $false }
    $encoders = (& $exe -hide_banner -encoders) -join "`n"
    return ($encoders -match '\bh264_mf\b')
  } catch {
    return $false
  }
}

function Use-Existing([string]$exe, [string]$what) {
  Write-Host "Hazir ($what): $exe"
  if ($exe -ne $target) {
    New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
    Copy-Item -Path $exe -Destination $target -Force
  }
}

if (-not $Force) {
  if ((Test-Path $target) -and (Test-ShippableFfmpeg $target)) { Use-Existing $target 'zaten var'; return }

  $candidates = @('C:\ffmpeg\bin\ffmpeg.exe', 'C:\ffmpeg\ffmpeg.exe')
  $onPath = Get-Command ffmpeg -ErrorAction SilentlyContinue
  if ($onPath) { $candidates += $onPath.Source }
  foreach ($candidate in $candidates) {
    if ((Test-Path $candidate) -and (Test-ShippableFfmpeg $candidate)) { Use-Existing $candidate 'bilgisayarda bulundu'; return }
  }
  Write-Host 'Bilgisayarda paketlenebilir (LGPL) bir FFmpeg yok, indiriliyor.'
}

$work = Join-Path ([System.IO.Path]::GetTempPath()) ('mivid-ffmpeg-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null

try {
  $zip = Join-Path $work 'ffmpeg.zip'
  Write-Host "Indiriliyor: $Url"
  Invoke-WebRequest -Uri $Url -OutFile $zip -UseBasicParsing

  $sha = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead($zip)
  try { $hash = [System.BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') } finally { $stream.Dispose() }
  Write-Host "SHA256: $hash"
  if ($Sha256 -and ($hash -ne $Sha256.ToUpper())) {
    throw "SHA256 uyusmuyor (beklenen $Sha256). Dosya kullanilmadi."
  }

  $extracted = Join-Path $work 'x'
  [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $extracted)
  $exe = Get-ChildItem -Path $extracted -Recurse -Filter ffmpeg.exe | Where-Object { $_.DirectoryName -like '*\bin' } | Select-Object -First 1
  if (-not $exe) { throw 'Arsivde bin\ffmpeg.exe bulunamadi.' }

  if (-not (Test-ShippableFfmpeg $exe.FullName)) { throw 'Bu FFmpeg paketlenemez: GPL parcasi (libx264/--enable-gpl) var ya da h264_mf yok.' }

  New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
  Copy-Item -Path $exe.FullName -Destination $target -Force
  Write-Host "Hazir: $target"
  & $target -hide_banner -version | Select-Object -First 1
}
finally {
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}
