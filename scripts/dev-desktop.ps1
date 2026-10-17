# Starts the vite dev server and the prebuilt debug Tauri shell (no Rust build needed while src-tauri/src is unchanged).
# The debug shell loads the UI from http://localhost:5173, so every frontend change is live.
# The window is moved to the center of the primary monitor, because it can otherwise open on a disconnected/virtual display.

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$exe = Join-Path $root 'src-tauri\target\debug\app.exe'

if (-not (Test-Path $exe)) {
  throw "Prebuilt shell not found: $exe. Build it once with 'npm run tauri dev' (needs Rust + MSVC C++ build tools)."
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WinTools {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hgt, uint flags);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);

  public static IntPtr FindTitled(uint pid, string title) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (p != pid) return true;
      var sb = new StringBuilder(256); GetWindowText(h, sb, 256);
      if (sb.ToString().Contains(title)) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }

  public static void CenterOn(IntPtr h, int areaX, int areaY, int areaW, int areaH, int w, int hgt) {
    ShowWindow(h, 9); // SW_RESTORE
    SetWindowPos(h, IntPtr.Zero, areaX + (areaW - w) / 2, areaY + (areaH - hgt) / 2, w, hgt, 0x0040); // SWP_SHOWWINDOW
    SetForegroundWindow(h);
  }
}
"@

$viteProcess = $null
$listening = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
  Write-Host 'Starting vite on :5173 ...'
  $viteProcess = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'dev' -WorkingDirectory $root -WindowStyle Hidden -PassThru
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    if (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue) { break }
  }
}

try {
  $app = Start-Process -FilePath $exe -WorkingDirectory $root -PassThru

  $handle = [IntPtr]::Zero
  for ($i = 0; $i -lt 40 -and $handle -eq [IntPtr]::Zero; $i++) {
    Start-Sleep -Milliseconds 250
    $handle = [WinTools]::FindTitled([uint32]$app.Id, 'CapCut Clone')
  }

  if ($handle -ne [IntPtr]::Zero) {
    $area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
    $w = [Math]::Min(1280, $area.Width)
    $h = [Math]::Min(720, $area.Height)
    [WinTools]::CenterOn($handle, $area.X, $area.Y, $area.Width, $area.Height, $w, $h)
    Write-Host "App window centered on the primary monitor ($w x $h)."
  } else {
    Write-Warning 'App window not found; it may still be starting.'
  }

  $app.WaitForExit()
} finally {
  if ($viteProcess) { taskkill /PID $viteProcess.Id /T /F | Out-Null }
}
