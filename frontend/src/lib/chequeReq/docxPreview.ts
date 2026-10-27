// ─── Cheque requisitions: a Word invoice shown as Word lays it out ───
// docx-preview draws the pages (InvoicePreview). Before that, what it leaves out of invoices is
// put in a form it draws: a picture kept as an embedded object (a logo pasted from another
// program), and a text box's border, fill, margins and the text wrapping around it. What can't
// be put that way is described for InvoicePreview to fix on the drawn pages: the page border,
// and which side a floating table sits on.

import { loadDocxLibs } from '../documentRender';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const V = 'urn:schemas-microsoft-com:vml';
const O = 'urn:schemas-microsoft-com:office:office';
const W10 = 'urn:schemas-microsoft-com:office:word';
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
/** EMUs in a point: a VML length without a unit */
const EMU = 12700;
const PT_PER: Record<string, number> = { pt: 1, in: 72, cm: 72 / 2.54, mm: 72 / 25.4, px: 0.75, pc: 12 };
/** A text box's inner margins when Word's defaults are kept: left, top, right, bottom */
const TEXT_BOX_INSET = [7.2, 3.6, 7.2, 3.6];

/** The text column of the page, in points: where it starts and how wide it is */
export interface Column {
    left: number;
    width: number;
}

/** A US Letter page with inch margins, when the document doesn't say */
const LETTER_COLUMN: Column = { left: 72, width: 468 };

function children(el: Element, ns: string, name: string): Element[] {
    return Array.from(el.children).filter(c => c.namespaceURI === ns && c.localName === name);
}

const wAttr = (el: Element | undefined, name: string) => el?.getAttributeNS(W, name) ?? null;
/** A twips attribute in points */
const twips = (el: Element | undefined, name: string) => {
    const v = Number(wAttr(el, name));
    return Number.isFinite(v) && wAttr(el, name) !== null ? v / 20 : null;
};

/** A VML length ("1.5pt", ".1in", "12700") in points, or null */
function vmlPoints(value: string | null | undefined): number | null {
    const m = /^\s*(-?\d*\.?\d+)\s*([a-z]*)\s*$/i.exec(value ?? '');
    if (!m) return null;
    const unit = m[2].toLowerCase();
    if (!unit) return Number(m[1]) / EMU;
    return unit in PT_PER ? Number(m[1]) * PT_PER[unit] : null;
}

/** A VML colour ("#c00000", "white [3212]") as CSS */
function vmlColor(value: string | null | undefined): string | null {
    const color = value?.trim().split(/\s+/)[0];
    return color ? color : null;
}

const off = (value: string | null | undefined) => value === 'f' || value === 'false';

function parseStyle(style: string): Map<string, string> {
    const map = new Map<string, string>();
    for (const part of style.split(';')) {
        const i = part.indexOf(':');
        if (i > 0) map.set(part.slice(0, i).trim().toLowerCase(), part.slice(i + 1).trim());
    }
    return map;
}

/** The text box's border, fill and inner margins as CSS, for the picture docx-preview draws it as */
function textBoxLook(shape: Element, textbox: Element): [string, string][] {
    const css: [string, string][] = [['box-sizing', 'border-box']];
    const stroke = children(shape, V, 'stroke')[0];
    if (!off(shape.getAttribute('stroked')) && !off(stroke?.getAttribute('on'))) {
        const color = vmlColor(stroke?.getAttribute('color') ?? shape.getAttribute('strokecolor')) ?? '#000';
        const weight = vmlPoints(stroke?.getAttribute('weight') ?? shape.getAttribute('strokeweight')) ?? 0.75;
        css.push(['border', `${weight}pt solid ${color}`]);
    }
    const fill = children(shape, V, 'fill')[0];
    if (!off(shape.getAttribute('filled')) && !off(fill?.getAttribute('on'))) {
        css.push(['background', vmlColor(fill?.getAttribute('color') ?? shape.getAttribute('fillcolor')) ?? '#fff']);
    }
    const inset = (textbox.getAttribute('inset') ?? '').split(',');
    const [left, top, right, bottom] = TEXT_BOX_INSET.map((d, i) => vmlPoints(inset[i]) ?? d);
    css.push(['padding', `${top}pt ${right}pt ${bottom}pt ${left}pt`]);
    return css;
}

/**
 * Text wrapping around a text box ("square", "tight"…) as a float on the side it sits, so that
 * the text after it moves aside or below as in Word. A box in front of or behind the text, or
 * placed from the top of the page, keeps its place over the text.
 */
function wrapping(shape: Element, style: Map<string, string>, column: Column): Map<string, string> {
    const wrap = children(shape, W10, 'wrap')[0]?.getAttribute('type');
    const vertical = style.get('mso-position-vertical-relative') ?? 'text';
    if (!wrap || wrap === 'none' || !['text', 'paragraph', 'line'].includes(vertical)) return style;
    const pt = (key: string) => vmlPoints(style.get(key)) ?? 0;
    const width = pt('width');
    const relative = style.get('mso-position-horizontal-relative') ?? 'text';
    let x: number;
    switch (style.get('mso-position-horizontal')) {
        case 'left':
            x = 0;
            break;
        case 'right':
            x = column.width - width;
            break;
        case 'center':
            x = (column.width - width) / 2;
            break;
        default:
            x = pt('margin-left') + pt('left') - (relative === 'page' ? column.left : 0);
    }
    const top = pt('margin-top') + pt('top');
    const next = new Map([...style].filter(([k]) => !['position', 'left', 'top', 'margin-left', 'margin-top', 'z-index'].includes(k)));
    next.set('margin-top', `${top}pt`);
    next.set('margin-bottom', `${pt('mso-wrap-distance-bottom')}pt`);
    if (wrap === 'topAndBottom') {
        next.set('display', 'block');
        next.set('margin-left', `${x}pt`);
    } else if (x + width / 2 > column.width / 2) {
        next.set('float', 'right');
        next.set('margin-left', `${pt('mso-wrap-distance-left')}pt`);
        next.set('margin-right', `${column.width - x - width}pt`);
    } else {
        next.set('float', 'left');
        next.set('margin-left', `${x}pt`);
        next.set('margin-right', `${pt('mso-wrap-distance-right')}pt`);
    }
    return next;
}

/** The text column of the document's last section */
function textColumn(doc: Document): Column {
    const body = doc.getElementsByTagNameNS(W, 'body')[0];
    const sectPr = body && children(body, W, 'sectPr')[0];
    if (!sectPr) return LETTER_COLUMN;
    const size = children(sectPr, W, 'pgSz')[0];
    const margins = children(sectPr, W, 'pgMar')[0];
    const left = twips(margins, 'left') ?? LETTER_COLUMN.left;
    const page = twips(size, 'w') ?? LETTER_COLUMN.width + 2 * LETTER_COLUMN.left;
    return { left, width: page - left - (twips(margins, 'right') ?? LETTER_COLUMN.left) };
}

/**
 * Spaces at the end of a paragraph take no room in Word (they run on past the margin, and
 * aren't underlined): left in, they can wrap onto a line of their own beside a text box
 */
function trimTrailingSpaces(p: Element): void {
    const runs = children(p, W, 'r');
    for (let i = runs.length - 1; i >= 0; i--) {
        const content = Array.from(runs[i].children).filter(c => c.localName !== 'rPr');
        for (let k = content.length - 1; k >= 0; k--) {
            const c = content[k];
            if (c.namespaceURI !== W || c.localName !== 't') return;
            const text = (c.textContent ?? '').replace(/ +$/, '');
            c.textContent = text;
            if (text) return;
        }
    }
}

/** A part of the document (body, header or footer) with its objects and text boxes in a form docx-preview draws */
export function previewXml(xml: string, column: Column = LETTER_COLUMN): string {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return xml;
    let changed = false;
    // An embedded object shows its picture: drawn as a VML picture once the object is left out
    for (const object of Array.from(doc.getElementsByTagNameNS(W, 'object'))) {
        const pict = doc.createElementNS(W, 'w:pict');
        for (const c of Array.from(object.children)) if (!(c.namespaceURI === O && c.localName === 'OLEObject')) pict.appendChild(c);
        object.replaceWith(pict);
        changed = true;
    }
    // Lines and boxes drawn with Word's default outline, which docx-preview leaves out
    for (const name of ['line', 'rect', 'oval']) {
        for (const shape of Array.from(doc.getElementsByTagNameNS(V, name))) {
            if (off(shape.getAttribute('stroked')) || children(shape, V, 'stroke').length || shape.getElementsByTagNameNS(V, 'imagedata').length || shape.getElementsByTagNameNS(V, 'textbox').length) continue;
            const stroke = doc.createElementNS(V, 'v:stroke');
            stroke.setAttribute('color', vmlColor(shape.getAttribute('strokecolor')) ?? '#000');
            stroke.setAttribute('weight', `${vmlPoints(shape.getAttribute('strokeweight')) ?? 0.75}pt`);
            shape.appendChild(stroke);
            changed = true;
        }
    }
    // The paragraph mark takes a line's height as text does: an empty paragraph is as tall as in
    // Word, and the last line of one is as tall as its mark (a run that shows nothing, sized like it)
    for (const p of Array.from(doc.getElementsByTagNameNS(W, 'p'))) {
        trimTrailingSpaces(p);
        const mark = children(children(p, W, 'pPr')[0] ?? p, W, 'rPr')[0];
        const run = doc.createElementNS(W, 'w:r');
        if (mark) {
            const rPr = doc.createElementNS(W, 'w:rPr');
            for (const c of Array.from(mark.children)) if (!['ins', 'del', 'rPrChange'].includes(c.localName)) rPr.appendChild(c.cloneNode(true));
            run.appendChild(rPr);
        }
        const t = doc.createElementNS(W, 'w:t');
        t.textContent = '\u200b';
        run.appendChild(t);
        p.appendChild(run);
        changed = true;
    }
    // Pages break where the document says, not where Word last broke them (docx-preview starts
    // a page at each section unless told to follow the breaks, and then follows these too)
    for (const mark of Array.from(doc.getElementsByTagNameNS(W, 'lastRenderedPageBreak'))) {
        mark.remove();
        changed = true;
    }
    // A section's type says how it starts: the break after a section is the next one's
    const sections = Array.from(doc.getElementsByTagNameNS(W, 'sectPr'));
    for (const [i, sectPr] of sections.entries()) {
        const p = sectPr.parentElement?.parentElement;
        const next = sections[i + 1];
        if (!next || !p || p.namespaceURI !== W || p.localName !== 'p' || wAttr(children(next, W, 'type')[0], 'val') === 'continuous') continue;
        const run = doc.createElementNS(W, 'w:r');
        const br = doc.createElementNS(W, 'w:br');
        br.setAttributeNS(W, 'w:type', 'page');
        run.appendChild(br);
        p.appendChild(run);
        changed = true;
    }
    for (const textbox of Array.from(doc.getElementsByTagNameNS(V, 'textbox'))) {
        const shape = textbox.parentElement;
        if (!shape || shape.namespaceURI !== V) continue;
        const style = wrapping(shape, parseStyle(shape.getAttribute('style') ?? ''), column);
        for (const [k, v] of textBoxLook(shape, textbox)) style.set(k, v);
        shape.setAttribute('style', [...style].map(([k, v]) => `${k}:${v}`).join(';'));
        changed = true;
    }
    return changed ? new XMLSerializer().serializeToString(doc) : xml;
}

/** CSS line styles for Word's border styles; the rest (art borders too) draw as a plain line */
const LINE_STYLES: Record<string, string> = {
    none: 'none',
    nil: 'none',
    double: 'double',
    triple: 'double',
    dotted: 'dotted',
    dashed: 'dashed',
    dashSmallGap: 'dashed',
    dotDash: 'dashed',
    dotDotDash: 'dashed',
    threeDEmboss: 'ridge',
    threeDEngrave: 'groove',
    outset: 'outset',
    inset: 'inset',
};

/** Where the page border goes, as CSS for a box over the page, and on which pages */
export interface PageBorder {
    css: Record<string, string>;
    pages: 'all' | 'first' | 'notFirst';
}

/** The page border of the document's (last) section, if it has one */
function pageBorder(doc: Document): PageBorder | null {
    const body = doc.getElementsByTagNameNS(W, 'body')[0];
    const sectPr = body && children(body, W, 'sectPr')[0];
    const borders = sectPr && children(sectPr, W, 'pgBorders')[0];
    if (!borders) return null;
    const margins = children(sectPr, W, 'pgMar')[0];
    const fromText = wAttr(borders, 'offsetFrom') !== 'page';
    const css: Record<string, string> = { position: 'absolute', 'pointer-events': 'none' };
    let any = false;
    for (const side of ['top', 'right', 'bottom', 'left']) {
        const line = children(borders, W, side)[0];
        const val = wAttr(line, 'val');
        if (!line || !val || LINE_STYLES[val] === 'none') {
            css[side] = '0';
            continue;
        }
        const style = /^(thinThick|thickThin)/.test(val) ? 'double' : (LINE_STYLES[val] ?? 'solid');
        const size = (Number(wAttr(line, 'sz')) || 4) / 8;
        // A double line: Word's size is about one line's; CSS splits the width in three
        const width = style === 'double' ? Math.max(size * 1.5, 2.25) : size;
        const space = Number(wAttr(line, 'space')) || 0;
        const color = wAttr(line, 'color');
        const margin = twips(margins, side) ?? 72;
        css[side] = `${Math.max(0, fromText ? margin - space - width : space)}pt`;
        css[`border-${side}`] = `${width}pt ${style} ${color && color !== 'auto' ? `#${color}` : '#000'}`;
        any = true;
    }
    if (!any) return null;
    const display = wAttr(borders, 'display');
    return { css, pages: display === 'firstPage' ? 'first' : display === 'notFirstPage' ? 'notFirst' : 'all' };
}

/** A floating table (text wraps around it): docx-preview floats them all left, at the line they follow */
export interface FloatingTable {
    side: 'left' | 'right';
    /** How far below the line it follows, in points */
    top: number;
    /** How far from the left of the text column, for one on the left */
    left: number;
}

/** The floating tables of the body, in order (each text box once: as docx-preview draws its fallback copy) */
function floatingTables(doc: Document, column: Column): FloatingTable[] {
    const body = doc.getElementsByTagNameNS(W, 'body')[0];
    if (!body) return [];
    const inChoice = (el: Element) => {
        for (let p = el.parentElement; p; p = p.parentElement) if (p.namespaceURI === MC && p.localName === 'Choice') return true;
        return false;
    };
    return Array.from(body.getElementsByTagNameNS(W, 'tbl'))
        .filter(t => !inChoice(t))
        .flatMap(t => {
            const pos = children(children(t, W, 'tblPr')[0] ?? t, W, 'tblpPr')[0];
            if (!pos) return [];
            const spec = wAttr(pos, 'tblpXSpec');
            const top = (wAttr(pos, 'vertAnchor') ?? 'margin') === 'text' ? (twips(pos, 'tblpY') ?? 0) : 0;
            const left = Math.max(0, (twips(pos, 'tblpX') ?? 0) - (wAttr(pos, 'horzAnchor') === 'page' ? column.left : 0));
            return [{ side: spec === 'right' || spec === 'outside' ? 'right' : 'left', top, left } as FloatingTable];
        });
}

/** What is fixed on the pages once drawn */
export interface PageFixes {
    border: PageBorder | null;
    tables: FloatingTable[];
}

/** The Word file ready for docx-preview, and what to fix on the drawn pages (finishPages) */
export async function docxForPreview(bytes: ArrayBuffer): Promise<PageFixes & { bytes: ArrayBuffer }> {
    const { PizZip } = await loadDocxLibs();
    const zip = new PizZip(bytes);
    const documentXml = zip.file('word/document.xml')?.asText();
    const doc = documentXml ? new DOMParser().parseFromString(documentXml, 'application/xml') : null;
    const column = doc ? textColumn(doc) : LETTER_COLUMN;
    for (const part of zip.file(/^word\/(document|header\d*|footer\d*)\.xml$/)) {
        const xml = part.asText();
        const fixed = previewXml(xml, column);
        if (fixed !== xml) zip.file(part.name, fixed);
    }
    return {
        bytes: zip.generate({ type: 'arraybuffer' }),
        border: doc ? pageBorder(doc) : null,
        tables: doc ? floatingTables(doc, column) : [],
    };
}

/**
 * The pages docx-preview drew in `host` (with its class name), finished: the page border drawn,
 * floating tables on their side, and pictures filling their frames as Word stretches them.
 */
export function finishPages(host: HTMLElement, className: string, { border, tables }: PageFixes): HTMLElement[] {
    const pages = Array.from(host.querySelectorAll<HTMLElement>(`section.${className}`));
    if (border) {
        pages.forEach((page, i) => {
            if ((border.pages === 'first' && i > 0) || (border.pages === 'notFirst' && i === 0)) return;
            const box = document.createElement('div');
            for (const [k, v] of Object.entries(border.css)) box.style.setProperty(k, v);
            page.appendChild(box);
        });
    }
    // Matched in order; if the counts differ, a table can't be told from another and all stay left
    const floating = pages.flatMap(page => Array.from(page.querySelectorAll<HTMLElement>(':scope > article table')).filter(t => t.style.float));
    if (floating.length === tables.length) {
        floating.forEach((table, i) => {
            const { side, top, left } = tables[i];
            table.style.float = side;
            if (side === 'right') table.style.marginRight = '0';
            else table.style.marginLeft = `${left}pt`;
            // docx-preview writes the room above it in points
            if (top) table.style.marginTop = `${(/^-?[\d.]+pt$/.test(table.style.marginTop) ? parseFloat(table.style.marginTop) : 0) + top}pt`;
        });
    }
    for (const image of Array.from(host.querySelectorAll('svg image'))) image.setAttribute('preserveAspectRatio', 'none');
    lineHeights(host, className);
    const style = document.createElement('style');
    style.textContent = [
        // Lines as tall as their text (lineHeights): the paragraph itself adds no height. Text
        // with no size of its own is Word's default 10 pt
        `:where(section.${className}) p { font-size: 10pt; line-height: 0; --p-lh: 1; --p-lh-exact: initial; --p-lh-min: 0pt; }`,
        `section.${className} span { line-height: var(--p-lh-exact, max(var(--p-lh-min), calc(var(--p-lh) * var(--font-line, ${DEFAULT_FONT_LINE}) * 1em))); }`,
        // A word too long for the room beside a text box goes below it, as in Word, not broken
        // in two; inside a text box a long one (an email address) still breaks to fit
        `section.${className} > article span { overflow-wrap: normal; }`,
        // Word hyphenates only when told to
        `section.${className} { hyphens: manual; }`,
        `section.${className} foreignObject span { overflow-wrap: break-word; }`,
    ].join('\n');
    host.appendChild(style);
    return pages;
}

/** Each font's line height in Word, as a multiple of its size (from the font's own metrics) */
const FONT_LINE: Record<string, number> = {
    calibri: 1.2207,
    'calibri light': 1.2207,
    aptos: 1.21,
    'aptos display': 1.21,
    arial: 1.149,
    helvetica: 1.149,
    'arial narrow': 1.13,
    'times new roman': 1.149,
    cambria: 1.172,
    georgia: 1.136,
    verdana: 1.215,
    tahoma: 1.207,
    'segoe ui': 1.33,
    'century gothic': 1.226,
    garamond: 1.12,
    'book antiqua': 1.17,
    'palatino linotype': 1.141,
    'trebuchet ms': 1.162,
    'comic sans ms': 1.394,
    'courier new': 1.133,
};
const DEFAULT_FONT_LINE = 1.17;

/** A paragraph's line spacing as docx-preview writes it, as the custom property its text reads */
function spacingProperty(value: string): [string, string] | null {
    const atLeast = /^calc\(100% \+ (-?[\d.]+pt)\)$/.exec(value);
    if (atLeast) return ['--p-lh-min', atLeast[1]];
    if (/^-?[\d.]+pt$/.test(value)) return ['--p-lh-exact', value];
    if (/^[\d.]+$/.test(value)) return ['--p-lh', value];
    return null;
}

/**
 * Word's lines: "single" is the font's own line height (Calibri's is 1.22 times its size), "1.08"
 * that much more, and a line is as tall as its tallest text. docx-preview gives the paragraph a
 * multiple of the font size, so lines come out shorter and what is placed below them (a text
 * box, the next page) moves up. Here the paragraph's spacing becomes custom properties, and
 * each piece of text gets its font's line height, for the span rule in finishPages.
 */
function lineHeights(host: HTMLElement, className: string): void {
    for (const style of Array.from(host.querySelectorAll('style'))) {
        style.textContent = (style.textContent ?? '').replace(/line-height:\s*([^;}\n]+?)\s*(?=[;}\n])/g, (m, v: string) => {
            const prop = spacingProperty(v);
            return prop ? `${prop[0]}: ${prop[1]}` : m;
        });
    }
    for (const p of Array.from(host.querySelectorAll<HTMLElement>(`section.${className} p`))) {
        const prop = p.style.lineHeight && spacingProperty(p.style.lineHeight);
        if (!prop) continue;
        p.style.removeProperty('line-height');
        p.style.setProperty(prop[0], prop[1]);
    }
    for (const span of Array.from(host.querySelectorAll<HTMLElement>(`section.${className} span`))) {
        const family = getComputedStyle(span).fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase();
        span.style.setProperty('--font-line', String(FONT_LINE[family] ?? DEFAULT_FONT_LINE));
    }
}
