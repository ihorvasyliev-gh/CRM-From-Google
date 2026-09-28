import { describe, expect, it } from 'vitest';
import { answerMatchScore, ANSWER_THRESHOLD, containment, normalizeText, similarity, splitAnswers, tokens } from './text';

describe('text matching', () => {
    it('normalises case, accents, punctuation and line breaks', () => {
        expect(normalizeText('Email Address\n')).toBe('email address');
        expect(normalizeText('  Seán  Ó Briain ')).toBe('sean o briain');
        expect(normalizeText('Job Title/Role')).toBe(normalizeText('Job Title / Role'));
    });

    it('treats plurals and form synonyms as the same word', () => {
        expect(tokens('People with Disabilities')).toEqual(['people', 'with', 'disability']);
        expect(tokens('Name of Group')).toEqual(['name', 'of', 'org']);
        expect(tokens('CO Name')).toEqual(['org', 'name']);
    });

    it('scores near-identical headers high and unrelated ones low', () => {
        expect(similarity('Email Address', 'Email address ')).toBe(1);
        expect(similarity('Mobile Number', 'Mobile number (optional)')).toBeGreaterThan(0.6);
        expect(similarity('Eircode', 'Date of Birth')).toBeLessThan(0.3);
    });

    it('measures how much of a label is inside a header', () => {
        expect(containment('Email', 'Email Address')).toBe(1);
        expect(containment('CO Address', 'Postal Address for Local Community Group')).toBe(1);
        expect(containment('1. Local Community Group (LCG) details', 'What is the structure of your Local Community Group?')).toBeLessThan(0.75);
    });

    it('matches answers that extend or reword a checkbox label', () => {
        expect(answerMatchScore('Yes. The group has a small steering structure', 'Yes')).toBeGreaterThan(ANSWER_THRESHOLD);
        expect(answerMatchScore('Youth (Aged <18 Years)', 'Youth')).toBeGreaterThan(ANSWER_THRESHOLD);
        expect(answerMatchScore('Older people (aged 65+ Years) in isolation', 'Older people in isolation')).toBeGreaterThan(ANSWER_THRESHOLD);
        expect(answerMatchScore('Disabled People/People with Disabilities', 'People with a Disability')).toBeGreaterThan(ANSWER_THRESHOLD);
    });

    it('does not confuse short answers with longer labels', () => {
        expect(answerMatchScore('No', 'Not applicable')).toBeLessThan(ANSWER_THRESHOLD);
        expect(answerMatchScore('Yes', 'Yes (Women only)')).toBeLessThan(answerMatchScore('Yes', 'Yes'));
        expect(answerMatchScore('Refugees', 'Refugee and migrant rights and integration')).toBeLessThan(answerMatchScore('Refugees', 'Refugees'));
    });

    it('splits multi-choice answers on semicolons and new lines', () => {
        expect(splitAnswers('A;B; ;C\nD;')).toEqual(['A', 'B', 'C', 'D']);
        expect(splitAnswers('')).toEqual([]);
    });
});
