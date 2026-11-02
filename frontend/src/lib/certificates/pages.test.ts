import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import { defaultStyleRuns, embeddedFonts, readAnchors } from './pages';

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';

const anchor = (inner: string, attrs = '') =>
    `<w:r><w:drawing><wp:anchor simplePos="0" ${attrs || 'behindDoc="0"'}><wp:simplePos x="0" y="0"/>${inner}<wp:extent cx="1270000" cy="635000"/><wp:wrapNone/></wp:anchor></w:drawing></w:r>`;

const doc = (runs: string) => `<?xml version="1.0"?><w:document ${NS}><w:body><w:p>${runs}</w:p></w:body></w:document>`;

describe('readAnchors', () => {
    it('reads where each floating picture sits, in points', () => {
        const xml = doc(
            anchor('<wp:positionH relativeFrom="page"><wp:posOffset>127000</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>-25400</wp:posOffset></wp:positionV>', 'behindDoc="1"') +
            anchor('<wp:positionH relativeFrom="margin"><wp:align>center</wp:align></wp:positionH><wp:positionV relativeFrom="page"><wp:align>bottom</wp:align></wp:positionV>'),
        );
        expect(readAnchors(xml)).toEqual([
            { h: { from: 'page', align: null, offset: 10 }, v: { from: 'paragraph', align: null, offset: -2 }, behind: true, width: 100, height: 50 },
            { h: { from: 'margin', align: 'center', offset: 0 }, v: { from: 'page', align: 'bottom', offset: 0 }, behind: false, width: 100, height: 50 },
        ]);
    });

    it('counts drawings as docx-preview draws them: in line ones too, not the Word 2010 choice', () => {
        const inline = '<w:r><w:drawing><wp:inline><wp:extent cx="1" cy="1"/></wp:inline></w:drawing></w:r>';
        const alternate = `<w:r><mc:AlternateContent><mc:Choice Requires="wps">${anchor('')}</mc:Choice><mc:Fallback><w:pict/></mc:Fallback></mc:AlternateContent></w:r>`;
        const anchors = readAnchors(doc(inline + alternate + anchor('')));
        expect(anchors).toHaveLength(2);
        expect(anchors[0]).toBeNull();
        expect(anchors[1]).toMatchObject({ h: { from: 'page', offset: 0 } });
    });
});

describe('defaultStyleRuns', () => {
    it("puts the default paragraph style's text formatting on the text, as Word does", () => {
        const css = '.cert-page span { font-family: Cambria; }\n.cert-page p, p.cert-page_normal span {\n  font-family: \'Monotype Corsiva\';\n}\np.cert-page_title span { font-size: 20pt; }';
        expect(defaultStyleRuns(css, 'cert-page')).toBe(
            '.cert-page span { font-family: Cambria; }\n.cert-page :where(p) span, p.cert-page_normal span {\n  font-family: \'Monotype Corsiva\';\n}\np.cert-page_title span { font-size: 20pt; }',
        );
    });

    it('leaves the paragraph formatting of the default style alone', () => {
        const css = '.cert-page p, p.cert-page_normal { line-height: 1; }';
        expect(defaultStyleRuns(css, 'cert-page')).toBe(css);
    });
});

describe('embeddedFonts', () => {
    it('names the fonts the Word file carries', async () => {
        const zip = new PizZip();
        zip.file('word/fontTable.xml', `<?xml version="1.0"?><w:fonts ${NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:font w:name="Arial"/><w:font w:name="Monotype Corsiva"><w:embedRegular r:id="rId1" w:fontKey="{00000000-0000-0000-0000-000000000000}"/></w:font><w:font w:name="Calisto MT"><w:embedBold r:id="rId2"/></w:font></w:fonts>`);
        expect(await embeddedFonts(zip.generate({ type: 'arraybuffer' }))).toEqual(['Monotype Corsiva', 'Calisto MT']);
        expect(await embeddedFonts(new PizZip().generate({ type: 'arraybuffer' }))).toEqual([]);
    });
});
