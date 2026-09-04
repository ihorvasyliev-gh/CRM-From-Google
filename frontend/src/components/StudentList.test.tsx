import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StudentList from './StudentList';
import { Student } from '../lib/types';

const mockStudents: Student[] = [
    {
        id: 'stu-1',
        first_name: 'Alice',
        last_name: 'Wonderland',
        email: 'alice@example.com',
        phone: '+353871112233',
        address: '10 Rabbit Hole Way',
        eircode: 'D01AB12',
        dob: '1998-04-12',
        created_at: '2026-05-10T12:00:00Z',
    },
    {
        id: 'stu-2',
        first_name: 'Bob',
        last_name: 'Marley',
        email: 'bob@example.com',
        phone: '+353874445566',
        address: '5 Kingston Blvd',
        eircode: 'D02XY34',
        dob: '1985-02-06',
        created_at: '2026-06-15T09:30:00Z',
    },
];

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                order: vi.fn(() => ({
                    range: vi.fn().mockResolvedValue({
                        data: mockStudents,
                        count: mockStudents.length,
                        error: null,
                    }),
                })),
                eq: vi.fn(() => ({
                    order: vi.fn().mockResolvedValue({ data: [] }),
                })),
            })),
            delete: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ error: null }),
            })),
        })),
    },
}));

function renderStudentList() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });

    return render(
        <QueryClientProvider client={queryClient}>
            <StudentList />
        </QueryClientProvider>
    );
}

describe('StudentList Responsive Mobile Cards', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders students with contact links and metadata in cards', async () => {
        renderStudentList();

        // Alice Wonderland should be present in both mobile card and desktop table
        const aliceNames = await screen.findAllByText(/Alice Wonderland/i);
        expect(aliceNames.length).toBeGreaterThanOrEqual(1);

        // Joined date should be visible in mobile card
        expect(screen.getByText(/Joined 10 May 2026/i)).toBeInTheDocument();

        // Check WhatsApp link
        const waLinks = screen.getAllByTitle('Chat on WhatsApp');
        expect(waLinks.length).toBeGreaterThanOrEqual(1);
        expect(waLinks[0].getAttribute('href')).toContain('wa.me/353871112233');

        // Check Call links
        const phoneCalls = screen.getAllByText('+353871112233');
        expect(phoneCalls.length).toBeGreaterThanOrEqual(1);

        // Check Eircode badges
        const eircodes = screen.getAllByText('D01AB12');
        expect(eircodes.length).toBeGreaterThanOrEqual(1);
    });

    it('renders Enroll button on mobile card to quickly enroll student', async () => {
        renderStudentList();

        const enrollBtns = await screen.findAllByTitle('Enroll student in course');
        expect(enrollBtns.length).toBe(2);

        fireEvent.click(enrollBtns[0]);

        // Enrollment modal should open with title "New Enrollment" or "Enroll Student"
        expect(await screen.findByText(/Enroll Student|New Enrollment/i)).toBeInTheDocument();
    });

    it('opens StudentDetail drawer when clicking student card', async () => {
        renderStudentList();

        const aliceCard = (await screen.findAllByText(/Alice Wonderland/i))[0];
        fireEvent.click(aliceCard);

        // StudentDetail drawer should open showing Contact Info / Copy Contact Summary
        expect(await screen.findByText('Copy Contact Summary')).toBeInTheDocument();
    });
});
