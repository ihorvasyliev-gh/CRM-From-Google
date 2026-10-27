import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import { docxForPreview, finishPages, previewXml } from './docxPreview';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const V = 'urn:schemas-microsoft-com:vml';
const NAMESPACES = [
    `xmlns:w="${W}"`,
    `xmlns:v="${V}"`,
    'xmlns:o="urn:schemas-microsoft-com:office:office"',
    'xmlns:w10="urn:schemas-microsoft-com:office:word"',
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
].join(' ');
const A4 = '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>';
const documentXml = (body: string, sectPr = `<w:sectPr>${A4}</w:sectPr>`) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NAMESPACES}><w:body>${body}${sectPr}</w:body></w:document>`;
const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
const all = (xml: string, ns: string, name: string) => Array.from(parse(xml).getElementsByTagNameNS(ns, name));
const styleOf = (el: Element) => new Map((el.getAttribute('style') ?? '').split(';').map(d => d.split(':') as [string, string]));
/** An A4 page with inch margins: the text column */
const COLUMN = { left: 72, width: 451.3 };

describe('previewXml: what docx-preview leaves out, put in a form it draws', () => {
    it('shows the picture of an embedded object (a logo pasted from another program)', () => {
        const xml = previewXml(
            documentXml(
                '<w:p><w:r><w:object w:dxaOrig="5016" w:dyaOrig="1872"><v:rect style="width:250.8pt;height:93.6pt" stroked="f"><v:imagedata r:id="rId4"/></v:rect><o:OLEObject Type="Embed" ProgID="StaticMetafile" r:id="rId5"/></w:object></w:r></w:p>',
            ),
        );
        expect(all(xml, W, 'object')).toHaveLength(0);
        const [pict] = all(xml, W, 'pict');
        expect(pict.getElementsByTagNameNS(V, 'imagedata')).toHaveLength(1);
        expect(xml).not.toContain('OLEObject');
    });

    it('draws a text box with its border, fill and margins, the text wrapping round it on its side', () => {
        const box = (style: string, attrs = '', wrap = '<w10:wrap type="square"/>') =>
            documentXml(`<w:p><w:r><w:pict><v:shape type="#_x0000_t202" style="${style}" ${attrs}><v:textbox><w:txbxContent><w:p><w:r><w:t>Thomas</w:t></w:r></w:p></w:txbxContent></v:textbox>${wrap}</v:shape></w:pict></w:r></w:p>`);
        // On the right of the column (and a little past its margin)
        const [right] = all(
            previewXml(box('position:absolute;margin-left:268.25pt;margin-top:.6pt;width:202.4pt;height:91.7pt;mso-wrap-distance-left:9pt;mso-wrap-distance-bottom:3.6pt', 'strokeweight=".5pt"'), COLUMN),
            V,
            'shape',
        );
        const r = styleOf(right);
        expect(r.has('position')).toBe(false);
        expect(r.get('float')).toBe('right');
        expect(parseFloat(r.get('margin-right')!)).toBeCloseTo(451.3 - 268.25 - 202.4, 1);
        expect(r.get('margin-left')).toBe('9pt');
        expect(r.get('margin-top')).toBe('0.6pt');
        expect(r.get('border')).toBe('0.5pt solid #000');
        expect(r.get('background')).toBe('#fff');
        expect(r.get('padding')).toBe('3.6pt 7.2pt 3.6pt 7.2pt');
        // On the left, no outline, a fill and margins of its own
        const [left] = all(
            previewXml(box('position:absolute;margin-left:0;margin-top:2.8pt;width:192.8pt;height:93.1pt;mso-position-horizontal:left;mso-wrap-distance-right:9pt', 'stroked="f" fillcolor="#fce4d6 [661]"').replace('<v:textbox>', '<v:textbox inset="0,0,0,0">'), COLUMN),
            V,
            'shape',
        );
        const l = styleOf(left);
        expect([l.get('float'), l.get('margin-left'), l.get('margin-right')]).toEqual(['left', '0pt', '9pt']);
        expect(l.has('border')).toBe(false);
        expect(l.get('background')).toBe('#fce4d6');
        expect(l.get('padding')).toBe('0pt 0pt 0pt 0pt');
        // In front of the text: it stays where it is placed
        const [front] = all(previewXml(box('position:absolute;margin-left:0;margin-top:18.35pt;width:264.85pt', '', '<w10:wrap anchorx="margin"/>'), COLUMN), V, 'shape');
        expect(styleOf(front).get('position')).toBe('absolute');
        expect(styleOf(front).has('float')).toBe(false);
    });

    it('outlines lines and boxes as Word does by default', () => {
        const xml = previewXml(
            documentXml('<w:p><w:r><w:pict><v:line from="114pt,13.85pt" to="183pt,13.85pt"/><v:rect stroked="f" style="width:10pt"/></w:pict></w:r></w:p>'),
        );
        const [stroke] = all(xml, V, 'stroke');
        expect(stroke.parentElement?.localName).toBe('line');
        expect([stroke.getAttribute('color'), stroke.getAttribute('weight')]).toEqual(['#000', '0.75pt']);
        expect(all(xml, V, 'stroke')).toHaveLength(1);
    });

    it('breaks pages at section breaks but continuous ones, not where Word last broke them', () => {
        const continuous = `<w:sectPr><w:type w:val="continuous"/>${A4}</w:sectPr>`;
        const xml = previewXml(
            documentXml(
                `<w:p><w:pPr><w:sectPr>${A4}</w:sectPr></w:pPr><w:r><w:t>Page one</w:t></w:r></w:p>` +
                    `<w:p><w:pPr>${continuous}</w:pPr><w:r><w:lastRenderedPageBreak/><w:t>Still page one</w:t></w:r></w:p>` +
                    '<w:p><w:r><w:t>Page two</w:t></w:r></w:p>',
            ),
        );
        const paragraphs = all(xml, W, 'p');
        const breaks = (p: Element) => Array.from(p.getElementsByTagNameNS(W, 'br')).filter(b => b.getAttributeNS(W, 'type') === 'page').length;
        // The second section starts on the same page; the last one (no type: next page) on a new one
        expect(paragraphs.map(breaks)).toEqual([0, 1, 0]);
        expect(all(xml, W, 'lastRenderedPageBreak')).toHaveLength(0);
    });

    it('gives the paragraph mark a line sized like it, and drops the spaces ending a paragraph', () => {
        const xml = previewXml(
            documentXml('<w:p><w:pPr><w:rPr><w:sz w:val="28"/></w:rPr></w:pPr><w:r><w:t xml:space="preserve">DISCRIPTION</w:t></w:r><w:r><w:t xml:space="preserve">      </w:t></w:r></w:p><w:p/>'),
        );
        const [heading, empty] = all(xml, W, 'p');
        const texts = (p: Element) => Array.from(p.getElementsByTagNameNS(W, 't')).map(t => t.textContent);
        expect(texts(heading)).toEqual(['DISCRIPTION', '', '​']);
        const runs = heading.getElementsByTagNameNS(W, 'r');
        const mark = runs[runs.length - 1];
        expect(mark.getElementsByTagNameNS(W, 'sz')[0].getAttributeNS(W, 'val')).toBe('28');
        expect(texts(empty)).toEqual(['​']);
    });

    it('leaves a part it cannot read as it is', () => {
        expect(previewXml('<w:document')).toBe('<w:document');
    });
});

describe('docxForPreview', () => {
    const wordFile = (body: string, sectPr: string, header?: string) => {
        const zip = new PizZip();
        zip.file('word/document.xml', documentXml(body, sectPr));
        if (header) zip.file('word/header1.xml', header);
        return zip.generate({ type: 'arraybuffer' }) as ArrayBuffer;
    };

    it('reads the page border and the floating tables, and prepares the header too', async () => {
        const borders =
            '<w:pgBorders w:offsetFrom="page"><w:top w:val="thinThickLargeGap" w:sz="24" w:space="24" w:color="C00000"/><w:left w:val="single" w:sz="8" w:space="24" w:color="auto"/><w:bottom w:val="nil"/></w:pgBorders>';
        const table = (pos: string) => `<w:tbl><w:tblPr><w:tblpPr ${pos}/></w:tblPr><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>`;
        const header = `<w:hdr ${NAMESPACES}><w:p><w:r><w:object><v:rect><v:imagedata r:id="rId1"/></v:rect></w:object></w:r></w:p></w:hdr>`;
        const prepared = await docxForPreview(
            wordFile(
                table('w:vertAnchor="text" w:horzAnchor="margin" w:tblpXSpec="right" w:tblpY="589"') + table('w:horzAnchor="page" w:tblpX="2160"') + '<w:tbl><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>',
                `<w:sectPr>${A4}${borders}</w:sectPr>`,
                header,
            ),
        );
        expect(prepared.border?.pages).toBe('all');
        expect(prepared.border?.css).toMatchObject({
            top: '24pt',
            'border-top': '4.5pt double #C00000',
            left: '24pt',
            'border-left': '1pt solid #000',
            bottom: '0',
            right: '0',
        });
        expect(prepared.border?.css['border-bottom']).toBeUndefined();
        expect(prepared.tables).toEqual([
            { side: 'right', top: 29.45, left: 0 },
            { side: 'left', top: 0, left: 36 },
        ]);
        const zip = new PizZip(prepared.bytes);
        expect(zip.file('word/header1.xml')!.asText()).toContain('w:pict');
        expect(zip.file('word/document.xml')!.asText()).toContain('​');
    });

    it('has no border or floating tables to fix when the document has none', async () => {
        const prepared = await docxForPreview(wordFile('<w:p><w:r><w:t>Invoice</w:t></w:r></w:p>', `<w:sectPr>${A4}</w:sectPr>`));
        expect(prepared.border).toBeNull();
        expect(prepared.tables).toEqual([]);
    });
});

describe('finishPages', () => {
    const drawn = () => {
        const host = document.createElement('div');
        host.innerHTML =
            '<style>.d p { margin-bottom: 8.00pt; line-height: 1.08; } p.d_title { line-height: 12.00pt; }</style>' +
            '<section class="d" style="width: 595.3pt"><article>' +
            '<p style="line-height: 1.5"><span style="font-family: Arial">Total</span></p>' +
            '<table style="float: left; margin-top: 2pt"><tr><td></td></tr></table>' +
            '<table style="float: left"><tr><td></td></tr></table>' +
            '<svg><image href="data:image/png;base64,"></image></svg>' +
            '</article></section>';
        document.body.appendChild(host);
        return host;
    };

    it('draws the page border, puts floating tables on their side and stretches pictures to their frames', () => {
        const host = drawn();
        const pages = finishPages(host, 'd', {
            border: { css: { position: 'absolute', top: '24pt', 'border-top': '1pt solid #000' }, pages: 'all' },
            tables: [
                { side: 'right', top: 29.45, left: 0 },
                { side: 'left', top: 0, left: 36 },
            ],
        });
        expect(pages).toHaveLength(1);
        const box = pages[0].lastElementChild as HTMLElement;
        expect(box.style.top).toBe('24pt');
        expect(box.style.borderTop).toBe('1pt solid rgb(0, 0, 0)');
        const [right, left] = Array.from(host.querySelectorAll('table'));
        expect([right.style.float, right.style.marginRight, right.style.marginTop]).toEqual(['right', '0px', '31.45pt']);
        expect([left.style.float, left.style.marginLeft]).toEqual(['left', '36pt']);
        expect(host.querySelector('image')!.getAttribute('preserveAspectRatio')).toBe('none');
        host.remove();
    });

    it("leaves the tables left when they can't be told apart", () => {
        const host = drawn();
        finishPages(host, 'd', { border: null, tables: [{ side: 'right', top: 0, left: 0 }] });
        expect(Array.from(host.querySelectorAll('table')).map(t => t.style.float)).toEqual(['left', 'left']);
        expect(host.querySelector('section')!.querySelectorAll(':scope > div')).toHaveLength(0);
        host.remove();
    });

    it("turns the paragraphs' line spacing into the custom properties their text reads", () => {
        const host = drawn();
        finishPages(host, 'd', { border: null, tables: [] });
        const css = host.querySelector('style')!.textContent!;
        expect(css).toContain('.d p { margin-bottom: 8.00pt; --p-lh: 1.08; }');
        expect(css).toContain('p.d_title { --p-lh-exact: 12.00pt; }');
        const p = host.querySelector('p')!;
        expect(p.style.lineHeight).toBe('');
        expect(p.style.getPropertyValue('--p-lh')).toBe('1.5');
        expect(host.querySelector('span')!.style.getPropertyValue('--font-line')).toBe('1.149');
        host.remove();
    });
});
