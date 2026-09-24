import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StatusUpdatePage from './StatusUpdatePage';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
    supabase: {
        rpc: vi.fn(),
    },
}));

const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

function fillEmail(value = 'anna@example.com') {
    fireEvent.change(screen.getByLabelText(/your email/i), { target: { value } });
}

describe('StatusUpdatePage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('asks for start date, place and hours only when the person is working', () => {
        render(<StatusUpdatePage />);
        expect(screen.queryByLabelText(/start month/i)).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /yes, i am/i }));
        expect(screen.getByLabelText(/start month/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/start year/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/where do you work/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^full-time$/i })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /not yet/i }));
        expect(screen.queryByLabelText(/start month/i)).not.toBeInTheDocument();
    });

    it('validates required fields for working graduates before calling the API', async () => {
        render(<StatusUpdatePage />);
        fillEmail();
        fireEvent.click(screen.getByRole('button', { name: /yes, i am/i }));
        fireEvent.click(screen.getByRole('button', { name: /send my update/i }));

        expect(await screen.findByRole('alert')).toHaveTextContent(/month and year/i);
        expect(rpc).not.toHaveBeenCalled();
    });

    it('submits a working status and shows a summary', async () => {
        rpc.mockImplementation(async (name: string) => {
            if (name === 'find_employment_students_by_email') {
                return { data: [{ student_id: 's1', first_name: 'Anna', last_name: 'Smith' }], error: null };
            }
            return { data: { success: true, message: 'ok' }, error: null };
        });

        render(<StatusUpdatePage />);
        fillEmail('Anna@Example.com');
        fireEvent.click(screen.getByRole('button', { name: /yes, i am/i }));
        fireEvent.change(screen.getByLabelText(/start year/i), { target: { value: '2024' } });
        fireEvent.change(screen.getByLabelText(/start month/i), { target: { value: '3' } });
        fireEvent.change(screen.getByLabelText(/where do you work/i), { target: { value: 'Retail' } });
        fireEvent.click(screen.getByRole('button', { name: /^part-time$/i }));
        fireEvent.click(screen.getByRole('button', { name: /send my update/i }));

        await waitFor(() => expect(screen.getByText(/thank you, anna/i)).toBeInTheDocument());
        expect(rpc).toHaveBeenCalledWith('submit_employment_status', {
            p_email: 'anna@example.com',
            p_is_working: true,
            p_started_month: '2024-03',
            p_field: 'Retail',
            p_employment_type: 'part_time',
            p_student_id: 's1',
        });
        expect(screen.getByText('March 2024')).toBeInTheDocument();
    });

    it('lets people who share an email pick their name', async () => {
        rpc.mockImplementation(async (name: string) => {
            if (name === 'find_employment_students_by_email') {
                return {
                    data: [
                        { student_id: 's1', first_name: 'Anna', last_name: 'Smith' },
                        { student_id: 's2', first_name: 'Ben', last_name: 'Smith' },
                    ],
                    error: null,
                };
            }
            return { data: { success: true, message: 'ok' }, error: null };
        });

        render(<StatusUpdatePage />);
        fillEmail();
        fireEvent.click(screen.getByRole('button', { name: /not yet/i }));
        fireEvent.click(screen.getByRole('button', { name: /send my update/i }));

        fireEvent.click(await screen.findByRole('button', { name: /ben smith/i }));
        await waitFor(() => expect(screen.getByText(/thank you, ben/i)).toBeInTheDocument());
        expect(rpc).toHaveBeenLastCalledWith('submit_employment_status', expect.objectContaining({
            p_is_working: false,
            p_started_month: null,
            p_student_id: 's2',
        }));
    });

    it('shows the server message when the email is not found', async () => {
        rpc.mockImplementation(async (name: string) => {
            if (name === 'find_employment_students_by_email') return { data: [], error: null };
            return { data: { success: false, message: 'This email address does not match any of our records.' }, error: null };
        });

        render(<StatusUpdatePage />);
        fillEmail();
        fireEvent.click(screen.getByRole('button', { name: /not yet/i }));
        fireEvent.click(screen.getByRole('button', { name: /send my update/i }));

        expect(await screen.findByRole('alert')).toHaveTextContent(/does not match/i);
    });

    describe('external list link (/status?list=…)', () => {
        beforeEach(() => window.history.pushState({}, '', '/status?list=list-1'));
        afterEach(() => window.history.pushState({}, '', '/'));

        it('saves the answer to the list only, without looking up CRM students', async () => {
            rpc.mockResolvedValue({ data: { success: true, message: 'ok', first_name: 'Olga' }, error: null });

            render(<StatusUpdatePage />);
            expect(screen.getByText('How are things going?')).toBeInTheDocument();
            fillEmail('Olga@Example.com');
            fireEvent.click(screen.getByRole('button', { name: /not yet/i }));
            fireEvent.click(screen.getByRole('button', { name: /send my update/i }));

            await waitFor(() => expect(screen.getByText(/thank you, olga/i)).toBeInTheDocument());
            expect(rpc).toHaveBeenCalledTimes(1);
            expect(rpc).toHaveBeenCalledWith('submit_outreach_status', {
                p_list_id: 'list-1',
                p_email: 'olga@example.com',
                p_is_working: false,
                p_started_month: null,
                p_field: null,
                p_employment_type: null,
            });
        });

        it('shows the server message when the email is not on the list', async () => {
            rpc.mockResolvedValue({ data: { success: false, message: 'This email address does not match any of our records.' }, error: null });

            render(<StatusUpdatePage />);
            fillEmail();
            fireEvent.click(screen.getByRole('button', { name: /not yet/i }));
            fireEvent.click(screen.getByRole('button', { name: /send my update/i }));

            expect(await screen.findByRole('alert')).toHaveTextContent(/does not match/i);
        });
    });
});
