import { describe, expect, it } from 'vitest';
import type { Phrase } from '../pdfForms/types';
import { phrasesOfTexts, pickedValue, placeOf, readPlace, readPlaces } from './pick';

function ph(x: number, y: number, text: string, h = 9, page = 0): Phrase {
    return { page, x, y, w: text.length * h * 0.48, h, text };
}

/** A made-up supplier's invoice; `extra` item lines push the totals down */
function invoice({ po, item, extra = 0, total }: { po: string; item: string; extra?: number; total: string }): Phrase[] {
    const totals = 300 - extra * 15;
    return [
        ph(40, 760, 'Riverbank Hall Hire', 16),
        ph(40, 740, '12 Quay Street, Cork'),
        ph(400, 700, `PO: ${po}`),
        ph(40, 420, 'Description'),
        ph(470, 420, 'Amount'),
        ph(40, 405, item),
        ph(470, 405, '100.00'),
        ...Array.from({ length: extra }, (_, i) => [ph(40, 390 - i * 15, `Extra line ${i + 1}`), ph(470, 390 - i * 15, '50.00')]).flat(),
        ph(330, totals, 'Total due'),
        ph(470, totals, total),
    ];
}

const texts = (phrases: Phrase[]) => phrases.map(p => p.text);

describe('pickedValue', () => {
    it('takes what the field needs from the text picked', () => {
        expect(pickedValue('amount', ['Gross Amount', '€165.00'])).toBe('165.00');
        expect(pickedValue('amount', ['1,250'])).toBe('1,250.00');
        expect(pickedValue('poNumber', ['PO: 9300'])).toBe('9300');
        expect(pickedValue('poNumber', ['Booked by Ann PO 6794'])).toBe('6794');
        expect(pickedValue('poNumber', ['9300'])).toBe('9300');
        expect(pickedValue('quotePhone', ['Tel: 021 400 0000'])).toBe('021 400 0000');
        expect(pickedValue('quoteEmail', ['Email: bookings@riverbank.ie'])).toBe('bookings@riverbank.ie');
        expect(pickedValue('payeeName', ['Payable to: Riverbank Hall Hire'])).toBe('Riverbank Hall Hire');
        expect(pickedValue('payeeAddress', ['Glasheen Community Enterprise &', 'Training Centre,', 'Glasheen Rd, Cork.'])).toBe('Glasheen Community Enterprise & Training Centre, Glasheen Rd, Cork');
        expect(pickedValue('description', ['Room hire', '3 days'])).toBe('Room hire 3 days');
        expect(pickedValue('poNumber', ['8718\u200B'])).toBe('8718');
    });
});

describe('remembered places', () => {
    const first = invoice({ po: '9300', item: 'Room hire', total: '€350.00' });
    const at = (phrases: Phrase[], text: string) => phrases.find(p => p.text === text)!;

    it('reads the next invoice beside the same labels, though more lines push the total down', () => {
        const next = invoice({ po: '9412', item: 'Room hire and catering', extra: 3, total: '€1,250.00' });
        const amount = placeOf('amount', [at(first, '€350.00')], first)!;
        expect(amount.anchors?.[0]).toMatchObject({ text: 'Total due' });
        expect(texts(readPlace(amount, next))).toEqual(['€1,250.00']);

        // Its own label: "PO: 9412"
        const po = placeOf('poNumber', [at(first, 'PO: 9300')], first)!;
        expect(po.anchors?.[0]).toMatchObject({ text: 'PO', inside: true });
        expect(texts(readPlace(po, next))).toEqual(['PO: 9412']);

        // The column header above the first item
        const item = placeOf('description', [at(first, 'Room hire')], first)!;
        expect(item.anchors?.map(a => a.text)).toEqual(['Description']);
        expect(texts(readPlace(item, next))).toEqual(['Room hire and catering']);

        expect(readPlaces({ amount, poNumber: po, description: item }, next)).toMatchObject({
            amount: { value: '1,250.00' },
            poNumber: { value: '9412' },
            description: { value: 'Room hire and catering' },
        });
    });

    it('reads nothing when the labels are not on the invoice (another layout)', () => {
        const amount = placeOf('amount', [at(first, '€350.00')], first)!;
        const other = [ph(40, 760, 'Some Other Layout', 16), ph(470, 300, '€99.00')];
        expect(readPlace(amount, other)).toEqual([]);
    });

    it('falls back on the place on the page for a value with no label near it, scaled to the page', () => {
        const lone = [ph(500, 780, '7001')];
        const place = placeOf('poNumber', lone, lone, { w: 600, h: 800 })!;
        expect(place.anchors).toBeUndefined();
        // The same invoice photographed at twice the size
        expect(texts(readPlace(place, [ph(1000, 1560, '7002', 18)], [{ w: 1200, h: 1600 }]))).toEqual(['7002']);
    });

    it('ignores what does not look like the value', () => {
        const amount = placeOf('amount', [at(first, '€350.00')], first)!;
        const words = invoice({ po: '9300', item: 'Room hire', total: 'see attached' });
        expect(readPlaces({ amount }, words)).toEqual({});
    });
});

describe('phrasesOfTexts', () => {
    it('finds the Word phrases a selection on the page was read as', () => {
        const phrases = [ph(0, 800, 'Invoice No: 7001'), ph(150, 800, 'PO: 9300'), ph(0, 786, 'Room hire')];
        expect(texts(phrasesOfTexts(['PO: 9300', 'Room  hire'], phrases))).toEqual(['PO: 9300', 'Room hire']);
        expect(texts(phrasesOfTexts(['9300'], phrases))).toEqual(['PO: 9300']);
    });
});
