import { describe, expect, it } from 'vitest';
import { evenLighting, ocrItems, ocrPhrases, pageAngle, unlevelRect, type OcrBlock } from './ocr';
import { extractInvoice } from './extract';
import { simpleVatInvoice, xeroLikeInvoice } from './testInvoices';
import type { Phrase } from '../pdfForms/types';

const PAGE = { w: 595, h: 842 };
/** Pixels per point: a page read at about 300 dpi */
const SCALE = 4;

/**
 * What Tesseract would give for a picture of these phrases, taken `degrees` off level: each
 * phrase a line of words with pixel boxes, the picture turned about its middle.
 */
function asPicture(phrases: Phrase[], degrees = 0, noise = false): OcrBlock[] {
    const a = (degrees * Math.PI) / 180;
    const cx = (PAGE.w * SCALE) / 2;
    const cy = (PAGE.h * SCALE) / 2;
    const turn = (x: number, y: number) => ({ x: cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), y: cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a) });
    const box = (pts: { x: number; y: number }[]) => ({
        x0: Math.min(...pts.map(p => p.x)),
        y0: Math.min(...pts.map(p => p.y)),
        x1: Math.max(...pts.map(p => p.x)),
        y1: Math.max(...pts.map(p => p.y)),
    });
    const lines = phrases.map(p => {
        const base = (PAGE.h - p.y) * SCALE;
        const charW = p.w / Math.max(1, p.text.length);
        let at = 0;
        const words = p.text.split(' ').map(text => {
            const x0 = (p.x + at * charW) * SCALE;
            const x1 = x0 + text.length * charW * SCALE;
            at += text.length + 1;
            const top = base - (/[A-Z0-9bdfhklt]/.test(text) ? 0.72 : 0.5) * p.h * SCALE;
            const bottom = base + (/[gjpqy,;]/.test(text) ? 0.21 : 0) * p.h * SCALE;
            return { text, confidence: 90, bbox: box([turn(x0, top), turn(x1, top), turn(x0, bottom), turn(x1, bottom)]) };
        });
        const start = turn(p.x * SCALE, base);
        const end = turn((p.x + p.w) * SCALE, base);
        if (noise) words.push({ text: '|', confidence: 30, bbox: box([turn((p.x + p.w + 4) * SCALE, base - 30), turn((p.x + p.w + 5) * SCALE, base)]) });
        return { baseline: { x0: start.x, y0: start.y, x1: end.x, y1: end.y }, rowAttributes: { rowHeight: p.h * SCALE }, words };
    });
    return [{ paragraphs: [{ lines }] }];
}

/** Read the pictures of an invoice's pages back into phrases */
function readBack(phrases: Phrase[], degrees = 0, noise = false): Phrase[] {
    const pages = [...new Set(phrases.map(p => p.page))].sort();
    const items = pages.flatMap(page => ocrItems(asPicture(phrases.filter(p => p.page === page), degrees, noise), page, SCALE, PAGE));
    return ocrPhrases(pages.map(() => PAGE), items);
}

function keyFacts(phrases: Phrase[]) {
    const f = extractInvoice(phrases);
    return {
        invoiceNumber: f.invoiceNumber?.value,
        invoiceDate: f.invoiceDate?.value,
        dueDate: f.dueDate?.value,
        poNumber: f.poNumber?.value,
        total: f.total?.value,
        name: f.supplier.name?.value,
        address: f.supplier.address?.value,
        vat: f.supplier.vatNumber,
        items: f.items.map(i => [i.description, i.quantity, i.unitPrice, i.amount]),
        people: f.people.length,
    };
}

describe('reading a scan', () => {
    it('places the words where they are on the page, as a PDF would', () => {
        const items = ocrItems(asPicture([{ page: 0, x: 100, y: 700, w: 120, h: 10, text: 'Invoice Number INV-0101' }]), 0, SCALE, PAGE);
        expect(items.map(i => i.str)).toEqual(['Invoice', 'Number', 'INV-0101']);
        expect(items[0].x).toBeCloseTo(100, 0);
        for (const i of items) {
            expect(i.y).toBeCloseTo(700, 0);
            expect(i.h).toBeCloseTo(10, 0);
        }
    });

    it('reads an invoice from its picture as from its text', () => {
        for (const invoice of [xeroLikeInvoice(), simpleVatInvoice()]) {
            const expected = keyFacts(invoice);
            expect(expected.invoiceNumber).toBeTruthy();
            expect(keyFacts(readBack(invoice))).toEqual(expected);
        }
    });

    it('levels a photo taken at an angle, and drops the marks of table rules', () => {
        const invoice = xeroLikeInvoice();
        const expected = keyFacts(invoice);
        expect(keyFacts(readBack(invoice, 2.5, true))).toEqual(expected);
        expect(keyFacts(readBack(invoice, -1.5))).toEqual(expected);
    });
});

describe('unlevelRect', () => {
    it('puts a place read off a tilted photo back where it shows on the photo', () => {
        const degrees = 3;
        const phrase: Phrase = { page: 0, x: 420, y: 700, w: 120, h: 10, text: 'Brightway Safety Training' };
        const blocks = asPicture([phrase], degrees);
        expect(pageAngle(blocks)).toBeCloseTo((degrees * Math.PI) / 180, 3);
        const [first] = ocrItems(blocks, 0, SCALE, PAGE);
        // Levelled, the word sits where it was printed
        expect(first.x).toBeCloseTo(420, 0);
        expect(first.y).toBeCloseTo(700, 0);
        // Turned back, it lands on the start of the tilted line in the photo
        const start = blocks[0].paragraphs[0].lines[0].baseline;
        const back = unlevelRect({ page: 0, x: first.x, y: first.y, w: 0, h: 0 }, pageAngle(blocks), PAGE);
        expect(back.x).toBeCloseTo(start.x0 / SCALE, 0);
        expect(back.y).toBeCloseTo(PAGE.h - start.y0 / SCALE, 0);
        expect(unlevelRect({ page: 0, x: 1, y: 2, w: 3, h: 4 }, 0, PAGE)).toEqual({ page: 0, x: 1, y: 2, w: 3, h: 4 });
    });
});

describe('evenLighting', () => {
    it('whitens a shadowed page and keeps the ink dark', () => {
        const width = 240;
        const height = 120;
        const grey = new Uint8ClampedArray(width * height);
        const ink = (x: number, y: number) => y % 30 >= 10 && y % 30 < 16 && x % 12 < 7;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // Paper from 110 (in shadow) to 240 (lit), ink a third of the paper
                const paper = 110 + (130 * x) / width;
                grey[y * width + x] = ink(x, y) ? paper * 0.3 : paper;
            }
        }
        const out = evenLighting(grey, width, height);
        let paperMin = 255;
        let inkMax = 0;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const v = out[y * width + x];
                if (ink(x, y)) inkMax = Math.max(inkMax, v);
                else paperMin = Math.min(paperMin, v);
            }
        }
        expect(paperMin).toBeGreaterThan(220);
        expect(inkMax).toBeLessThan(60);
    });
});
