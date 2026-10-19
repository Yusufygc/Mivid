import { describe, it, expect } from 'vitest';
import { escapeFilterPath, primaryFamily, resolveFontFile } from './fonts';

describe('fonts', () => {
  it('reads the first family of a CSS stack', () => {
    expect(primaryFamily('"Courier New", monospace')).toBe('courier new');
    expect(primaryFamily("Inter, sans-serif")).toBe('inter');
    expect(primaryFamily(undefined)).toBe('');
  });

  it('picks regular, bold, italic and bold italic files', () => {
    expect(resolveFontFile('Arial', 'normal', 'normal')).toBe('C:/Windows/Fonts/arial.ttf');
    expect(resolveFontFile('Arial', 'bold', 'normal')).toBe('C:/Windows/Fonts/arialbd.ttf');
    expect(resolveFontFile('Arial', 'normal', 'italic')).toBe('C:/Windows/Fonts/ariali.ttf');
    expect(resolveFontFile('Arial', 'bold', 'italic')).toBe('C:/Windows/Fonts/arialbi.ttf');
  });

  it('treats weight 900 and numeric weights from 600 as bold', () => {
    expect(resolveFontFile('Verdana', '900', undefined)).toBe('C:/Windows/Fonts/verdanab.ttf');
    expect(resolveFontFile('Verdana', '700', undefined)).toBe('C:/Windows/Fonts/verdanab.ttf');
    expect(resolveFontFile('Verdana', '400', undefined)).toBe('C:/Windows/Fonts/verdana.ttf');
  });

  it('uses the only file of single-weight fonts and falls back to Arial for unknown families', () => {
    expect(resolveFontFile('Impact', 'bold', 'italic')).toBe('C:/Windows/Fonts/impact.ttf');
    expect(resolveFontFile('Montserrat', 'bold', 'normal')).toBe('C:/Windows/Fonts/arialbd.ttf');
    expect(resolveFontFile(undefined, undefined, undefined)).toBe('C:/Windows/Fonts/arial.ttf');
  });

  it('honors another font directory and escapes the drive colon', () => {
    expect(resolveFontFile('Arial', 'normal', 'normal', '/usr/share/fonts')).toBe('/usr/share/fonts/arial.ttf');
    expect(escapeFilterPath('C:/Windows/Fonts/arial.ttf')).toBe('C\\:/Windows/Fonts/arial.ttf');
  });
});
