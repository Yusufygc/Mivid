/**
 * Font files for the export. FFmpeg's drawtext ignores the CSS font family, so the preview's font
 * has to be given as a file. Only fonts that ship with Windows are mapped; anything else (Inter, Roboto,
 * Montserrat ...) falls back to Arial, which is what the browser's sans-serif resolves to on Windows too.
 */

export const WINDOWS_FONT_DIRECTORY = 'C:/Windows/Fonts';

interface FontFiles {
  regular: string;
  bold: string;
  italic: string;
  boldItalic: string;
}

const family = (regular: string, bold: string, italic: string, boldItalic: string): FontFiles => ({
  regular,
  bold,
  italic,
  boldItalic,
});

const same = (file: string): FontFiles => family(file, file, file, file);

const FONT_FILES: Record<string, FontFiles> = {
  arial: family('arial.ttf', 'arialbd.ttf', 'ariali.ttf', 'arialbi.ttf'),
  'arial black': same('ariblk.ttf'),
  impact: same('impact.ttf'),
  georgia: family('georgia.ttf', 'georgiab.ttf', 'georgiai.ttf', 'georgiaz.ttf'),
  'courier new': family('cour.ttf', 'courbd.ttf', 'couri.ttf', 'courbi.ttf'),
  'trebuchet ms': family('trebuc.ttf', 'trebucbd.ttf', 'trebucit.ttf', 'trebucbi.ttf'),
  verdana: family('verdana.ttf', 'verdanab.ttf', 'verdanai.ttf', 'verdanaz.ttf'),
  tahoma: family('tahoma.ttf', 'tahomabd.ttf', 'tahoma.ttf', 'tahomabd.ttf'),
  'times new roman': family('times.ttf', 'timesbd.ttf', 'timesi.ttf', 'timesbi.ttf'),
  'segoe ui': family('segoeui.ttf', 'segoeuib.ttf', 'segoeuii.ttf', 'segoeuiz.ttf'),
  'comic sans ms': family('comic.ttf', 'comicbd.ttf', 'comici.ttf', 'comicz.ttf'),
  calibri: family('calibri.ttf', 'calibrib.ttf', 'calibrii.ttf', 'calibriz.ttf'),
  consolas: family('consola.ttf', 'consolab.ttf', 'consolai.ttf', 'consolaz.ttf'),
};

/** First family of a CSS font stack, lower case, without quotes: `"Courier New", monospace` -> `courier new` */
export const primaryFamily = (fontFamily: string | undefined): string =>
  (fontFamily ?? '')
    .split(',')[0]
    .replace(/["']/g, '')
    .trim()
    .toLowerCase();

/** Absolute path of the font file to give drawtext for a text style */
export const resolveFontFile = (
  fontFamily: string | undefined,
  fontWeight: string | undefined,
  fontStyle: string | undefined,
  directory: string = WINDOWS_FONT_DIRECTORY
): string => {
  const files = FONT_FILES[primaryFamily(fontFamily)] ?? FONT_FILES.arial;
  const bold = fontWeight === 'bold' || fontWeight === '900' || Number(fontWeight) >= 600;
  const italic = fontStyle === 'italic';
  const file = bold && italic ? files.boldItalic : bold ? files.bold : italic ? files.italic : files.regular;
  return `${directory}/${file}`;
};

/** drawtext escapes: a ':' inside the option value must be escaped even when it is quoted */
export const escapeFilterPath = (path: string): string => path.replace(/\\/g, '/').replace(/:/g, '\\:');
