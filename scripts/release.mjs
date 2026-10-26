// Prepares a release: one command raises the version everywhere, commits and tags it.
//
//   npm run release -- patch          0.1.0 -> 0.1.1
//   npm run release -- minor          0.1.0 -> 0.2.0
//   npm run release -- major          0.1.0 -> 1.0.0
//   npm run release -- 0.3.0          an exact version
//   npm run release -- patch --dry-run   shows what would change, touches nothing
//
// It does not push: pushing the tag starts the Release workflow, so that step stays yours (printed at the end).
// The version lives in package.json (+ lock) and src-tauri/Cargo.toml (+ lock); tauri.conf.json follows Cargo.toml.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const request = args.find((a) => !a.startsWith('--'));

const run = (command) => execSync(command, { cwd: root, stdio: 'inherit' });
const read = (relative) => readFileSync(resolve(root, relative), 'utf-8');
const fail = (message) => {
  console.error(`Hata: ${message}`);
  process.exit(1);
};

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

const nextVersion = (current, what) => {
  const match = SEMVER.exec(current);
  if (!match) fail(`Mevcut sürüm okunamadı: ${current}`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (what === 'major') return `${major + 1}.0.0`;
  if (what === 'minor') return `${major}.${minor + 1}.0`;
  if (what === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (SEMVER.test(what)) return what;
  return fail('Kullanım: npm run release -- patch | minor | major | x.y.z [--dry-run]');
};

/** Compares x.y.z versions: negative when a is older than b */
const compare = (a, b) => {
  const [pa, pb] = [a, b].map((v) => v.split('.').map(Number));
  return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
};

const current = JSON.parse(read('package.json')).version;
const cargoCurrent = /^version\s*=\s*"([^"]+)"/m.exec(read('src-tauri/Cargo.toml'))?.[1];
if (cargoCurrent !== current) fail(`package.json (${current}) ve Cargo.toml (${cargoCurrent}) sürümleri farklı. Önce eşitle.`);

const next = nextVersion(current, request ?? '');
if (compare(next, current) <= 0) fail(`Yeni sürüm (${next}) mevcut sürümden (${current}) büyük olmalı.`);
const tag = `v${next}`;

console.log(`Sürüm: ${current} -> ${next} (etiket ${tag})`);
if (dryRun) {
  console.log('Deneme çalıştırması: hiçbir dosya değişmedi.');
  process.exit(0);
}

if (execSync('git status --porcelain', { cwd: root }).toString().trim() !== '') {
  fail('Çalışma ağacı temiz değil. Önce değişiklikleri commit et.');
}
if (execSync(`git tag --list ${tag}`, { cwd: root }).toString().trim() !== '') fail(`${tag} etiketi zaten var.`);

// Do not tag a release that does not even build and pass its tests
run('npx tsc -b');
run('npx vitest run');

run(`npm version ${next} --no-git-tag-version`); // package.json and package-lock.json

const cargoToml = resolve(root, 'src-tauri/Cargo.toml');
writeFileSync(cargoToml, read('src-tauri/Cargo.toml').replace(/^(version\s*=\s*")[^"]+(")/m, `$1${next}$2`));

const cargoLock = resolve(root, 'src-tauri/Cargo.lock');
const lockText = read('src-tauri/Cargo.lock');
const lockPattern = /(name = "app"\r?\nversion = ")[^"]+(")/;
if (!lockPattern.test(lockText)) fail('Cargo.lock içinde "app" paketi bulunamadı.');
writeFileSync(cargoLock, lockText.replace(lockPattern, `$1${next}$2`));

run('git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock');
run(`git commit -m "chore: sürüm ${next}"`);
run(`git tag -a ${tag} -m "Mivid ${next}"`);

console.log(`\nHazır. Yayınlamak için:\n  git push origin feature ${tag}`);
