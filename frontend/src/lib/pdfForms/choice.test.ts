import { describe, expect, it } from 'vitest';
import { matchChoice, suggestOptions, withSiblings } from './choice';
import { makeLayout } from './testLayout';
import type { ChoiceField } from './types';

const rect = { page: 0, x: 0, y: 0, w: 8, h: 8 };
const field = (single: boolean, aliases: Record<string, string[]> = {}): ChoiceField => ({
    id: 'f',
    kind: 'choice',
    name: 'Target group',
    source: '{Target}',
    single,
    options: ['People living in disadvantaged communities', 'Travellers', 'Refugees', 'Not applicable'].map((label, i) => ({
        id: `o${i}`,
        label,
        rect,
        aliases: aliases[label] ?? [],
    })),
});

describe('matchChoice', () => {
    it('ticks every matching answer of a multi-choice cell', () => {
        const r = matchChoice(field(false), 'People living in disadvantaged communities;Refugees;');
        expect(r.ticked).toEqual(['o0', 'o2']);
        expect(r.unmatched).toEqual([]);
    });

    it('ticks only the first answer when the question takes one, and reports the rest', () => {
        const r = matchChoice(field(true), 'Travellers;People living in disadvantaged communities');
        expect(r.ticked).toEqual(['o1']);
        expect(r.dropped).toEqual(['People living in disadvantaged communities']);
    });

    it('reports answers that match no box', () => {
        const r = matchChoice(field(false), 'Company Limited by Guarantee');
        expect(r.ticked).toEqual([]);
        expect(r.unmatched).toEqual(['Company Limited by Guarantee']);
    });

    it('uses saved answers (aliases) and common short forms', () => {
        const withAlias = field(true, { Travellers: ['Traveller community'] });
        expect(matchChoice(withAlias, 'Traveller community').ticked).toEqual(['o1']);
        expect(matchChoice(field(true), 'N/A').ticked).toEqual(['o3']);
    });

    it('ticks nothing for an empty answer', () => {
        expect(matchChoice(field(false), '  ')).toEqual({ ticked: [], unmatched: [], dropped: [] });
    });
});

describe('suggestOptions', () => {
    const layout = makeLayout();

    it('picks the boxes an answer column talks about, plus the rest of that question', () => {
        const boxes = suggestOptions(['Refugees', 'Travellers;Refugees'], layout);
        expect(boxes.map(b => b.label).sort()).toEqual(['Not applicable', 'People living in disadvantaged communities', 'Refugees', 'Travellers']);
    });

    it('keeps a Yes / No row together', () => {
        const yes = layout.checkboxes.filter(c => c.label === 'Yes');
        expect(withSiblings(yes, layout).map(b => b.label)).toEqual(['Yes', 'No']);
    });

    it('returns nothing when no answer resembles a box', () => {
        expect(suggestOptions(['Blue', 'Green'], layout)).toEqual([]);
    });
});
