import { useCallback, useState, type FormEvent } from 'react';

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const isField = (el: Element): el is Field =>
    el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;

/** The message for a field the browser found invalid, named after its label ("Last Name is required") */
function messageFor(el: Field): string {
    const label = el.labels?.[0]?.textContent?.replace(/\*/g, '').trim();
    if (el.validity.valueMissing) return label ? `${label} is required` : 'This field is required';
    if (el.validity.typeMismatch && el.type === 'email') return 'Enter an email address like name@example.com';
    if (el.validity.badInput) return 'Enter a number';
    if (el.validity.rangeUnderflow) return `${label || 'The value'} must be at least ${(el as HTMLInputElement).min}`;
    if (el.validity.stepMismatch) return `${label || 'The value'} must be a whole number`;
    return el.validationMessage;
}

/**
 * Form errors under their fields instead of the browser's bubbles. Spread `formProps` on the
 * <form> (it turns the bubbles off), call `check` before submitting: every invalid field gets its
 * message and the first one gets focus. Typing in a field clears its message.
 */
export function useFieldErrors() {
    const [errors, setErrors] = useState<Record<string, string>>({});

    /** True when every field is valid; otherwise shows the messages and focuses the first invalid field */
    const check = useCallback((form: HTMLFormElement | null): boolean => {
        if (!form) return true;
        const invalid = Array.from(form.elements).filter(isField).filter(el => el.id && !el.validity.valid);
        setErrors(Object.fromEntries(invalid.map(el => [el.id, messageFor(el)])));
        invalid[0]?.focus();
        return invalid.length === 0;
    }, []);

    const clear = useCallback((id: string) => setErrors(prev => {
        if (!(id in prev)) return prev;
        const rest = { ...prev };
        delete rest[id];
        return rest;
    }), []);

    const formProps = {
        noValidate: true,
        onInput: (e: FormEvent<HTMLFormElement>) => clear((e.target as HTMLElement).id),
    };

    /** aria-invalid and aria-describedby for a field, pointing at its <FieldError> */
    const fieldProps = (id: string) => errors[id]
        ? { 'aria-invalid': true as const, 'aria-describedby': `${id}-error` }
        : {};

    return { errors, check, clear, formProps, fieldProps };
}
