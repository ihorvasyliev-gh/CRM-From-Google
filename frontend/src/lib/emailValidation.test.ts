import { describe, it, expect } from 'vitest';
import { suggestEmailCorrection } from './emailValidation';

describe('suggestEmailCorrection', () => {
    it('returns null for valid emails without typos', () => {
        expect(suggestEmailCorrection('john.doe@gmail.com')).toBeNull();
        expect(suggestEmailCorrection('user@yahoo.com')).toBeNull();
        expect(suggestEmailCorrection('contact@partnershipcork.ie')).toBeNull();
    });

    it('returns null for invalid strings without @', () => {
        expect(suggestEmailCorrection('notanemail')).toBeNull();
        expect(suggestEmailCorrection('')).toBeNull();
    });

    it('corrects common gmail typos', () => {
        expect(suggestEmailCorrection('test@gmali.com')).toBe('test@gmail.com');
        expect(suggestEmailCorrection('user@gmai.com')).toBe('user@gmail.com');
        expect(suggestEmailCorrection('hello@gamil.com')).toBe('hello@gmail.com');
        expect(suggestEmailCorrection('user@gmal.com')).toBe('user@gmail.com');
        expect(suggestEmailCorrection('person@gmail.con')).toBe('person@gmail.com');
        expect(suggestEmailCorrection('person@gnail.com')).toBe('person@gmail.com');
    });

    it('corrects common yahoo typos', () => {
        expect(suggestEmailCorrection('user@yaho.com')).toBe('user@yahoo.com');
        expect(suggestEmailCorrection('user@yahooo.com')).toBe('user@yahoo.com');
    });

    it('corrects common hotmail/outlook typos', () => {
        expect(suggestEmailCorrection('user@hotmial.com')).toBe('user@hotmail.com');
        expect(suggestEmailCorrection('user@hotmai.com')).toBe('user@hotmail.com');
        expect(suggestEmailCorrection('user@outlok.com')).toBe('user@outlook.com');
        expect(suggestEmailCorrection('user@oulook.com')).toBe('user@outlook.com');
    });

    it('corrects icloud typos', () => {
        expect(suggestEmailCorrection('user@icoud.com')).toBe('user@icloud.com');
        expect(suggestEmailCorrection('user@iclud.com')).toBe('user@icloud.com');
    });
});
