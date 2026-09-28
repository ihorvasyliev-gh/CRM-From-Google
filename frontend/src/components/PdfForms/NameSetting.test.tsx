import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import NameSetting from './NameSetting';

function Harness({ initial = '', onValue = vi.fn() }: { initial?: string; onValue?: (v: string) => void }) {
    const [value, setValue] = useState(initial);
    const names: Record<string, string> = { '{First Name}': 'Sayed', '{First Name} {Last Name}': 'Sayed Ghazanfar', '{Timestamp}': '08/01/2025' };
    return (
        <NameSetting
            value={value}
            onChange={v => { setValue(v); onValue(v); }}
            columns={['Timestamp', 'First Name', 'Last Name']}
            automatic="{First Name} {Last Name}"
            example={p => names[p] ?? null}
        />
    );
}

describe('NameSetting', () => {
    it('shows what "Automatic" means with an example', () => {
        render(<Harness />);
        expect(screen.getByLabelText('Name: first part')).toHaveDisplayValue('Automatic');
        expect(screen.getByText('Sayed Ghazanfar.pdf')).toBeInTheDocument();
    });

    it('builds the name from one or two columns picked from lists', () => {
        const onValue = vi.fn();
        render(<Harness onValue={onValue} />);
        fireEvent.change(screen.getByLabelText('Name: first part'), { target: { value: 'First Name' } });
        expect(onValue).toHaveBeenLastCalledWith('{First Name}');
        expect(screen.getByText('Sayed.pdf')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Name: second part'), { target: { value: 'Last Name' } });
        expect(onValue).toHaveBeenLastCalledWith('{First Name} {Last Name}');
        fireEvent.change(screen.getByLabelText('Name: first part'), { target: { value: '' } });
        expect(onValue).toHaveBeenLastCalledWith('');
    });

    it('opens a pattern it cannot show in the lists as text', () => {
        render(<Harness initial="{First Name|upper} – registration" />);
        expect(screen.getByLabelText('Name pattern')).toHaveValue('{First Name|upper} – registration');
    });
});
