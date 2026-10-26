// Builds the Windows installer and drops it into ./installer next to the project.
//
//   npm run bundle
//
// Steps: bundled LGPL FFmpeg (downloaded once, scripts/fetch-ffmpeg.ps1) -> tauri build (NSIS) -> copy the setup
// exe into ./installer. The update signature needs the private key: it is read from TAURI_SIGNING_PRIVATE_KEY(_PATH),
// or from ~/.tauri/mivid.key when neither is set.

import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (command, env = {}) => execSync(command, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });

const sidecar = join(root, 'src-tauri', 'binaries', 'ffmpeg-x86_64-pc-windows-msvc.exe');
if (!existsSync(sidecar)) run('npm run fetch:ffmpeg');

const env = {};
const defaultKey = join(homedir(), '.tauri', 'mivid.key');
if (!process.env.TAURI_SIGNING_PRIVATE_KEY && !process.env.TAURI_SIGNING_PRIVATE_KEY_PATH) {
  if (!existsSync(defaultKey)) {
    console.error(`Güncelleme imza anahtarı yok: TAURI_SIGNING_PRIVATE_KEY_PATH ayarla ya da ${defaultKey} koy.`);
    process.exit(1);
  }
  env.TAURI_SIGNING_PRIVATE_KEY_PATH = defaultKey;
  env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? '';
}

run('npx tauri build --config src-tauri/tauri.bundle.conf.json', env);

const bundleDir = join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
const setups = existsSync(bundleDir) ? readdirSync(bundleDir).filter((f) => f.endsWith('-setup.exe')) : [];
if (setups.length === 0) {
  console.error(`Kurulum dosyası bulunamadı: ${bundleDir}`);
  process.exit(1);
}
const outDir = join(root, 'installer');
mkdirSync(outDir, { recursive: true });
for (const file of setups) {
  copyFileSync(join(bundleDir, file), join(outDir, file));
  console.log(`Hazır: installer/${file}`);
}
