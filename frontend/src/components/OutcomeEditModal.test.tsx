import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OutcomeEditModal, { type OutcomeValues } from './OutcomeEditModal';

type Person = OutcomeValues & { first_name: string; last_name: string };

const makePerson = (overrides: Partial<Person> = {}): Person => ({
    first_name: 'Maria',
    last_name: 'Koval',
    tracking_status: 'pending',
    is_working: null,
    started_month: null,
    field_of_work: null,
    employment_type: null,
    ...overrides,
});

describe('OutcomeEditModal', () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const onSave = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        onSave.mockResolvedValue(undefined);
    });

    it('shows Yes/No immediately for Pending and auto-switches to Responded on 1-click Yes', async () => {
        render(
            <OutcomeEditModal
                isOpen={true}
                person={makePerson({ tracking_status: 'pending', is_working: null })}
                onClose={onClose}
                onSaved={onSaved}
                onSave={onSave}
            />,
        );

        const pendingBtn = screen.getByRole('button', { name: 'Pending' });
        const respondedBtn = screen.getByRole('button', { name: 'Responded' });
        const yesBtn = screen.getByRole('button', { name: 'Yes' });
        const noBtn = screen.getByRole('button', { name: 'No' });

        expect(pendingBtn).toHaveAttribute('aria-pressed', 'true');
        expect(yesBtn).toHaveAttribute('aria-pressed', 'false');
        expect(noBtn).toHaveAttribute('aria-pressed', 'false');
        expect(screen.queryByRole('button', { name: 'Self-employed' })).not.toBeInTheDocument();

        fireEvent.click(yesBtn);

        expect(respondedBtn).toHaveAttribute('aria-pressed', 'true');
        expect(yesBtn).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Full-time' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Part-time' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Self-employed' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'CE / TUS' })).toBeInTheDocument();

        fireEvent.change(screen.getByPlaceholderText(/IT, Hospitality/i), { target: { value: '  Hospitality  ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Self-employed' }));
        expect(screen.getByRole('button', { name: 'Self-employed' })).toHaveAttribute('aria-pressed', 'true');

        fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
        expect(onSave).toHaveBeenCalledWith({
            tracking_status: 'responded',
            is_working: true,
            started_month: null,
            field_of_work: 'Hospitality',
            employment_type: 'self_employed',
        });
        expect(onSaved).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('auto-switches from Not Contacted to Responded on 1-click No and saves nulls for job details', async () => {
        render(
            <OutcomeEditModal
                isOpen={true}
                person={makePerson({ tracking_status: 'not_contacted', is_working: null })}
                onClose={onClose}
                onSaved={onSaved}
                onSave={onSave}
            />,
        );

        const noBtn = screen.getByRole('button', { name: 'No' });
        fireEvent.click(noBtn);

        expect(screen.getByRole('button', { name: 'Responded' })).toHaveAttribute('aria-pressed', 'true');
        expect(noBtn).toHaveAttribute('aria-pressed', 'true');

        fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
        expect(onSave).toHaveBeenCalledWith({
            tracking_status: 'responded',
            is_working: false,
            started_month: null,
            field_of_work: null,
            employment_type: null,
        });
    });

    it('supports selecting and saving CE / TUS employment type', async () => {
        render(
            <OutcomeEditModal
                isOpen={true}
                person={makePerson({
                    tracking_status: 'responded',
                    is_working: true,
                    started_month: '2026-09',
                    field_of_work: 'Community',
                    employment_type: 'part_time',
                })}
                onClose={onClose}
                onSaved={onSaved}
                onSave={onSave}
            />,
        );

        const ceTusBtn = screen.getByRole('button', { name: 'CE / TUS' });
        fireEvent.click(ceTusBtn);
        expect(ceTusBtn).toHaveAttribute('aria-pressed', 'true');

        fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
        expect(onSave).toHaveBeenCalledWith({
            tracking_status: 'responded',
            is_working: true,
            started_month: '2026-09',
            field_of_work: 'Community',
            employment_type: 'ce_tus',
        });
    });

    it('visually unselects Yes/No and clears detail fields on save when switching from Responded to Pending', async () => {
        render(
            <OutcomeEditModal
                isOpen={true}
                person={makePerson({
                    tracking_status: 'responded',
                    is_working: true,
                    started_month: '2026-05',
                    field_of_work: 'IT',
                    employment_type: 'full_time',
                })}
                onClose={onClose}
                onSaved={onSaved}
                onSave={onSave}
            />,
        );

        expect(screen.getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-pressed', 'true');

        fireEvent.click(screen.getByRole('button', { name: 'Pending' }));

        expect(screen.getByRole('button', { name: 'Pending' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-pressed', 'false');
        expect(screen.getByRole('button', { name: 'No' })).toHaveAttribute('aria-pressed', 'false');
        expect(screen.queryByRole('button', { name: 'Full-time' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
        expect(onSave).toHaveBeenCalledWith({
            tracking_status: 'pending',
            is_working: null,
            started_month: null,
            field_of_work: null,
            employment_type: null,
        });
    });

    it('keeps Save disabled when Responded is chosen without Yes/No answer', () => {
        render(
            <OutcomeEditModal
                isOpen={true}
                person={makePerson({ tracking_status: 'not_contacted', is_working: null })}
                onClose={onClose}
                onSaved={onSaved}
                onSave={onSave}
            />,
        );

        const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
        expect(saveBtn).not.toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: 'Responded' }));
        expect(saveBtn).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: 'No' }));
        expect(saveBtn).not.toBeDisabled();
    });
});
