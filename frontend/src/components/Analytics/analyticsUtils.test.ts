import { describe, it, expect } from 'vitest';
import { 
    normalizeCorkAddress,
    classifyCorkRegion,
    calculateGeographicFunnel,
    calculateSpeedMetrics, 
    calculateFunnelAnalysis 
} from './analyticsUtils';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';

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

    describe('classifyCorkRegion backward compatibility', () => {
        it('maps correctly to macro regions', () => {
            expect(classifyCorkRegion('Douglas', null)).toBe('Cork City (South)');
            expect(classifyCorkRegion('Blackpool', null)).toBe('Cork City (North)');
            expect(classifyCorkRegion('Midleton', null)).toBe('Satellite Towns');
        });
    });

    describe('calculateGeographicFunnel', () => {
        const mockEnrollments: EnrollmentWithRelations[] = [
            {
                id: '1',
                student_id: 's1',
                course_id: 'c1',
                status: 'completed',
                course_variant: 'English',
                notes: null,
                is_priority: false,
                response_days: 7,
                created_at: '2026-01-01T10:00:00Z',
                invited_at: '2026-01-04T10:00:00Z',
                invited_date: '2026-01-04',
                confirmed_at: '2026-01-06T10:00:00Z',
                confirmed_date: '2026-01-06',
                completed_at: '2026-01-20T10:00:00Z',
                completed_date: '2026-01-20',
                updated_at: '2026-01-20T10:00:00Z',
                students: {
                    id: 's1',
                    first_name: 'John',
                    last_name: 'Doe',
                    email: 'john@example.com',
                    phone: '+353871234567',
                    address: 'Douglas, Cork',
                    eircode: 'T12 AB12',
                    dob: '1995-05-15',
                    created_at: '2026-01-01T10:00:00Z'
                },
                courses: {
                    id: 'c1',
                    name: 'English Course',
                    created_at: '2026-01-01T10:00:00Z'
                }
            },
            {
                id: '2',
                student_id: 's2',
                course_id: 'c1',
                status: 'requested',
                course_variant: 'English',
                notes: null,
                is_priority: false,
                response_days: 7,
                created_at: '2026-02-01T10:00:00Z',
                invited_at: null,
                invited_date: null,
                confirmed_at: null,
                confirmed_date: null,
                completed_at: null,
                completed_date: null,
                updated_at: '2026-02-01T10:00:00Z',
                students: {
                    id: 's2',
                    first_name: 'Jane',
                    last_name: 'Smith',
                    email: 'jane@example.com',
                    phone: '+353879876543',
                    address: 'Midelton co. cork', // with typo
                    eircode: 'P25 XY99',
                    dob: '1988-11-20',
                    created_at: '2026-02-01T10:00:00Z'
                },
                courses: {
                    id: 'c1',
                    name: 'English Course',
                    created_at: '2026-01-01T10:00:00Z'
                }
            }
        ];

        it('aggregates micro-districts and macro-regions with conversion rates', () => {
            const report = calculateGeographicFunnel(mockEnrollments);
            expect(report.microDistricts.length).toBe(2);

            const douglas = report.microDistricts.find(m => m.name === 'Douglas');
            expect(douglas).toBeDefined();
            expect(douglas?.total).toBe(1);
            expect(douglas?.completed).toBe(1);
            expect(douglas?.completionRate).toBe(100);

            const midleton = report.microDistricts.find(m => m.name === 'Midleton');
            expect(midleton).toBeDefined();
            expect(midleton?.total).toBe(1);
            expect(midleton?.completed).toBe(0);
            expect(midleton?.completionRate).toBe(0);

            expect(report.summarySplit.corkCity).toBe(1);
            expect(report.summarySplit.satelliteTowns).toBe(1);
        });
    });

    describe('calculateSpeedMetrics and calculateFunnelAnalysis', () => {
        const mockEnrollments: EnrollmentWithRelations[] = [
            {
                id: '1',
                student_id: 's1',
                course_id: 'c1',
                status: 'completed',
                course_variant: 'English',
                notes: null,
                is_priority: false,
                response_days: 7,
                created_at: '2026-01-01T10:00:00Z',
                invited_at: '2026-01-04T10:00:00Z', // 3 days
                invited_date: '2026-01-04',
                confirmed_at: '2026-01-06T10:00:00Z', // 2 days
                confirmed_date: '2026-01-06',
                completed_at: '2026-01-20T10:00:00Z', // 14 days
                completed_date: '2026-01-20',
                updated_at: '2026-01-20T10:00:00Z',
                students: {
                    id: 's1',
                    first_name: 'John',
                    last_name: 'Doe',
                    email: 'john@example.com',
                    phone: '+353871234567',
                    address: 'Douglas, Cork',
                    eircode: 'T12 AB12',
                    dob: '1995-05-15',
                    created_at: '2026-01-01T10:00:00Z'
                },
                courses: {
                    id: 'c1',
                    name: 'English Course',
                    created_at: '2026-01-01T10:00:00Z'
                }
            },
            {
                id: '2',
                student_id: 's2',
                course_id: 'c1',
                status: 'requested',
                course_variant: 'English',
                notes: null,
                is_priority: false,
                response_days: 7,
                created_at: '2026-02-01T10:00:00Z',
                invited_at: null,
                invited_date: null,
                confirmed_at: null,
                confirmed_date: null,
                completed_at: null,
                completed_date: null,
                updated_at: '2026-02-01T10:00:00Z',
                students: {
                    id: 's2',
                    first_name: 'Jane',
                    last_name: 'Smith',
                    email: 'jane@example.com',
                    phone: '+353879876543',
                    address: 'Midleton',
                    eircode: 'P25 XY99',
                    dob: '1988-11-20',
                    created_at: '2026-02-01T10:00:00Z'
                },
                courses: {
                    id: 'c1',
                    name: 'English Course',
                    created_at: '2026-01-01T10:00:00Z'
                }
            }
        ];

        it('calculates average processing speeds in days accurately', () => {
            const speed = calculateSpeedMetrics(mockEnrollments);
            expect(speed.avgDaysToInvite).toBe(3);
            expect(speed.avgDaysToConfirm).toBe(2);
            expect(speed.avgDaysToComplete).toBe(14);
            expect(speed.avgTotalCycleDays).toBe(19);
        });

        it('calculates conversion funnel metrics correctly', () => {
            const funnel = calculateFunnelAnalysis(mockEnrollments);
            expect(funnel.everRequested).toBe(2);
            expect(funnel.everInvited).toBe(1);
            expect(funnel.everConfirmed).toBe(1);
            expect(funnel.everCompleted).toBe(1);
            expect(funnel.requestedToInvited).toBe(50);
            expect(funnel.invitedToConfirmed).toBe(100);
            expect(funnel.confirmedToCompleted).toBe(100);
            expect(funnel.overallSuccessRate).toBe(50);
        });
    });
});
