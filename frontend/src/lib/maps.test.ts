import { describe, expect, it } from 'vitest';
import { placeHref } from './maps';

const query = (href: string | null) => (href ? new URL(href).searchParams.get('query') : null);

describe('placeHref', () => {
    it('searches Google Maps for the place, in Cork unless it says where it is', () => {
        const href = placeHref('Heron House, Blackpool');
        expect(href).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
        expect(query(href)).toBe('Heron House, Blackpool, Cork, Ireland');
        expect(query(placeHref('12 Main Street, Cork'))).toBe('12 Main Street, Cork');
        expect(query(placeHref('Community Centre, Mallow, Co. Cork'))).toBe('Community Centre, Mallow, Co. Cork');
        expect(query(placeHref('Unit 5, Tramore Road T12 X4Y5'))).toBe('Unit 5, Tramore Road T12 X4Y5');
    });

    it('encodes the place so it cannot break the link', () => {
        const href = placeHref('Room 1 & 2 "Hall" <b>')!;
        expect(href).not.toMatch(/["<> ]/);
        expect(query(href)).toBe('Room 1 & 2 "Hall" <b>, Cork, Ireland');
    });

    it('uses a link written in the place, and gives online places none', () => {
        expect(placeHref('Online via Zoom: https://zoom.us/j/123?pwd=a.')).toBe('https://zoom.us/j/123?pwd=a');
        expect(placeHref('Online')).toBeNull();
        expect(placeHref('Microsoft Teams')).toBeNull();
        expect(placeHref('   ')).toBeNull();
        expect(placeHref(null)).toBeNull();
    });
});
