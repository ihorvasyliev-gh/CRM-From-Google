// ─── Certificates: a filled Word file drawn as page pictures ───
// docx-preview lays the pages out (as for Word invoices: docxForPreview / finishPages), in a
// frame of its own so that nothing of the app's styling reaches them. Certificates are built
// from pictures placed on the page (the border behind everything, logos at fixed places), which
// docx-preview puts beside the text it is anchored to: here each one is moved to its place on
// the page. Each page is then drawn onto a canvas, as the picture the PDF is made of and the
// preview shows, so the preview is the PDF.

import { docxForPreview, finishPages } from '../chequeReq/docxPreview';
import { loadDocxLibs } from '../documentRender';
import { loadChunk } from '../deployRecovery';

const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const EMU_PER_PT = 12700;
const PX_PER_PT = 4 / 3;
const CLASS = 'cert-page';

/** Where a picture anchored to the text sits: Word's positionH / positionV */
interface Position {
    from: string;
    align: string | null;
    /** Points */
    offset: number;
}

/** A floating picture, in the order docx-preview draws the drawings of the body */
export interface Anchor {
    h: Position;
    v: Position;
    /** Behind the text */
    behind: boolean;
    /** Points */
    width: number;
    height: number;
}

function child(el: Element, ns: string, name: string): Element | undefined {
    return Array.from(el.children).find(c => c.namespaceURI === ns && c.localName === name);
}

function position(anchor: Element, name: string): Position {
    const el = child(anchor, WP, name);
    const offset = Number(el && child(el, WP, 'posOffset')?.textContent);
    return {
        from: el?.getAttribute('relativeFrom') ?? 'page',
        align: (el && child(el, WP, 'align')?.textContent?.trim()) || null,
        offset: Number.isFinite(offset) ? offset / EMU_PER_PT : 0,
    };
}

/**
 * The drawings of the document's body, in order, as docx-preview draws them: one inside the
 * Word 2010 choice of alternate content is left out, as it draws the fallback. A drawing in
 * line with the text, or one docx-preview sets on its own line (top and bottom wrapping), is
 * null: it stays where it is drawn.
 */
export function readAnchors(documentXml: string): (Anchor | null)[] {
    const doc = new DOMParser().parseFromString(documentXml, 'application/xml');
    const body = doc.getElementsByTagNameNS(W, 'body')[0];
    if (!body) return [];
    const inChoice = (el: Element) => {
        for (let p = el.parentElement; p; p = p.parentElement) if (p.namespaceURI === MC && p.localName === 'Choice') return true;
        return false;
    };
    return Array.from(body.getElementsByTagNameNS(W, 'drawing'))
        .filter(d => !inChoice(d))
        .map(d => {
            const anchor = child(d, WP, 'anchor');
            if (!anchor || child(anchor, WP, 'wrapTopAndBottom')) return null;
            const extent = child(anchor, WP, 'extent');
            const simple = anchor.getAttribute('simplePos') === '1' || anchor.getAttribute('simplePos') === 'true';
            const simplePos = simple ? child(anchor, WP, 'simplePos') : undefined;
            const at = (attr: string) => Number(simplePos?.getAttribute(attr) ?? 0) / EMU_PER_PT;
            return {
                h: simplePos ? { from: 'page', align: null, offset: at('x') } : position(anchor, 'positionH'),
                v: simplePos ? { from: 'page', align: null, offset: at('y') } : position(anchor, 'positionV'),
                behind: ['1', 'true'].includes(anchor.getAttribute('behindDoc') ?? ''),
                width: Number(extent?.getAttribute('cx') ?? 0) / EMU_PER_PT,
                height: Number(extent?.getAttribute('cy') ?? 0) / EMU_PER_PT,
            };
        });
}

/** A box along one side of the page, in points: where it starts and how long it is */
type Span = [start: number, length: number];

function place(pos: Position, size: number, page: number, before: number, after: number, text: Span): number {
    const spans: Record<string, Span> = {
        page: [0, page],
        margin: [before, page - before - after],
        column: [before, page - before - after],
        insideMargin: [0, before],
        outsideMargin: [page - after, after],
        leftMargin: [0, before],
        topMargin: [0, before],
        rightMargin: [page - after, after],
        bottomMargin: [page - after, after],
    };
    const [start, length] = spans[pos.from] ?? text;
    switch (pos.align) {
        case 'left':
        case 'top':
        case 'inside':
            return start;
        case 'center':
            return start + (length - size) / 2;
        case 'right':
        case 'bottom':
        case 'outside':
            return start + length - size;
        default:
            return start + pos.offset;
    }
}

/** docx-preview's box round a drawing */
function isDrawing(el: HTMLElement): boolean {
    return el.tagName === 'DIV' && el.style.display === 'inline-block' && el.style.position === 'relative' && el.style.textIndent === '0px';
}

const pt = (value: string) => (/pt$/.test(value) ? parseFloat(value) : parseFloat(value) / PX_PER_PT) || 0;

/**
 * The floating pictures moved to their places on the page, and each page cut to its size as
 * Word prints it. Matched in order: if docx-preview drew a different number of drawings, they
 * are left where it put them.
 */
export function placeAnchors(pages: HTMLElement[], anchors: (Anchor | null)[]): void {
    const drawings = pages.flatMap(page => Array.from(page.querySelectorAll<HTMLElement>(':scope > article div')).filter(isDrawing));
    const placed = drawings.length === anchors.length
        ? drawings.flatMap((el, i) => {
            const anchor = anchors[i];
            const page = el.closest('section');
            if (!anchor || !page) return [];
            const paragraph = el.closest('p') ?? el.parentElement!;
            // Out of the line first, so the text closes up before the paragraphs are measured;
            // the run it was in goes too, when nothing else is left in it
            const run = el.parentElement;
            page.appendChild(el);
            if (run?.tagName === 'SPAN' && !run.childNodes.length) run.remove();
            el.style.position = 'absolute';
            el.style.display = 'block';
            el.style.width = `${anchor.width}pt`;
            el.style.height = `${anchor.height}pt`;
            el.style.zIndex = anchor.behind ? '-1' : '1';
            return [{ el, anchor, page, paragraph }];
        })
        : [];
    for (const page of pages) {
        page.style.isolation = 'isolate';
        page.style.overflow = 'hidden';
        page.style.height = page.style.minHeight;
        page.style.boxSizing = 'border-box';
    }
    for (const { el, anchor, page, paragraph } of placed) {
        const css = page.style;
        const [top, right, bottom, left] = [css.paddingTop, css.paddingRight, css.paddingBottom, css.paddingLeft].map(pt);
        const box = page.getBoundingClientRect();
        const at = paragraph.getBoundingClientRect();
        const textX: Span = [(at.left - box.left) / PX_PER_PT, at.width / PX_PER_PT];
        const textY: Span = [(at.top - box.top) / PX_PER_PT, at.height / PX_PER_PT];
        el.style.left = `${place(anchor.h, anchor.width, pt(css.width), left, right, textX)}pt`;
        el.style.top = `${place(anchor.v, anchor.height, pt(css.minHeight), top, bottom, textY)}pt`;
    }
}

/**
 * A line of exact height is that tall in Word whatever its paragraph mark's size. Here the mark
 * (the empty run docxForPreview adds) sits on the line beside the text and, in another size,
 * makes it taller: on a line with text it is taken out.
 */
export function exactLines(pages: HTMLElement[]): void {
    for (const p of pages.flatMap(page => Array.from(page.querySelectorAll<HTMLElement>('p')))) {
        if (!p.style.getPropertyValue('--p-lh-exact')) continue;
        const mark = p.lastElementChild;
        if (mark?.tagName !== 'SPAN' || mark.textContent !== '\u200b' || !(p.textContent ?? '').replace(/\u200b/g, '').trim()) continue;
        mark.remove();
    }
}

/**
 * The text formatting of the default paragraph style (Normal: its font, its size) on the text
 * itself. docx-preview writes it for the paragraph only (".page p, p.normal span"), where the
 * document's defaults written for every run (".page span") win over it; in Word, Normal's
 * formatting wins over the defaults. :where keeps it as weak as the defaults, after them.
 */
export function defaultStyleRuns(css: string, className: string): string {
    const cls = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return css.replace(new RegExp(`\\.${cls} (\\w+), (\\w+)\\.(${cls}_[\\w-]+) (\\w+)(\\s*\\{)`, 'g'), (_m, target, t2, name, sub, brace) =>
        `.${className} :where(${target}) ${sub}, ${t2}.${name} ${sub}${brace}`);
}

const RENDER_OPTIONS = {
    className: CLASS,
    inWrapper: false,
    experimental: true,
    useBase64URL: true,
    ignoreLastRenderedPageBreak: false,
    renderComments: false,
    renderChanges: false,
    renderHeaders: true,
    renderFooters: true,
};

/** Pictures keep the size Word gives them (the app's own styles never reach the frame, but a browser's might) */
const PAGE_CSS = `section.${CLASS} { position: relative; background: #fff; color: #000; margin: 0; } section.${CLASS} img { max-width: none; }`;

/** A page drawn: its size in points and the picture */
export interface PagePicture {
    width: number;
    height: number;
    canvas: HTMLCanvasElement;
}

let frame: HTMLIFrameElement | null = null;

/** The frame the pages are laid out in: unseen, with nothing of the app's styling */
function layoutFrame(): Document {
    if (!frame || !frame.isConnected) {
        frame = document.createElement('iframe');
        frame.setAttribute('aria-hidden', 'true');
        frame.tabIndex = -1;
        frame.style.cssText = 'position:fixed;left:-20000px;top:0;width:1600px;height:1200px;border:0;visibility:hidden;pointer-events:none';
        document.body.appendChild(frame);
        const doc = frame.contentDocument!;
        doc.open();
        doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"></body></html>');
        doc.close();
    }
    return frame.contentDocument!;
}

/** Wait for the pictures and fonts of the laid-out pages */
async function settled(host: HTMLElement): Promise<void> {
    await Promise.all(Array.from(host.querySelectorAll('img')).map(img => (img.complete ? null : img.decode().catch(() => null))));
    await host.ownerDocument.fonts?.ready;
}

/** The page as an SVG picture: the page itself, with the styles docx-preview wrote for it */
function pageSvg(page: HTMLElement, styles: string, width: number, height: number): string {
    const serializer = new XMLSerializer();
    const clone = page.cloneNode(true) as HTMLElement;
    clone.style.margin = '0';
    const xhtml = `<div xmlns="http://www.w3.org/1999/xhtml"><style>${styles.replace(/<\/style/gi, '')}</style>${serializer.serializeToString(clone)}</div>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="${width}" height="${height}">${xhtml}</foreignObject></svg>`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('The page could not be drawn'));
        img.src = src;
    });
}

/**
 * A filled certificate (a .docx) as pictures of its pages, `dpi` dots to the inch. Laid out on
 * this device, with the fonts it has.
 */
export async function drawDocxPages(bytes: ArrayBuffer, dpi = 200): Promise<PagePicture[]> {
    const [{ renderAsync }, prepared] = await Promise.all([loadChunk(() => import('docx-preview')), docxForPreview(bytes)]);
    const { PizZip } = await loadDocxLibs();
    const documentXml = new PizZip(prepared.bytes).file('word/document.xml')?.asText() ?? '';
    const anchors = readAnchors(documentXml);

    const doc = layoutFrame();
    const host = doc.createElement('div');
    doc.body.appendChild(host);
    try {
        const drawn = doc.createElement('div');
        await renderAsync(prepared.bytes, drawn, undefined, RENDER_OPTIONS);
        host.replaceChildren(...Array.from(drawn.childNodes));
        const extra = doc.createElement('style');
        extra.textContent = PAGE_CSS;
        host.prepend(extra);
        for (const style of Array.from(host.querySelectorAll('style'))) style.textContent = defaultStyleRuns(style.textContent ?? '', CLASS);
        // The fonts kept in the Word file, loaded before anything is measured
        await Promise.all(Array.from(doc.fonts ?? []).map(f => f.load().catch(() => null)));
        const pages = finishPages(host, CLASS, prepared);
        exactLines(pages);
        placeAnchors(pages, anchors);
        await settled(host);

        const styles = Array.from(host.querySelectorAll('style')).map(s => s.textContent ?? '').join('\n');
        const pictures: PagePicture[] = [];
        for (const page of pages) {
            const width = pt(page.style.width);
            const height = pt(page.style.minHeight);
            const cssW = Math.round(width * PX_PER_PT);
            const cssH = Math.round(height * PX_PER_PT);
            const svg = pageSvg(page, styles, cssW, cssH);
            const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
            const scale = dpi / 96;
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(cssW * scale);
            canvas.height = Math.round(cssH * scale);
            const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            pictures.push({ width, height, canvas });
        }
        return pictures;
    } finally {
        host.remove();
    }
}

/** The fonts the Word file carries inside it (Word: Options → Save → Embed fonts in the file) */
export async function embeddedFonts(bytes: ArrayBuffer): Promise<string[]> {
    const { PizZip } = await loadDocxLibs();
    const xml = new PizZip(bytes).file('word/fontTable.xml')?.asText();
    if (!xml) return [];
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    return Array.from(doc.getElementsByTagNameNS(W, 'font'))
        .filter(f => Array.from(f.children).some(c => c.namespaceURI === W && /^embed(Regular|Bold|Italic|BoldItalic)$/.test(c.localName)))
        .map(f => f.getAttributeNS(W, 'name') ?? '')
        .filter(Boolean);
}
