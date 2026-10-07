// ─── Fonts: PDF font names → Word font families and line metrics ─────

import type { FontFace } from './types';

/** PostScript families that Word knows under another name */
const ALIASES: Record<string, string> = {
    helvetica: 'Arial',
    arimo: 'Arial',
    'liberation sans': 'Arial',
    times: 'Times New Roman',
    'times roman': 'Times New Roman',
    tinos: 'Times New Roman',
    'liberation serif': 'Times New Roman',
    courier: 'Courier New',
    cousine: 'Courier New',
    'liberation mono': 'Courier New',
    carlito: 'Calibri',
    caladea: 'Cambria',
    'zapf dingbats': 'Wingdings',
};

/** "BCDEEE+Arial-BoldItalicMT" → { family: "Arial", bold, italic } */
export function parseFontName(rawName: string, flags: { bold?: boolean; italic?: boolean } = {}): Pick<FontFace, 'family' | 'bold' | 'italic' | 'pdfName'> {
    const pdfName = (rawName || '').replace(/^[A-Z]{6}\+/, '').trim();
    let [base, style = ''] = pdfName.split(/[-,]/, 2);
    base = base.replace(/(PSMT|PS|MT)$/, '');
    // "ArialBold", "TimesNewRomanBoldItalic": a style glued to the family name
    const glued = base.match(/^(.*?)((?:Bold|Italic|Oblique|Semibold|Black)+)$/);
    if (glued && glued[1]) {
        base = glued[1];
        style = glued[2] + style;
    }
    style = style.replace(/(PSMT|PS|MT)$/, '');
    // CamelCase → words: "TimesNewRoman" → "Times New Roman", "SegoeUI" → "Segoe UI"
    let family = base
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .replace(/[_]+/g, ' ')
        .trim();
    // "Calibri Light": a weight that Word treats as its own family stays in the name
    if (/^light$/i.test(style)) family = `${family} Light`;
    family = ALIASES[family.toLowerCase()] ?? (family || 'Arial');
    const bold = flags.bold || /bold|black|heavy|semibold|demi/i.test(style);
    const italic = flags.italic || /italic|oblique/i.test(style);
    return { family, bold, italic, pdfName };
}

/**
 * Where Word puts the baseline below the top of a single-spaced line, and how far the
 * line reaches below it, in em: the Windows metrics (usWinAscent / usWinDescent), plus
 * the font's extra line gap, which goes above the text (Arial 0.033 em, Times 0.042 em).
 * For Calibri these differ a lot from what a PDF records.
 */
const WORD_METRICS: Record<string, [number, number]> = {
    arial: [0.938, 0.212],
    'arial narrow': [0.969, 0.212],
    'arial black': [1.101, 0.31],
    calibri: [0.952, 0.269],
    'calibri light': [0.952, 0.269],
    cambria: [0.95, 0.222],
    candara: [0.952, 0.269],
    'century gothic': [1.006, 0.22],
    'comic sans ms': [1.102, 0.287],
    consolas: [0.743, 0.257],
    'courier new': [0.833, 0.3],
    georgia: [0.917, 0.219],
    garamond: [0.862, 0.263],
    'segoe ui': [1.079, 0.251],
    tahoma: [1.0, 0.207],
    'times new roman': [0.933, 0.216],
    'trebuchet ms': [0.939, 0.222],
    verdana: [1.005, 0.21],
    aptos: [0.939, 0.282],
    symbol: [1.005, 0.216],
    wingdings: [0.899, 0.211],
};

/** Where Word puts the baseline below the top of a line (ascent) and how deep the line goes */
export function wordLineMetrics(font: Pick<FontFace, 'family' | 'ascent' | 'descent'>): { ascent: number; descent: number } {
    const known = WORD_METRICS[font.family.toLowerCase()];
    if (known) return { ascent: known[0], descent: known[1] };
    const ascent = font.ascent > 0.5 && font.ascent < 1.5 ? font.ascent : 0.9;
    const descent = font.descent < 0 && font.descent > -0.6 ? -font.descent : 0.22;
    return { ascent, descent };
}
