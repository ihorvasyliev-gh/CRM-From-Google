import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    const mockOnStatusBadgeClick = vi.fn();

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
        statusCounts: { requested: 0, invited: 0, confirmed: 30, completed: 0 },
        onStatusBadgeClick: mockOnStatusBadgeClick,
    };

    it('renders Course Date chips with weekday, day, month and student counts', () => {
        render(<FilterBar {...defaultProps} />);

        // Should render "All Dates" button with sum count (30)
        const allDatesBtn = screen.getByText('All Dates').closest('button');
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

        const allDatesBtn = screen.getByText('All Dates').closest('button');
        expect(allDatesBtn).not.toBeNull();
        fireEvent.click(allDatesBtn!);

        expect(mockSetSelectedCourseDate).toHaveBeenCalledWith('all');
    });

    it('hides the date chips row when no available course dates exist', () => {
        render(<FilterBar {...defaultProps} availableCourseDates={[]} />);

        expect(screen.queryByText('All Dates')).not.toBeInTheDocument();
        expect(screen.queryByText(/Dates:/i)).not.toBeInTheDocument();
    });
});
