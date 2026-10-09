import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useState, type ComponentProps } from 'react';
import FilterBar from './FilterBar';

describe('FilterBar Component - Date Filter', () => {
    const mockSetSearchQuery = vi.fn();
    const mockSetEnrollModalOpen = vi.fn();
    const mockSetSelectedCourse = vi.fn();
    const mockSetSelectedVariant = vi.fn();
    const mockSetSelectedCourseDate = vi.fn();
    const mockSetDateFrom = vi.fn();
    const mockSetDateTo = vi.fn();
    const mockSetCourseDateFrom = vi.fn();
    const mockSetCourseDateTo = vi.fn();
    const mockSetSortOrder = vi.fn();
    const mockSetInviteFilter = vi.fn();

    const defaultProps = {
        enrollments: [],
        enrollmentCount: 30,
        filteredCount: 30,
        searchQuery: '',
        setSearchQuery: mockSetSearchQuery,
        setEnrollModalOpen: mockSetEnrollModalOpen,
        selectedCourse: 'course-1',
        setSelectedCourse: mockSetSelectedCourse,
        uniqueCourses: [{ id: 'course-1', name: 'Patient moving and handling' }],
        selectedVariant: 'all',
        setSelectedVariant: mockSetSelectedVariant,
        uniqueVariants: [],
        selectedCourseDate: 'all',
        setSelectedCourseDate: mockSetSelectedCourseDate,
        availableCourseDates: [
            { date: '2026-08-26', count: 5 },
            { date: '2026-08-27', count: 13 },
            { date: '2026-08-28', count: 12 },
        ],
        dateFrom: '',
        setDateFrom: mockSetDateFrom,
        dateTo: '',
        setDateTo: mockSetDateTo,
        courseDateFrom: '',
        setCourseDateFrom: mockSetCourseDateFrom,
        courseDateTo: '',
        setCourseDateTo: mockSetCourseDateTo,
        sortOrder: 'date-asc' as const,
        setSortOrder: mockSetSortOrder,
        inviteFilter: 'all' as const,
        setInviteFilter: mockSetInviteFilter,
        inviteCounts: { expired: 0, soon: 0 },
    };

    beforeEach(() => vi.clearAllMocks());

    it('renders Course Date chips with weekday, day, month and student counts', () => {
        render(<FilterBar {...defaultProps} />);

        // Should render "All Dates" button with sum count (30)
        const allDatesBtn = screen.getByText('All dates').closest('button');
        expect(allDatesBtn).toBeInTheDocument();
        expect(allDatesBtn).toHaveTextContent('30');

        // Should render date chips
        // 2026-08-26 is Wednesday
        const chip26 = screen.getByText(/26\s+Aug/i).closest('button');
        expect(chip26).toBeInTheDocument();
        expect(chip26).toHaveTextContent('5');

        // 2026-08-27 is Thursday
        const chip27 = screen.getByText(/27\s+Aug/i).closest('button');
        expect(chip27).toBeInTheDocument();
        expect(chip27).toHaveTextContent('13');

        // 2026-08-28 is Friday
        const chip28 = screen.getByText(/28\s+Aug/i).closest('button');
        expect(chip28).toBeInTheDocument();
        expect(chip28).toHaveTextContent('12');
    });

    it('triggers setSelectedCourseDate when clicking a date chip', () => {
        render(<FilterBar {...defaultProps} />);

        const chip28 = screen.getByText(/28\s+Aug/i).closest('button');
        expect(chip28).not.toBeNull();
        fireEvent.click(chip28!);

        expect(mockSetSelectedCourseDate).toHaveBeenCalledWith('2026-08-28');
    });

    it('resets date to all when clicking All Dates chip or clearing', () => {
        render(<FilterBar {...defaultProps} selectedCourseDate="2026-08-28" />);

        const allDatesBtn = screen.getByText('All dates').closest('button');
        expect(allDatesBtn).not.toBeNull();
        fireEvent.click(allDatesBtn!);

        expect(mockSetSelectedCourseDate).toHaveBeenCalledWith('all');
    });

    it('opens the mobile filter sheet with all filter groups and a results button', () => {
        render(<FilterBar {...defaultProps} filteredCount={12} />);

        fireEvent.click(screen.getByRole('button', { name: /Open filters/i }));

        const sheet = screen.getByRole('dialog');
        expect(sheet).toHaveTextContent('12 of 30 enrollments');
        expect(sheet).toHaveTextContent('Upcoming dates');
        expect(sheet).toHaveTextContent('Sort');

        fireEvent.click(screen.getByRole('button', { name: /Show 12 results/i }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows each active filter once as a removable chip, without duplicating search', () => {
        render(
            <FilterBar
                {...defaultProps}
                selectedCourse="course-1"
                selectedCourseDate="2026-08-28"
                searchQuery="Alice"
            />
        );

        // Filter count badge on the mobile button: course + date (search lives in its own field)
        expect(screen.getByRole('button', { name: /Open filters/i })).toHaveTextContent('2');
        expect(screen.queryByText(/"Alice"/)).not.toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('Remove Date filter'));
        expect(mockSetSelectedCourseDate).toHaveBeenCalledWith('all');

        fireEvent.click(screen.getByLabelText('Remove Course filter'));
        expect(mockSetSelectedCourse).toHaveBeenCalledWith('all');
        expect(mockSetSelectedVariant).toHaveBeenCalledWith('all');
    });

    it('clears every filter but keeps the search text', () => {
        render(<FilterBar {...defaultProps} selectedCourseDate="2026-08-28" searchQuery="Alice" dateFrom="2026-08-01T00:00" />);

        fireEvent.click(screen.getByRole('button', { name: /^Clear filters$/i }));
        expect(mockSetSelectedCourse).toHaveBeenCalledWith('all');
        expect(mockSetSelectedVariant).toHaveBeenCalledWith('all');
        expect(mockSetSelectedCourseDate).toHaveBeenCalledWith('all');
        expect(mockSetDateFrom).toHaveBeenCalledWith('');
        expect(mockSetDateTo).toHaveBeenCalledWith('');
        expect(mockSetCourseDateFrom).toHaveBeenCalledWith('');
        expect(mockSetCourseDateTo).toHaveBeenCalledWith('');
        expect(mockSetSearchQuery).not.toHaveBeenCalled();
    });

    it('shows a hidden date range as a chip until the range panel is opened', () => {
        render(<FilterBar {...defaultProps} dateFrom="2026-08-01T00:00" />);

        const toggle = screen.getByRole('button', { name: /Date range filters/i });
        expect(toggle).toHaveTextContent('1');
        // mobile strip + desktop toolbar
        expect(screen.getAllByLabelText('Remove Created filter')).toHaveLength(2);

        fireEvent.click(toggle);
        expect(screen.getAllByLabelText('Remove Created filter')).toHaveLength(1);
        expect(screen.getByText('Course date')).toBeInTheDocument();
    });

    it('changes sort order from the toolbar select', () => {
        render(<FilterBar {...defaultProps} />);

        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'name' } });
        expect(mockSetSortOrder).toHaveBeenCalledWith('name');
    });

    it('hides the language row when the course has a single language', () => {
        const { rerender } = render(<FilterBar {...defaultProps} uniqueVariants={['English']} />);
        expect(screen.queryByText('English')).not.toBeInTheDocument();

        rerender(<FilterBar {...defaultProps} uniqueVariants={['English', 'Ukrainian']} />);
        expect(screen.getByText('Ukrainian')).toBeInTheDocument();
    });

    it('hides the invite chips when nothing is expired or due', () => {
        render(<FilterBar {...defaultProps} />);
        expect(screen.queryByRole('button', { name: /^Expired/ })).not.toBeInTheDocument();
    });

    it('lets the user filter by expired invites', () => {
        render(<FilterBar {...defaultProps} inviteCounts={{ expired: 3, soon: 2 }} />);
        const chip = screen.getByRole('button', { name: /^Expired\s*3/ });
        fireEvent.click(chip);
        expect(mockSetInviteFilter).toHaveBeenCalledWith('expired');
    });

    it('toggles an active invite filter off', () => {
        render(<FilterBar {...defaultProps} inviteFilter="expired" inviteCounts={{ expired: 3, soon: 2 }} />);
        fireEvent.click(screen.getByRole('button', { name: /^Expired\s*3/ }));
        expect(mockSetInviteFilter).toHaveBeenCalledWith('all');
    });
});

describe('FilterBar search', () => {
    const noop = () => {};
    const baseProps: Omit<ComponentProps<typeof FilterBar>, 'searchQuery' | 'setSearchQuery'> = {
        enrollments: [], enrollmentCount: 10, filteredCount: 10, setEnrollModalOpen: noop,
        selectedCourse: 'all', setSelectedCourse: noop, uniqueCourses: [], selectedVariant: 'all', setSelectedVariant: noop,
        uniqueVariants: [], selectedCourseDate: 'all', setSelectedCourseDate: noop, availableCourseDates: [],
        dateFrom: '', setDateFrom: noop, dateTo: '', setDateTo: noop, courseDateFrom: '', setCourseDateFrom: noop,
        courseDateTo: '', setCourseDateTo: noop, sortOrder: 'date-asc', setSortOrder: noop,
        inviteFilter: 'all', setInviteFilter: noop, inviteCounts: { expired: 0, soon: 0 },
    };

    /** The board's side: holds the search and can reset it, like "Reset filters" */
    function Board({ onSearch, initial = '' }: { onSearch: (q: string) => void; initial?: string }) {
        const [searchQuery, setSearchQuery] = useState(initial);
        return (
            <>
                <FilterBar {...baseProps} searchQuery={searchQuery} setSearchQuery={q => { onSearch(q); setSearchQuery(q); }} />
                <button onClick={() => setSearchQuery('')}>Reset filters</button>
                <output data-testid="board-search">{searchQuery}</output>
            </>
        );
    }

    const field = () => screen.getByPlaceholderText(/Name, email or phone/) as HTMLInputElement;
    const type = (text: string) => fireEvent.change(field(), { target: { value: text } });

    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('shows typing at once and hands the board the search once typing pauses', () => {
        const onSearch = vi.fn();
        render(<Board onSearch={onSearch} />);

        type('a');
        act(() => { vi.advanceTimersByTime(100); });
        type('al');
        act(() => { vi.advanceTimersByTime(100); });
        type('ali');
        expect(field().value).toBe('ali');
        expect(onSearch).not.toHaveBeenCalled();

        act(() => { vi.advanceTimersByTime(200); });
        expect(onSearch).toHaveBeenCalledTimes(1);
        expect(onSearch).toHaveBeenCalledWith('ali');
        expect(screen.getByTestId('board-search')).toHaveTextContent('ali');
        expect(field().value).toBe('ali');
    });

    it('keeps typing that goes on after the board took the search', () => {
        const onSearch = vi.fn();
        render(<Board onSearch={onSearch} />);

        type('ali');
        act(() => { vi.advanceTimersByTime(200); });
        type('alice');
        expect(field().value).toBe('alice');
        act(() => { vi.advanceTimersByTime(200); });
        expect(onSearch).toHaveBeenLastCalledWith('alice');
        expect(field().value).toBe('alice');
    });

    it('clears at once with × or Escape', () => {
        const onSearch = vi.fn();
        render(<Board onSearch={onSearch} initial="bob" />);
        expect(field().value).toBe('bob');

        fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
        expect(field().value).toBe('');
        expect(onSearch).toHaveBeenLastCalledWith('');

        type('carl');
        fireEvent.keyDown(field(), { key: 'Escape' });
        expect(field().value).toBe('');
        act(() => { vi.advanceTimersByTime(500); });
        expect(onSearch).not.toHaveBeenCalledWith('carl');
        expect(screen.getByTestId('board-search')).toBeEmptyDOMElement();
    });

    it('shows a search the board resets', () => {
        render(<Board onSearch={vi.fn()} initial="dan" />);
        fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
        expect(field().value).toBe('');

        type('eve');
        act(() => { vi.advanceTimersByTime(200); });
        expect(screen.getByTestId('board-search')).toHaveTextContent('eve');
    });
});
