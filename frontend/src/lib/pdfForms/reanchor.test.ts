import { describe, expect, it } from 'vitest';
import { autoMapTemplate } from './autoMap';
import { tableToSheet } from './excel';
import { reanchorFields } from './reanchor';
import { makeLayout } from './testLayout';
import type { ChoiceField, TextField } from './types';

const sheet = tableToSheet(
    [
        ['Name of Group', 'Contact Name', 'Target group'],
        ['Shed', 'Pat Quinn', 'Travellers'],
    ],
    's.csv',
);

describe('reanchorFields', () => {
    const oldLayout = makeLayout();
    const fields = autoMapTemplate(oldLayout, sheet);

    it('moves fields with the text around them when a revision shifts the page', () => {
        const newLayout = makeLayout(-25);
        const { fields: moved, items } = reanchorFields(fields, oldLayout, newLayout);
        const before = fields.find((f): f is TextField => f.kind === 'text' && f.name === 'CO Name')!;
        const after = moved.find((f): f is TextField => f.id === before.id)!;
        expect(after.rect.y - before.rect.y).toBeCloseTo(-25, 1);
        expect(after.rect.x).toBeCloseTo(before.rect.x, 1);
        expect(items.filter(i => i.fieldId === before.id).map(i => i.status)).toEqual(['moved']);
    });

    it('leaves fields alone on an identical revision', () => {
        const { items } = reanchorFields(fields, oldLayout, makeLayout());
        expect(items.every(i => i.status === 'same')).toBe(true);
    });

    it('snaps checkbox options to the boxes on the new page', () => {
        const { fields: moved, items } = reanchorFields(fields, oldLayout, makeLayout());
        const choice = moved.find((f): f is ChoiceField => f.kind === 'choice')!;
        const boxes = oldLayout.checkboxes.filter(c => c.rect.page === 1);
        choice.options.forEach(o => expect(boxes.some(b => b.rect.x === o.rect.x && b.rect.y === o.rect.y)).toBe(true));
        expect(items.filter(i => i.optionId).length).toBe(choice.options.length);
    });

    it('flags boxes that are gone and lists new ones', () => {
        const newLayout = makeLayout();
        const travellers = newLayout.checkboxes.find(c => c.label === 'Travellers')!;
        newLayout.checkboxes = newLayout.checkboxes.filter(c => c !== travellers);
        newLayout.checkboxes.push({ id: 'new', label: 'Homelessness', rect: { page: 1, x: 350, y: 650, w: 8, h: 10 } });
        const { items, newCheckboxes } = reanchorFields(fields, oldLayout, newLayout);
        expect(items.find(i => i.name.endsWith('Travellers'))?.status).toBe('missing');
        expect(newCheckboxes.map(c => c.label)).toEqual(['Homelessness']);
    });

    it('keeps an old label as an accepted answer when a box is reworded', () => {
        const newLayout = makeLayout();
        const box = newLayout.checkboxes.find(c => c.label === 'Travellers')!;
        box.label = 'Travellers (incl. Roma)';
        const { fields: moved } = reanchorFields(fields, oldLayout, newLayout);
        const option = moved.flatMap(f => (f.kind === 'choice' ? f.options : [])).find(o => o.label === 'Travellers (incl. Roma)');
        expect(option?.aliases).toContain('Travellers');
    });
});
