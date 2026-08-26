import { describe, it, expect } from 'vitest';
import { 
    classifyCorkRegion, 
    calculateSpeedMetrics, 
    calculateFunnelAnalysis 
} from './analyticsUtils';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';

describe('analyticsUtils', () => {
    describe('classifyCorkRegion', () => {
        it('identifies Cork City from Eircode prefix T12 and T23', () => {
            expect(classifyCorkRegion(null, 'T12 AB34')).toBe('Cork City');
            expect(classifyCorkRegion(null, 'T23 CD56')).toBe('Cork City');
            expect(classifyCorkRegion('Random Street', 't12 1234')).toBe('Cork City');
        });

        it('identifies East Cork from Eircode prefix P25 and P85', () => {
            expect(classifyCorkRegion(null, 'P25 XY89')).toBe('East Cork');
            expect(classifyCorkRegion(null, 'P85 ZZ11')).toBe('East Cork');
        });

        it('identifies West Cork from Eircode prefix P75, P72, P36, P12', () => {
            expect(classifyCorkRegion(null, 'P75 AA11')).toBe('West Cork');
            expect(classifyCorkRegion(null, 'P72 BB22')).toBe('West Cork');
            expect(classifyCorkRegion(null, 'P36 CC33')).toBe('West Cork');
            expect(classifyCorkRegion(null, 'P12 DD44')).toBe('West Cork');
        });

        it('identifies North Cork from Eircode prefix P51, P61, P81', () => {
            expect(classifyCorkRegion(null, 'P51 KK99')).toBe('North Cork');
            expect(classifyCorkRegion(null, 'P61 MM88')).toBe('North Cork');
        });

        it('identifies South Cork from Eircode prefix P31, P32, P43, P47', () => {
            expect(classifyCorkRegion(null, 'P31 NN55')).toBe('South Cork');
            expect(classifyCorkRegion(null, 'P43 PP77')).toBe('South Cork');
        });

        it('falls back to address string heuristics when Eircode is missing', () => {
            expect(classifyCorkRegion('12 Grand Parade, City Centre, Cork', null)).toBe('Cork City');
            expect(classifyCorkRegion('Douglas Road, Cork', null)).toBe('Cork City');
            expect(classifyCorkRegion('Midleton, Main Street', null)).toBe('East Cork');
            expect(classifyCorkRegion('Bantry, West Cork', null)).toBe('West Cork');
            expect(classifyCorkRegion('Mallow town centre', null)).toBe('North Cork');
            expect(classifyCorkRegion('Carrigaline, South Cork', null)).toBe('South Cork');
            expect(classifyCorkRegion('Somewhere in Dublin', null)).toBe('Other / Unknown');
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
