import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { TimeInput } from './TimeInput';

function Field({ initial = '', durationFrom, onChange }: { initial?: string; durationFrom?: string; onChange?: (v: string) => void }) {
    const [value, setValue] = useState(initial);
    return (
        <TimeInput
            ariaLabel="End time"
            value={value}
            durationFrom={durationFrom}
            onChange={v => { setValue(v); onChange?.(v); }}
        />
    );
}

describe('TimeInput', () => {
    it('reads a typed time when leaving the field', () => {
        const onChange = vi.fn();
        render(<Field onChange={onChange} />);
        const input = screen.getByRole('combobox', { name: 'End time' });
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: '930' } });
        fireEvent.blur(input);
        expect(onChange).toHaveBeenLastCalledWith('09:30');
        expect(input).toHaveValue('09:30');
    });

    it('drops text that is not a time and keeps the old value', () => {
        const onChange = vi.fn();
        render(<Field initial="10:00" onChange={onChange} />);
        const input = screen.getByRole('combobox');
        fireEvent.change(input, { target: { value: 'soon' } });
        fireEvent.blur(input);
        expect(onChange).not.toHaveBeenCalled();
        expect(input).toHaveValue('10:00');
    });

    it('picks a time from the list', () => {
        const onChange = vi.fn();
        render(<Field onChange={onChange} />);
        fireEvent.focus(screen.getByRole('combobox'));
        fireEvent.click(screen.getByRole('option', { name: '10:15' }));
        expect(onChange).toHaveBeenLastCalledWith('10:15');
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('offers end times after the start, with the length of the day', () => {
        render(<Field durationFrom="10:00" />);
        fireEvent.focus(screen.getByRole('combobox'));
        const list = screen.getByRole('listbox');
        const options = within(list).getAllByRole('option');
        expect(options[0]).toHaveTextContent('10:15');
        expect(options[0]).toHaveTextContent('15 min');
        expect(within(list).getByRole('option', { name: /14:00/ })).toHaveTextContent('4 h');
    });

    it('moves through the list with the arrow keys and picks with Enter', () => {
        const onChange = vi.fn();
        render(<Field initial="09:00" onChange={onChange} />);
        const input = screen.getByRole('combobox');
        fireEvent.focus(input);
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onChange).toHaveBeenLastCalledWith('09:30');
    });

    it('Escape closes the list without closing the dialog around it', () => {
        render(<Field />);
        const input = screen.getByRole('combobox');
        fireEvent.focus(input);
        expect(screen.getByRole('listbox')).toBeInTheDocument();
        const notCancelled = fireEvent.keyDown(input, { key: 'Escape' });
        expect(notCancelled).toBe(false); // preventDefault: useModalBehavior leaves the dialog open
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('clears the time', () => {
        const onChange = vi.fn();
        render(<Field initial="10:00" onChange={onChange} />);
        fireEvent.click(screen.getByRole('button', { name: 'Clear End time' }));
        expect(onChange).toHaveBeenLastCalledWith('');
        expect(screen.getByRole('combobox')).toHaveValue('');
    });
});
