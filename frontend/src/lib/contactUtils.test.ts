import { describe, it, expect } from 'vitest';
import {
    formatPhoneDisplay,
    formatPhoneForWhatsApp,
    formatPhoneForCall,
    formatGoogleMapsUrl,
    formatStudentContactSummary
} from './contactUtils';

describe('contactUtils', () => {
    describe('formatPhoneForWhatsApp', () => {
        it('handles null / undefined / empty values', () => {
            expect(formatPhoneForWhatsApp(null)).toBeNull();
            expect(formatPhoneForWhatsApp(undefined)).toBeNull();
            expect(formatPhoneForWhatsApp('')).toBeNull();
            expect(formatPhoneForWhatsApp('   ')).toBeNull();
        });

        it('normalizes Irish mobile numbers', () => {
            expect(formatPhoneForWhatsApp('+353871234567')).toBe('https://wa.me/353871234567');
            expect(formatPhoneForWhatsApp('+353 87 123 4567')).toBe('https://wa.me/353871234567');
            expect(formatPhoneForWhatsApp('0871234567')).toBe('https://wa.me/353871234567');
            expect(formatPhoneForWhatsApp('087 123 4567')).toBe('https://wa.me/353871234567');
            expect(formatPhoneForWhatsApp('00353871234567')).toBe('https://wa.me/353871234567');
        });

        it('normalizes Ukrainian mobile numbers', () => {
            expect(formatPhoneForWhatsApp('+380501234567')).toBe('https://wa.me/380501234567');
            expect(formatPhoneForWhatsApp('+380 50 123 4567')).toBe('https://wa.me/380501234567');
            expect(formatPhoneForWhatsApp('0501234567')).toBe('https://wa.me/380501234567');
            expect(formatPhoneForWhatsApp('067 123 4567')).toBe('https://wa.me/380671234567');
        });

        it('normalizes UK numbers', () => {
            expect(formatPhoneForWhatsApp('+447123456789')).toBe('https://wa.me/447123456789');
            expect(formatPhoneForWhatsApp('07123456789')).toBe('https://wa.me/447123456789');
        });
    });

    describe('formatPhoneForCall', () => {
        it('returns tel URI', () => {
            expect(formatPhoneForCall(null)).toBeNull();
            expect(formatPhoneForCall('+353 87 123 4567')).toBe('tel:+353871234567');
            expect(formatPhoneForCall('087-123-4567')).toBe('tel:0871234567');
        });
    });

    describe('formatGoogleMapsUrl', () => {
        it('generates proper Google Maps search URLs', () => {
            expect(formatGoogleMapsUrl(null)).toBeNull();
            expect(formatGoogleMapsUrl('')).toBeNull();
            expect(formatGoogleMapsUrl('T12 AB34')).toBe('https://www.google.com/maps/search/?api=1&query=T12%20AB34');
            expect(formatGoogleMapsUrl('Grand Parade, Cork')).toBe('https://www.google.com/maps/search/?api=1&query=Grand%20Parade%2C%20Cork');
        });
    });

    describe('formatStudentContactSummary', () => {
        it('formats student contact card properly', () => {
            const summary = formatStudentContactSummary({
                first_name: 'John',
                last_name: 'Doe',
                email: 'john.doe@example.com',
                phone: '+353871234567',
                address: '12 Main St, Cork',
                eircode: 'T12 X4Y2',
                dob: '1995-05-15'
            });

            expect(summary).toContain('John Doe');
            expect(summary).toContain('Email: john.doe@example.com');
            expect(summary).toContain('Phone: +353871234567');
            expect(summary).toContain('Address: 12 Main St, Cork');
            expect(summary).toContain('Eircode: T12 X4Y2');
        });
    });

    describe('formatPhoneDisplay', () => {
        it('shows Irish numbers the way they are dialled at home', () => {
            expect(formatPhoneDisplay('+353875513370')).toBe('087 551 3370');
            expect(formatPhoneDisplay('0875513370')).toBe('087 551 3370');
            expect(formatPhoneDisplay('+353214567890')).toBe('021 456 7890');
            expect(formatPhoneDisplay('+35312345678')).toBe('01 234 5678');
        });

        it('groups Ukrainian and UK numbers after the country code', () => {
            expect(formatPhoneDisplay('+380671234567')).toBe('+380 67 123 4567');
            expect(formatPhoneDisplay('0671234567')).toBe('+380 67 123 4567');
            expect(formatPhoneDisplay('+447123456789')).toBe('+44 7123 456789');
        });

        it('leaves anything else as it was', () => {
            expect(formatPhoneDisplay('+12025550123')).toBe('+12025550123');
            expect(formatPhoneDisplay('ask at reception')).toBe('ask at reception');
            expect(formatPhoneDisplay('')).toBe('');
            expect(formatPhoneDisplay(null)).toBe('');
        });
    });
});
