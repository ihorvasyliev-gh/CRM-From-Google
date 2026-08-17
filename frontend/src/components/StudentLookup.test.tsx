import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import StudentLookup from './StudentLookup';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
    supabase: {
        rpc: vi.fn(),
    },
}));

function renderWithClient(ui: React.ReactElement) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            {ui}
        </QueryClientProvider>
    );
}

describe('StudentLookup Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mockSearchResults = [
        {
            id: 'st-1',
            first_name: 'Ihor',
            last_name: 'Vasyliev',
            email: 'b1ackproff@gmail.com',
            phone: '+353872890084',
            address: '2 Glen view villas Commons road',
            eircode: 't23y2y4',
            dob: '1992-06-08',
            created_at: '2026-01-01T00:00:00Z',
        },
    ];

    const mockDetail = {
        id: 'st-1',
        first_name: 'Ihor',
        last_name: 'Vasyliev',
        email: 'b1ackproff@gmail.com',
        phone: '+353872890084',
        address: '2 Glen view villas Commons road',
        eircode: 't23y2y4',
        dob: '1992-06-08',
        created_at: '2026-01-01T00:00:00Z',
        enrollments: [],
        flags: [],
    };

    it('searches for students and allows clicking name and contact info fields to copy to clipboard', async () => {
        const writeTextMock = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, {
            clipboard: {
                writeText: writeTextMock,
            },
        });

        (supabase.rpc as any).mockImplementation((rpcName: string) => {
            if (rpcName === 'search_students_restricted') {
                return Promise.resolve({ data: mockSearchResults, error: null });
            }
            if (rpcName === 'get_student_detail_restricted') {
                return Promise.resolve({ data: mockDetail, error: null });
            }
            return Promise.resolve({ data: [], error: null });
        });

        renderWithClient(<StudentLookup />);

        // Type search query
        const searchInput = screen.getByPlaceholderText('Search by name, email, phone or eircode...');
        fireEvent.change(searchInput, { target: { value: 'Ihor' } });

        // Wait for search result item
        await waitFor(() => {
            expect(screen.getByText('Ihor Vasyliev')).toBeInTheDocument();
        });

        // Click student to open details
        fireEvent.click(screen.getByText('Ihor Vasyliev'));

        // Wait for details pane
        await waitFor(() => {
            expect(screen.getByText('Contact Information')).toBeInTheDocument();
            expect(screen.getByText('b1ackproff@gmail.com')).toBeInTheDocument();
            expect(screen.getByText('+353872890084')).toBeInTheDocument();
            expect(screen.getByText('2 Glen view villas Commons road')).toBeInTheDocument();
            expect(screen.getByText('t23y2y4')).toBeInTheDocument();
        });

        // 1. Copy Name (header)
        const nameHeader = screen.getByRole('heading', { level: 2, name: /Ihor Vasyliev/ });
        fireEvent.click(nameHeader);
        expect(writeTextMock).toHaveBeenCalledWith('Ihor Vasyliev');

        // 2. Copy Email Address card
        fireEvent.click(screen.getByText('b1ackproff@gmail.com'));
        expect(writeTextMock).toHaveBeenCalledWith('b1ackproff@gmail.com');

        // 3. Copy Phone Number card
        fireEvent.click(screen.getByText('+353872890084'));
        expect(writeTextMock).toHaveBeenCalledWith('+353872890084');

        // 4. Copy Address card
        fireEvent.click(screen.getByText('2 Glen view villas Commons road'));
        expect(writeTextMock).toHaveBeenCalledWith('2 Glen view villas Commons road');

        // 5. Copy Eircode card
        fireEvent.click(screen.getByText('t23y2y4'));
        expect(writeTextMock).toHaveBeenCalledWith('t23y2y4');
    });
});
