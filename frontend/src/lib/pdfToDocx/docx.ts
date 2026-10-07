// ─── Writing the Word document ─────────────────────────────────
// Every PDF page becomes a Word page of the same size. Nothing flows: each line
// of text is a text box, each filled or outlined path a shape and each image a
// picture, all anchored to the page at the PDF's own coordinates, in the PDF's
// paint order. Form fields go on top: text in plain-text content controls, and
// checkboxes as check box content controls, so they still work in Word.

import PizZip from 'pizzip';
import type { TextLine, TextRun } from './lines';
import type { Box, ImagePlacement, Segment, VectorShape } from './types';

const EMU_PER_PT = 12700;
const TWIPS_PER_PT = 20;
/** Word's own range for relativeHeight starts here; we keep paint order above it */
const Z_BASE = 251658240;
/** Fields and checkboxes sit above everything copied from the PDF */
const Z_FIELDS = 1_000_000;
/** Colour Word's own form fields print in: near-black, a touch of blue */
const VALUE_COLOR = '0D0D1A';
export const VALUE_FONT = 'Arial';

export interface TextFieldOut {
    kind: 'text';
    name: string;
    rect: Box;
    value: string;
    fontSize: number;
    multiline: boolean;
    align: 'left' | 'center';
    valign: 'top' | 'middle' | 'bottom';
}

export interface CheckFieldOut {
    kind: 'check';
    name: string;
    rect: Box;
    checked: boolean;
}

export type FieldOut = TextFieldOut | CheckFieldOut;

export interface PictureOut {
    placement: ImagePlacement;
    /** PNG bytes */
    png: Uint8Array;
}

export interface DocxPageIn {
    w: number;
    h: number;
    lines: TextLine[];
    shapes: VectorShape[];
    pictures: PictureOut[];
    fields: FieldOut[];
}

export interface DocxOptions {
    title?: string;
    /** How a ticked box is marked */
    mark?: 'tick' | 'cross';
}

// ─── XML helpers ───────────────────────────────────────────────

// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function xmlText(s: string): string {
    return s.replace(INVALID_XML, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function xmlAttr(s: string): string {
    return xmlText(s).replace(/"/g, '&quot;');
}

const emu = (pt: number) => Math.round(pt * EMU_PER_PT);
const twips = (pt: number) => Math.round(pt * TWIPS_PER_PT);

function color(c: string, alpha = 1): string {
    const a = alpha < 0.999 ? `<a:alpha val="${Math.round(Math.max(0, alpha) * 100000)}"/>` : '';
    return `<a:solidFill><a:srgbClr val="${c}">${a}</a:srgbClr></a:solidFill>`;
}

const NS = [
    'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"',
    'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"',
    'xmlns:o="urn:schemas-microsoft-com:office:office"',
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
    'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"',
    'xmlns:v="urn:schemas-microsoft-com:vml"',
    'xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"',
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
    'xmlns:w10="urn:schemas-microsoft-com:office:word"',
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
    'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"',
    'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"',
    'xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"',
    'xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"',
    'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"',
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
    'mc:Ignorable="w14 wp14"',
].join(' ');

// ─── The document body ─────────────────────────────────────────

class Writer {
    private nextId = 1;
    private nextSdt = 1000;
    readonly media: { name: string; rId: string; data: Uint8Array }[] = [];
    /** The same image used again (a logo on every page) is stored once */
    private readonly mediaFor = new Map<Uint8Array, { name: string; rId: string }>();

    constructor(private readonly opts: DocxOptions) {}

    id(): number {
        return this.nextId++;
    }

    sdtId(): number {
        return this.nextSdt++;
    }

    /** An anchored drawing at (x, top) in points from the page's top-left corner */
    anchor(box: { x: number; top: number; w: number; h: number }, z: number, graphic: string, name: string): string {
        const id = this.id();
        return (
            `<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${Z_BASE + z * 2}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">` +
            '<wp:simplePos x="0" y="0"/>' +
            `<wp:positionH relativeFrom="page"><wp:posOffset>${emu(box.x)}</wp:posOffset></wp:positionH>` +
            `<wp:positionV relativeFrom="page"><wp:posOffset>${emu(box.top)}</wp:posOffset></wp:positionV>` +
            `<wp:extent cx="${Math.max(1, emu(box.w))}" cy="${Math.max(1, emu(box.h))}"/>` +
            '<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>' +
            `<wp:docPr id="${id}" name="${xmlAttr(name)} ${id}"/><wp:cNvGraphicFramePr/>` +
            graphic +
            '</wp:anchor>'
        );
    }

    /** A Word 2010 shape (wps), with the alternate-content wrapper Word itself writes */
    shapeRun(box: { x: number; top: number; w: number; h: number }, z: number, wsp: string, name: string): string {
        const graphic = `<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp>${wsp}</wps:wsp></a:graphicData></a:graphic>`;
        return `<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing>${this.anchor(box, z, graphic, name)}</w:drawing></mc:Choice><mc:Fallback/></mc:AlternateContent></w:r>`;
    }

    textBox(box: { x: number; top: number; w: number; h: number }, z: number, paragraphs: string, opts: { wrap: boolean; anchor: 't' | 'ctr' | 'b'; rot?: number }, name: string): string {
        const rot = opts.rot ? ` rot="${Math.round(opts.rot * 60000)}"` : '';
        const wsp =
            '<wps:cNvSpPr txBox="1"/>' +
            `<wps:spPr><a:xfrm${rot}><a:off x="0" y="0"/><a:ext cx="${Math.max(1, emu(box.w))}" cy="${Math.max(1, emu(box.h))}"/></a:xfrm>` +
            '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></wps:spPr>' +
            `<wps:txbx><w:txbxContent>${paragraphs}</w:txbxContent></wps:txbx>` +
            `<wps:bodyPr rot="0" vert="horz" wrap="${opts.wrap ? 'square' : 'none'}" lIns="0" tIns="0" rIns="0" bIns="0" anchor="${opts.anchor}" anchorCtr="0" upright="1"><a:noAutofit/></wps:bodyPr>`;
        return this.shapeRun(box, z, wsp, name);
    }

    // ── Text copied from the PDF ──

    line(line: TextLine, pageH: number): string {
        const h = line.ascent + line.descent;
        const w = line.width + Math.max(2, line.width * 0.02);
        const runs = line.runs.map(r => runXml(r)).join('');
        const para = `<w:p>${PARA_PROPS}${runs}</w:p>`;
        if (line.angle === 0) {
            return this.textBox({ x: line.x, top: pageH - line.baseline - line.ascent, w, h }, line.z, para, { wrap: false, anchor: 't' }, 'Text');
        }
        // Rotated text: place the unrotated box so that turning it about its centre lands it on the PDF's text
        const rad = (line.angle * Math.PI) / 180;
        const cu = w / 2;
        const cv = (line.ascent - line.descent) / 2;
        const cx = line.x + cu * Math.cos(rad) - cv * Math.sin(rad);
        const cy = line.baseline + cu * Math.sin(rad) + cv * Math.cos(rad);
        const rot = (((-line.angle % 360) + 360) % 360);
        return this.textBox({ x: cx - w / 2, top: pageH - cy - h / 2, w, h }, line.z, para, { wrap: false, anchor: 't', rot }, 'Text');
    }

    // ── Vector shapes ──

    shape(s: VectorShape, pageH: number): string {
        const sw = s.stroke?.width ?? 0;
        const fill = s.fill ? color(s.fill.color, s.fill.alpha) : '<a:noFill/>';
        const ln = s.stroke ? `<a:ln w="${emu(sw)}">${color(s.stroke.color, s.stroke.alpha)}</a:ln>` : '<a:ln><a:noFill/></a:ln>';
        const box = { x: s.box.x, top: pageH - s.box.y - s.box.h, w: s.box.w, h: s.box.h };

        // A straight stroked line: Word's own line shape
        const pts = s.segments.filter(g => g.op !== 'Z');
        if (!s.fill && pts.length === 2 && pts.every(p => p.op !== 'C')) {
            const [a, b] = pts as Extract<Segment, { op: 'M' | 'L' }>[];
            // prstGeom "line" runs from the top-left to the bottom-right corner unless flipped
            const flipV = (b.x < a.x) !== (b.y > a.y) && box.w > 0 && box.h > 0 ? ' flipV="1"' : '';
            const wsp =
                '<wps:cNvCnPr/>' +
                `<wps:spPr><a:xfrm${flipV}><a:off x="0" y="0"/><a:ext cx="${Math.max(1, emu(box.w))}" cy="${Math.max(1, emu(box.h))}"/></a:xfrm>` +
                `<a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:noFill/>${ln}</wps:spPr><wps:bodyPr/>`;
            return this.shapeRun(box, s.z, wsp, 'Line');
        }

        let geom: string;
        if (s.isRect) {
            geom = '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
        } else {
            const W = Math.max(1, emu(box.w));
            const H = Math.max(1, emu(box.h));
            const px = (x: number) => Math.round(((x - s.box.x) / Math.max(s.box.w, 1e-6)) * W) || 0;
            const py = (y: number) => Math.round(((s.box.y + s.box.h - y) / Math.max(s.box.h, 1e-6)) * H) || 0;
            const pt = (x: number, y: number) => `<a:pt x="${px(x)}" y="${py(y)}"/>`;
            const path = s.segments
                .map(g =>
                    g.op === 'M' ? `<a:moveTo>${pt(g.x, g.y)}</a:moveTo>`
                    : g.op === 'L' ? `<a:lnTo>${pt(g.x, g.y)}</a:lnTo>`
                    : g.op === 'C' ? `<a:cubicBezTo>${pt(g.x1, g.y1)}${pt(g.x2, g.y2)}${pt(g.x, g.y)}</a:cubicBezTo>`
                    : '<a:close/>',
                )
                .join('');
            geom =
                '<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/>' +
                `<a:pathLst><a:path w="${W}" h="${H}"${s.fill ? '' : ' fill="none"'}>${path}</a:path></a:pathLst></a:custGeom>`;
        }
        const wsp =
            '<wps:cNvSpPr/>' +
            `<wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.max(1, emu(box.w))}" cy="${Math.max(1, emu(box.h))}"/></a:xfrm>${geom}${fill}${ln}</wps:spPr>` +
            '<wps:bodyPr rot="0" vert="horz" wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t" anchorCtr="0" upright="1"><a:noAutofit/></wps:bodyPr>';
        return this.shapeRun(box, s.z, wsp, s.isRect ? 'Rectangle' : 'Shape');
    }

    // ── Pictures ──

    picture(p: PictureOut, pageH: number): string {
        let stored = this.mediaFor.get(p.png);
        if (!stored) {
            const n = this.media.length + 1;
            stored = { name: `image${n}.png`, rId: `rIdImg${n}` };
            this.media.push({ ...stored, data: p.png });
            this.mediaFor.set(p.png, stored);
        }
        const { name, rId } = stored;
        const { box, clip, flipH, flipV } = p.placement;
        const shown = clip ?? box;
        let srcRect = '';
        if (clip) {
            const pct = (v: number, of: number) => Math.round((v / of) * 100000);
            srcRect = `<a:srcRect l="${pct(clip.x - box.x, box.w)}" t="${pct(box.y + box.h - (clip.y + clip.h), box.h)}" r="${pct(box.x + box.w - (clip.x + clip.w), box.w)}" b="${pct(clip.y - box.y, box.h)}"/>`;
        }
        const flips = `${flipH ? ' flipH="1"' : ''}${flipV ? ' flipV="1"' : ''}`;
        const cx = Math.max(1, emu(shown.w));
        const cy = Math.max(1, emu(shown.h));
        const graphic =
            '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>' +
            `<pic:nvPicPr><pic:cNvPr id="0" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>` +
            `<pic:blipFill><a:blip r:embed="${rId}"/>${srcRect}<a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
            `<pic:spPr><a:xfrm${flips}><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
            '</pic:pic></a:graphicData></a:graphic>';
        return `<w:r><w:drawing>${this.anchor({ x: shown.x, top: pageH - shown.y - shown.h, w: shown.w, h: shown.h }, p.placement.z, graphic, 'Picture')}</w:drawing></w:r>`;
    }

    // ── Form fields ──

    field(f: FieldOut, pageH: number, order: number): string {
        const z = Z_FIELDS + order;
        const box = { x: f.rect.x, top: pageH - f.rect.y - f.rect.h, w: f.rect.w, h: f.rect.h };
        if (f.kind === 'check') return this.checkbox(f, box, z);

        const size = Math.max(2, Math.round(f.fontSize * 2));
        const rPr = `<w:rPr><w:rFonts w:ascii="${VALUE_FONT}" w:hAnsi="${VALUE_FONT}" w:cs="${VALUE_FONT}" w:eastAsia="${VALUE_FONT}"/><w:color w:val="${VALUE_COLOR}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>`;
        const lines = f.value.replace(/\r\n?/g, '\n').split('\n');
        const empty = !f.value.trim();
        const content = empty
            ? `<w:r><w:rPr><w:rStyle w:val="PlaceholderText"/><w:rFonts w:ascii="${VALUE_FONT}" w:hAnsi="${VALUE_FONT}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${'\u00A0'.repeat(3)}</w:t></w:r>`
            : lines.map((l, i) => `${i > 0 ? `<w:r>${rPr}<w:br/></w:r>` : ''}<w:r>${rPr}<w:t xml:space="preserve">${xmlText(l)}</w:t></w:r>`).join('');
        const sdt =
            `<w:sdt><w:sdtPr>${rPr}<w:alias w:val="${xmlAttr(f.name.slice(0, 60))}"/><w:tag w:val="${xmlAttr(f.name.slice(0, 60))}"/><w:id w:val="${this.sdtId()}"/>` +
            `${empty ? '<w:showingPlcHdr/>' : ''}<w:text${f.multiline ? ' w:multiLine="1"' : ''}/></w:sdtPr><w:sdtContent>${content}</w:sdtContent></w:sdt>`;
        const jc = f.align === 'center' ? '<w:jc w:val="center"/>' : '';
        const para = `<w:p><w:pPr><w:snapToGrid w:val="0"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:left="0" w:right="0"/>${jc}</w:pPr>${sdt}</w:p>`;
        const anchor = f.valign === 'top' ? 't' : f.valign === 'bottom' ? 'b' : 'ctr';
        return this.textBox(box, z, para, { wrap: true, anchor }, f.name || 'Field');
    }

    /** A check box content control: blank until ticked, the PDF's own box stays visible around it */
    private checkbox(f: CheckFieldOut, box: { x: number; top: number; w: number; h: number }, z: number): string {
        const cross = this.opts.mark === 'cross';
        // Wingdings 0xFC is ✓ and 0xFB is ✗; an en space keeps the control clickable when empty
        const markCode = cross ? 'F0FB' : 'F0FC';
        const size = Math.max(4, Math.round(Math.min(box.h * 1.05, box.w * 1.3) * 2));
        const markRun = `<w:r><w:rPr><w:rFonts w:ascii="Wingdings" w:hAnsi="Wingdings" w:cs="Wingdings" w:eastAsia="Wingdings"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:sym w:font="Wingdings" w:char="${markCode}"/></w:r>`;
        const blankRun = `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">\u2002</w:t></w:r>`;
        const sdt =
            `<w:sdt><w:sdtPr><w:alias w:val="${xmlAttr(f.name.slice(0, 60))}"/><w:id w:val="${this.sdtId()}"/>` +
            `<w14:checkbox><w14:checked w14:val="${f.checked ? 1 : 0}"/><w14:checkedState w14:val="${markCode.slice(2).padStart(4, '0')}" w14:font="Wingdings"/><w14:uncheckedState w14:val="2002" w14:font="Arial"/></w14:checkbox>` +
            `</w:sdtPr><w:sdtContent>${f.checked ? markRun : blankRun}</w:sdtContent></w:sdt>`;
        const para = `<w:p><w:pPr><w:snapToGrid w:val="0"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:left="0" w:right="0"/><w:jc w:val="center"/></w:pPr>${sdt}</w:p>`;
        // Slightly larger than the printed box so the mark is not clipped
        const grow = Math.max(1, box.h * 0.15);
        return this.textBox({ x: box.x - grow, top: box.top - grow, w: box.w + 2 * grow, h: box.h + 2 * grow }, z, para, { wrap: false, anchor: 'ctr' }, f.name || 'Check box');
    }
}

const PARA_PROPS = '<w:pPr><w:snapToGrid w:val="0"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:left="0" w:right="0"/></w:pPr>';

function runXml(r: TextRun): string {
    const f = xmlAttr(r.family);
    const symbol = /^(symbol|wingdings|webdings)/i.test(r.family);
    const props =
        `<w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}" w:eastAsia="${f}"/>` +
        (r.bold ? '<w:b/><w:bCs/>' : '') +
        (r.italic ? '<w:i/><w:iCs/>' : '') +
        (r.color !== '000000' ? `<w:color w:val="${r.color}"/>` : '') +
        (r.spacing ? `<w:spacing w:val="${r.spacing}"/>` : '') +
        `<w:sz w:val="${r.halfPoints}"/><w:szCs w:val="${r.halfPoints}"/>`;
    if (symbol) {
        // Symbol fonts: one <w:sym> per character, the way Word stores them
        return [...r.text]
            .map(ch => {
                const code = ch.codePointAt(0) ?? 0x20;
                return code >= 0xf000 && code <= 0xf0ff
                    ? `<w:r><w:rPr>${props}</w:rPr><w:sym w:font="${f}" w:char="${code.toString(16).toUpperCase()}"/></w:r>`
                    : `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${xmlText(ch)}</w:t></w:r>`;
            })
            .join('');
    }
    return `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${xmlText(r.text)}</w:t></w:r>`;
}

function sectPr(w: number, h: number, last: boolean): string {
    const W = twips(w);
    const H = twips(h);
    const orient = W > H ? ' w:orient="landscape"' : '';
    return (
        `<w:sectPr>${last ? '' : '<w:type w:val="nextPage"/>'}<w:pgSz w:w="${W}" w:h="${H}"${orient}/>` +
        '<w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/>' +
        '<w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr>'
    );
}

export function documentXml(pages: DocxPageIn[], writer: Writer): string {
    const body = pages
        .map((p, i) => {
            const last = i === pages.length - 1;
            const items: { z: number; xml: () => string }[] = [
                ...p.shapes.map(s => ({ z: s.z, xml: () => writer.shape(s, p.h) })),
                ...p.pictures.map(pic => ({ z: pic.placement.z, xml: () => writer.picture(pic, p.h) })),
                ...p.lines.map(l => ({ z: l.z, xml: () => writer.line(l, p.h) })),
            ].sort((a, b) => a.z - b.z);
            const runs = items.map(it => it.xml()).join('') + p.fields.map((f, n) => writer.field(f, p.h, n)).join('');
            const pPr = `<w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr>${last ? '' : sectPr(p.w, p.h, false)}</w:pPr>`;
            return `<w:p>${pPr}${runs}</w:p>`;
        })
        .join('');
    const lastPage = pages[pages.length - 1] ?? { w: 595.3, h: 841.9 };
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NS}><w:body>${body}${sectPr(lastPage.w, lastPage.h, true)}</w:body></w:document>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="en-IE" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style><w:style w:type="character" w:styleId="PlaceholderText"><w:name w:val="Placeholder Text"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:semiHidden/><w:rPr><w:color w:val="808080"/></w:rPr></w:style></w:styles>`;

const SETTINGS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/><w:compatSetting w:name="overrideTableStyleFontSizeAndJustification" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/><w:compatSetting w:name="enableOpenTypeFeatures" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/><w:compatSetting w:name="doNotFlipMirrorIndents" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/></w:compat></w:settings>`;

const FONT_TABLE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:font w:name="Arial"><w:panose1 w:val="020B0604020202020204"/><w:charset w:val="00"/><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font><w:font w:name="Calibri"><w:panose1 w:val="020F0502020204030204"/><w:charset w:val="00"/><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font><w:font w:name="Wingdings"><w:panose1 w:val="05000000000000000000"/><w:charset w:val="02"/><w:family w:val="auto"/><w:pitch w:val="variable"/></w:font><w:font w:name="Symbol"><w:panose1 w:val="05050102010706020507"/><w:charset w:val="02"/><w:family w:val="roman"/><w:pitch w:val="variable"/></w:font></w:fonts>`;

function contentTypes(hasPng: boolean): string {
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        (hasPng ? '<Default Extension="png" ContentType="image/png"/>' : '') +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
        '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
        '<Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
        '</Types>'
    );
}

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;

function documentRels(media: { name: string; rId: string }[]): string {
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>' +
        media.map(m => `<Relationship Id="${m.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`).join('') +
        '</Relationships>'
    );
}

function coreXml(title: string): string {
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        `<dc:title>${xmlText(title)}</dc:title><dc:creator>CCP CRM</dc:creator>` +
        `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
        '</cp:coreProperties>'
    );
}

const APP_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>CCP CRM</Application></Properties>`;

/** The finished .docx file */
export function buildDocx(pages: DocxPageIn[], opts: DocxOptions = {}): Uint8Array {
    const writer = new Writer(opts);
    const doc = documentXml(pages, writer);
    const zip = new PizZip();
    zip.file('[Content_Types].xml', contentTypes(writer.media.length > 0));
    zip.file('_rels/.rels', ROOT_RELS);
    zip.file('docProps/core.xml', coreXml(opts.title ?? 'Form'));
    zip.file('docProps/app.xml', APP_XML);
    zip.file('word/document.xml', doc);
    zip.file('word/styles.xml', STYLES);
    zip.file('word/settings.xml', SETTINGS);
    zip.file('word/fontTable.xml', FONT_TABLE);
    zip.file('word/_rels/document.xml.rels', documentRels(writer.media));
    for (const m of writer.media) zip.file(`word/media/${m.name}`, m.data);
    return zip.generate({ type: 'uint8array', compression: 'DEFLATE' });
}

export { Writer as DocxWriter };
