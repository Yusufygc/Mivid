/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (relative: string) => readFileSync(resolve(__dirname, '../../..', relative), 'utf-8');

describe('single app version', () => {
  it('package.json and Cargo.toml carry the same version', () => {
    const npm = JSON.parse(read('package.json')).version as string;
    const cargo = /^version\s*=\s*"([^"]+)"/m.exec(read('src-tauri/Cargo.toml'))?.[1];
    expect(cargo).toBe(npm);
  });

  it('tauri.conf.json has no version of its own (it follows Cargo.toml)', () => {
    expect(JSON.parse(read('src-tauri/tauri.conf.json'))).not.toHaveProperty('version');
  });
});
