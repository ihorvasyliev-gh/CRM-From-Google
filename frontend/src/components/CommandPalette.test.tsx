import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CommandPalette from './CommandPalette';

const createTestQueryClient = () =>
    new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });

const render = (ui: React.ReactElement) => {
    return rtlRender(
        <QueryClientProvider client={createTestQueryClient()}>
            {ui}
        </QueryClientProvider>
    );
};

const mockRpc = vi.fn((_fn?: string, _params?: any) => Promise.resolve({ data: [] }));
const mockFrom = vi.fn((_table?: string) => ({
    select: vi.fn(() => ({
        order: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({ data: [] }),
        })),
        limit: vi.fn().mockResolvedValue({ data: [] }),
        or: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [] }),
        }),
    })),
}));

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: (...args: any[]) => (mockFrom as any)(...args),
        rpc: (...args: any[]) => (mockRpc as any)(...args),
    },
}));

describe('CommandPalette Component', () => {
    const mockNavigate = vi.fn();
    const mockClose = vi.fn();
    const mockToggleDarkMode = vi.fn();
    const mockToggleDensity = vi.fn();
    const mockOpenAddStudent = vi.fn();
    const mockOpenApprovals = vi.fn();
    const mockOpenShortcuts = vi.fn();
    const mockOpenStudentDetail = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders search input and navigation items when open', () => {
        render(
            <CommandPalette
                open={true}
                onClose={mockClose}
                onNavigate={mockNavigate}
                onOpenAddStudent={mockOpenAddStudent}
                onOpenApprovals={mockOpenApprovals}
                onOpenShortcuts={mockOpenShortcuts}
                darkMode={false}
                toggleDarkMode={mockToggleDarkMode}
                density="comfortable"
                toggleDensity={mockToggleDensity}
                isViewer={false}
                pendingApprovalsCount={3}
            />
        );

        expect(screen.getByPlaceholderText(/search students, courses, navigation/i)).toBeInTheDocument();
        expect(screen.getByText('Dashboard')).toBeInTheDocument();
        expect(screen.getByText('Students')).toBeInTheDocument();
        expect(screen.getByText('Courses')).toBeInTheDocument();
        expect(screen.getByText('Enrollments')).toBeInTheDocument();
        expect(screen.getByText('Pending Approvals')).toBeInTheDocument();
        expect(screen.getByText('Switch to Dark Mode')).toBeInTheDocument();
        expect(screen.getByText('Switch to Compact View')).toBeInTheDocument();
    });

    it('filters items based on user search query', () => {
        render(
            <CommandPalette
                open={true}
                onClose={mockClose}
                onNavigate={mockNavigate}
                onOpenAddStudent={mockOpenAddStudent}
                darkMode={false}
                toggleDarkMode={mockToggleDarkMode}
                density="comfortable"
                toggleDensity={mockToggleDensity}
            />
        );

        const input = screen.getByPlaceholderText(/search students, courses, navigation/i);
        fireEvent.change(input, { target: { value: 'Analytics' } });

        expect(screen.getByText('Analytics')).toBeInTheDocument();
        expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    });

    it('triggers action and closes palette when action item is clicked', () => {
        render(
            <CommandPalette
                open={true}
                onClose={mockClose}
                onNavigate={mockNavigate}
                darkMode={false}
                toggleDarkMode={mockToggleDarkMode}
                density="comfortable"
                toggleDensity={mockToggleDensity}
            />
        );

        const themeBtn = screen.getByText('Switch to Dark Mode');
        fireEvent.click(themeBtn);

        expect(mockToggleDarkMode).toHaveBeenCalledTimes(1);
        expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('triggers navigation when navigation item is clicked', () => {
        render(
            <CommandPalette
                open={true}
                onClose={mockClose}
                onNavigate={mockNavigate}
                darkMode={false}
                toggleDarkMode={mockToggleDarkMode}
                density="comfortable"
                toggleDensity={mockToggleDensity}
            />
        );

        const studentsNav = screen.getByText('Students');
        fireEvent.click(studentsNav);

        expect(mockNavigate).toHaveBeenCalledWith('students');
        expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('closes on Escape key press', () => {
        render(
            <CommandPalette
                open={true}
                onClose={mockClose}
                onNavigate={mockNavigate}
                darkMode={false}
                toggleDarkMode={mockToggleDarkMode}
                density="comfortable"
                toggleDensity={mockToggleDensity}
            />
        );

        const input = screen.getByPlaceholderText(/search students, courses, navigation/i);
        fireEvent.keyDown(input, { key: 'Escape' });

        expect(mockClose).toHaveBeenCalledTimes(1);
    });

    describe('Viewer Mode Functionality', () => {
        beforeEach(() => {
            mockRpc.mockImplementation((rpcName?: string, params?: any): Promise<any> => {
                if (rpcName === 'get_viewer_courses') {
                    return Promise.resolve({
                        data: [
                            { id: 'c-1', name: 'Digital Skills' },
                            { id: 'c-2', name: 'Safe Pass' },
                        ],
                    });
                }
                if (rpcName === 'get_viewer_students_directory') {
                    if (params?.p_search === 'Ihor') {
                        return Promise.resolve({
                            data: [
                                {
                                    student_id: 's-1',
                                    first_name: 'Ihor',
                                    last_name: 'Vasyliev',
                                    email: 'ihor@example.com',
                                    phone: '+353872890084',
                                    address: 'Commons road',
                                    eircode: 'T23 Y2Y4',
                                },
                            ],
                        });
                    }
                    return Promise.resolve({
                        data: [
                            {
                                student_id: 's-2',
                                first_name: 'Alice',
                                last_name: 'Smith',
                                email: 'alice@example.com',
                            },
                        ],
                    });
                }
                return Promise.resolve({ data: [] });
            });
        });

        it('renders viewer-specific navigation and fetches data via secure RPCs without table queries', async () => {
            render(
                <CommandPalette
                    open={true}
                    onClose={mockClose}
                    onNavigate={mockNavigate}
                    darkMode={false}
                    toggleDarkMode={mockToggleDarkMode}
                    density="comfortable"
                    toggleDensity={mockToggleDensity}
                    isViewer={true}
                />
            );

            expect(screen.getByText('Students Directory')).toBeInTheDocument();
            expect(screen.getByText('Course Monitor')).toBeInTheDocument();
            expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
            expect(screen.queryByText('Enrollments')).not.toBeInTheDocument();
            expect(screen.queryByText('Pending Approvals')).not.toBeInTheDocument();
            expect(screen.queryByText('Add New Student')).not.toBeInTheDocument();

            expect(mockRpc).toHaveBeenCalledWith('get_viewer_courses');
            expect(mockRpc).toHaveBeenCalledWith('get_viewer_students_directory', { p_limit: 30 });
            expect(mockFrom).not.toHaveBeenCalled();

            expect(await screen.findByText('Digital Skills')).toBeInTheDocument();
            expect(await screen.findByText('Alice Smith')).toBeInTheDocument();
        });

        it('searches for students via get_viewer_students_directory RPC when viewer queries', async () => {
            render(
                <CommandPalette
                    open={true}
                    onClose={mockClose}
                    onNavigate={mockNavigate}
                    onOpenStudentDetail={mockOpenStudentDetail}
                    darkMode={false}
                    toggleDarkMode={mockToggleDarkMode}
                    density="comfortable"
                    toggleDensity={mockToggleDensity}
                    isViewer={true}
                />
            );

            const input = screen.getByPlaceholderText(/search students, courses, navigation/i);
            fireEvent.change(input, { target: { value: 'Ihor' } });

            await waitFor(() => {
                expect(mockRpc).toHaveBeenCalledWith('get_viewer_students_directory', {
                    p_search: 'Ihor',
                    p_limit: 20,
                });
            });

            const studentItem = await screen.findByText('Ihor Vasyliev');
            expect(studentItem).toBeInTheDocument();

            fireEvent.click(studentItem);
            expect(mockOpenStudentDetail).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 's-1',
                    first_name: 'Ihor',
                    last_name: 'Vasyliev',
                    email: 'ihor@example.com',
                })
            );
            expect(mockClose).toHaveBeenCalledTimes(1);
        });

        it('navigates to courses tab when viewer selects a course item', async () => {
            render(
                <CommandPalette
                    open={true}
                    onClose={mockClose}
                    onNavigate={mockNavigate}
                    darkMode={false}
                    toggleDarkMode={mockToggleDarkMode}
                    density="comfortable"
                    toggleDensity={mockToggleDensity}
                    isViewer={true}
                />
            );

            const courseItem = await screen.findByText('Digital Skills');
            expect(courseItem).toBeInTheDocument();

            fireEvent.click(courseItem);
            expect(mockNavigate).toHaveBeenCalledWith('courses', { courseId: 'c-1' });
            expect(mockClose).toHaveBeenCalledTimes(1);
        });
    });
});
