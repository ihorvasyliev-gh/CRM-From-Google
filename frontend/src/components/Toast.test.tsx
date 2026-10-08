import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { toast as sonner } from 'sonner';
import { GlobalToaster } from './Toast';
import { toast } from '../lib/toast';

describe('GlobalToaster', () => {
    afterEach(() => {
        act(() => { sonner.dismiss(); });
        vi.restoreAllMocks();
    });

    it('shows toasts from the app-wide bus', async () => {
        render(<GlobalToaster />);
        act(() => toast.success('Enrollment saved'));
        expect(await screen.findByText('Enrollment saved')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
    });

    it('runs the action (Undo) when its button is clicked', async () => {
        const undo = vi.fn();
        render(<GlobalToaster />);
        act(() => toast.info('Student moved to Rejected', { action: { label: 'Undo', onClick: undo } }));

        fireEvent.click(await screen.findByRole('button', { name: /undo/i }));
        expect(undo).toHaveBeenCalledTimes(1);
    });

    it('keeps errors and toasts with an action on screen longer', () => {
        const spy = vi.spyOn(sonner, 'error');
        const info = vi.spyOn(sonner, 'info');
        const success = vi.spyOn(sonner, 'success');
        render(<GlobalToaster />);
        act(() => {
            toast.error('Could not save');
            toast.info('Moved', { action: { label: 'Undo', onClick: () => {} } });
            toast.success('Saved');
            toast.success('Exported', { duration: 8000 });
        });
        expect(spy.mock.calls[0][1]?.duration).toBe(5000);
        expect(info.mock.calls[0][1]?.duration).toBe(5000);
        expect(success.mock.calls.map(c => c[1]?.duration)).toEqual([3000, 8000]);
    });
});
