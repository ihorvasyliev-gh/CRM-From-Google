import { describe, it, expect } from 'vitest';
import { normalizeCorkAddress } from './analyticsUtils';

describe('analyticsUtils', () => {
    describe('normalizeCorkAddress', () => {
        it('normalizes exact Cork City districts correctly', () => {
            const res1 = normalizeCorkAddress('12 Grand Parade, City Centre, Cork', null);
            expect(res1.microDistrict).toBe('Cork City Centre');
            expect(res1.macroRegion).toBe('Cork City (Centre)');
            expect(res1.isRecognized).toBe(true);

            const res2 = normalizeCorkAddress('Douglas Road, Cork', null);
            expect(res2.microDistrict).toBe('Douglas');
            expect(res2.macroRegion).toBe('Cork City (South)');
            expect(res2.isRecognized).toBe(true);

            const res3 = normalizeCorkAddress('Watercourse Rd, Blackpool', null);
            expect(res3.microDistrict).toBe('Blackpool');
            expect(res3.macroRegion).toBe('Cork City (North)');

            const res4 = normalizeCorkAddress('Clashduv Road, Togher', null);
            expect(res4.microDistrict).toBe('Togher');
            expect(res4.macroRegion).toBe('Cork City (South)');

            const res5 = normalizeCorkAddress('Silversprings, Mayfield', null);
            expect(res5.microDistrict).toBe('Mayfield');
            expect(res5.macroRegion).toBe('Cork City (North)');
        });

        it('normalizes satellite towns and county Cork locations', () => {
            const res1 = normalizeCorkAddress('Main Street, Ballincollig', null);
            expect(res1.microDistrict).toBe('Ballincollig');
            expect(res1.macroRegion).toBe('Satellite Towns');

            const res2 = normalizeCorkAddress('Midleton, East Cork', null);
            expect(res2.microDistrict).toBe('Midleton');
            expect(res2.macroRegion).toBe('Satellite Towns');

            const res3 = normalizeCorkAddress('Rushbrooke, Cobh', null);
            expect(res3.microDistrict).toBe('Cobh');
            expect(res3.macroRegion).toBe('Satellite Towns');

            const res4 = normalizeCorkAddress('Carrigaline, Janeville', null);
            expect(res4.microDistrict).toBe('Carrigaline');
            expect(res4.macroRegion).toBe('Satellite Towns');

            const res5 = normalizeCorkAddress('Mallow town centre', null);
            expect(res5.microDistrict).toBe('Mallow');
            expect(res5.macroRegion).toBe('North Cork');

            const res6 = normalizeCorkAddress('Bantry, West Cork', null);
            expect(res6.microDistrict).toBe('Skibbereen & West Cork');
            expect(res6.macroRegion).toBe('West Cork');
        });

        it('handles common typos and misspellings via fuzzy matching', () => {
            // "Duglas" -> Douglas
            const res1 = normalizeCorkAddress('Flat 3, Duglas rd', null);
            expect(res1.microDistrict).toBe('Douglas');

            // "Midelton" -> Midleton
            const res2 = normalizeCorkAddress('Midelton co. cork', null);
            expect(res2.microDistrict).toBe('Midleton');

            // "ballincolig" -> Ballincollig
            const res3 = normalizeCorkAddress('innishmore, ballincolig', null);
            expect(res3.microDistrict).toBe('Ballincollig');

            // "ballyfehane" -> Ballyphehane
            const res4 = normalizeCorkAddress('Pearse square, ballyfehane', null);
            expect(res4.microDistrict).toBe('Ballyphehane');

            // "carrigalin" -> Carrigaline
            const res5 = normalizeCorkAddress('herons wood, carrigalin', null);
            expect(res5.microDistrict).toBe('Carrigaline');
        });

        it('identifies areas from Eircodes when address text is absent or ambiguous', () => {
            const resT12 = normalizeCorkAddress(null, 'T12 AB12');
            expect(resT12.macroRegion).toBe('Cork City (South)');

            const resT23 = normalizeCorkAddress(null, 'T23 CD34');
            expect(resT23.macroRegion).toBe('Cork City (North)');

            const resP25 = normalizeCorkAddress(null, 'P25 XY78');
            expect(resP25.macroRegion).toBe('Satellite Towns');

            const resP31 = normalizeCorkAddress(null, 'P31 ZZ99');
            expect(resP31.microDistrict).toBe('Ballincollig');

            const resP85 = normalizeCorkAddress(null, 'P85 AA11');
            expect(resP85.microDistrict).toBe('Cobh');

            const resP51 = normalizeCorkAddress(null, 'P51 BB22');
            expect(resP51.macroRegion).toBe('North Cork');
        });

        it('identifies outside Cork or unknown addresses', () => {
            const resDublin = normalizeCorkAddress('O Connell Street, Dublin 1', null);
            expect(resDublin.macroRegion).toBe('Outside Cork');

            const resUnknown = normalizeCorkAddress(null, null);
            expect(resUnknown.microDistrict).toBe('Unknown / Not Provided');
            expect(resUnknown.isRecognized).toBe(false);
        });
    });
});
