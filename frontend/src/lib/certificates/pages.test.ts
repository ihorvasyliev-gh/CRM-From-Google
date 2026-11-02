import { describe, expect, it } from 'vitest';
import { readAnchors } from './pages';

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
