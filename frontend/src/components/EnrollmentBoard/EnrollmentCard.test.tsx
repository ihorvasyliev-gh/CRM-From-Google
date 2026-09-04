import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EnrollmentCard from './EnrollmentCard';
import type { EnrollmentRow } from '../../hooks/useEnrollments';

describe('EnrollmentCard Component', () => {
    const mockToggleSelect = vi.fn();
    const mockTogglePriority = vi.fn();
    const mockOpenEditNote = vi.fn();
    const mockOnFlagClick = vi.fn();
    const mockOnShowDetail = vi.fn();
    const mockOnMoveStatus = vi.fn();

    const sampleEnrollment: EnrollmentRow = {
        id: 'enrollment-1',
        student_id: 'student-1',
        course_id: 'course-1',
        status: 'requested',
        course_variant: 'English',
        created_at: '2026-08-20T10:00:00Z',
        invited_date: null,
        confirmed_date: null,
        completed_date: null,
        invited_at: null,
        confirmed_at: null,
        completed_at: null,
        updated_at: '2026-08-20T10:00:00Z',
        response_days: 7,
        notes: 'Needs morning session',
        is_priority: false,
        completion_request_status: null,
        pending_completion_date: null,
        completion_requested_by: null,
        students: {
            id: 'student-1',
            first_name: 'John',
            last_name: 'Doe',
            email: 'john.doe@example.com',
            phone: '+353871234567',
            address: '123 Main St',
            eircode: 'T12AB34',
            dob: '1990-01-01',
            created_at: '2026-01-01T00:00:00Z',
        },
        courses: {
            id: 'course-1',
            name: 'First Aid Course',
            created_at: '2026-01-01T00:00:00Z',
        }
    };

    const defaultProps = {
        enrollment: sampleEnrollment,
        status: 'requested',
        isSelected: false,
        toggleSelect: mockToggleSelect,
        togglePriority: mockTogglePriority,
        queuePosition: 3,
        openEditNote: mockOpenEditNote,
        studentFlags: [],
        completedCourses: [],
        onFlagClick: mockOnFlagClick,
        onShowDetail: mockOnShowDetail,
        onMoveStatus: mockOnMoveStatus,
    };

    it('renders student name, course pill, and queue position', () => {
        render(<EnrollmentCard {...defaultProps} />);

        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText(/First Aid Course/i)).toBeInTheDocument();
        expect(screen.getByText('#3')).toBeInTheDocument();
    });

    it('renders phone link directly for calling without duplicate phone button', () => {
        render(<EnrollmentCard {...defaultProps} />);

        const phoneLink = screen.getByTitle('Click to call');
        expect(phoneLink).toBeInTheDocument();
        expect(phoneLink).toHaveAttribute('href', 'tel:+353871234567');
        expect(phoneLink).toHaveTextContent('+353871234567');

        // Verify there is NO duplicate "Call Phone Number" button
        expect(screen.queryByTitle('Call Phone Number')).toBeNull();
    });

    it('renders WhatsApp message button with correct link', () => {
        render(<EnrollmentCard {...defaultProps} />);

        const waLink = screen.getByTitle('Chat on WhatsApp');
        expect(waLink).toBeInTheDocument();
        expect(waLink.getAttribute('href')).toContain('wa.me/353871234567');
    });

    it('renders compact note and allows clicking to edit', () => {
        render(<EnrollmentCard {...defaultProps} />);

        const noteBtn = screen.getByText('Needs morning session');
        expect(noteBtn).toBeInTheDocument();
        fireEvent.click(noteBtn);
        expect(mockOpenEditNote).toHaveBeenCalledWith(sampleEnrollment);
    });

    it('opens Quick Move popover in portal and triggers onMoveStatus', () => {
        render(<EnrollmentCard {...defaultProps} />);

        const quickMoveBtn = screen.getByTitle('Move status');
        expect(quickMoveBtn).toBeInTheDocument();
        fireEvent.click(quickMoveBtn);

        // Popover title in portal
        expect(screen.getByText('Move to Status')).toBeInTheDocument();

        // Click a target status
        const invitedOption = screen.getByText(/Invited/i);
        expect(invitedOption).toBeInTheDocument();
        fireEvent.click(invitedOption);

        expect(mockOnMoveStatus).toHaveBeenCalledWith('enrollment-1', 'requested', 'invited');
    });

    it('positions Quick Move popover directly at button on desktop without slideUp translate glitch', () => {
        render(<EnrollmentCard {...defaultProps} />);

        const quickMoveBtn = screen.getByTitle('Move status');
        vi.spyOn(quickMoveBtn, 'getBoundingClientRect').mockReturnValue({
            top: 200,
            bottom: 224,
            left: 500,
            right: 524,
            width: 24,
            height: 24,
            x: 500,
            y: 200,
            toJSON: () => {}
        });

        fireEvent.click(quickMoveBtn);

        const popoverTitle = screen.getByText('Move to Status');
        const popoverCard = popoverTitle.closest('.w-44') as HTMLElement;
        expect(popoverCard).not.toBeNull();
        expect(popoverCard.className).toContain('animate-popoverScaleIn');
        expect(popoverCard.className).not.toContain('animate-slideUp');
        expect(popoverCard.className).toContain('origin-top-right');
        // right = 524, width = 176 -> left = 348. bottom = 224 -> top = 230
        expect(popoverCard.style.position).toBe('fixed');
        expect(popoverCard.style.top).toBe('230px');
        expect(popoverCard.style.left).toBe('348px');
    });

    it('positions Quick Move popover above button when near bottom of viewport', () => {
        render(<EnrollmentCard {...defaultProps} />);

        const quickMoveBtn = screen.getByTitle('Move status');
        // Place near bottom: window.innerHeight is usually 768 in jsdom
        vi.spyOn(quickMoveBtn, 'getBoundingClientRect').mockReturnValue({
            top: 650,
            bottom: 674,
            left: 500,
            right: 524,
            width: 24,
            height: 24,
            x: 500,
            y: 650,
            toJSON: () => {}
        });

        fireEvent.click(quickMoveBtn);

        const popoverTitle = screen.getByText('Move to Status');
        const popoverCard = popoverTitle.closest('.w-44') as HTMLElement;
        expect(popoverCard).not.toBeNull();
        expect(popoverCard.className).toContain('origin-bottom-right');
        // top = rect.top (650) - height (210) - 6 = 434
        expect(popoverCard.style.top).toBe('434px');
    });

    it('dismisses Quick Move popover on window scroll', () => {
        render(<EnrollmentCard {...defaultProps} />);

        const quickMoveBtn = screen.getByTitle('Move status');
        fireEvent.click(quickMoveBtn);
        expect(screen.getByText('Move to Status')).toBeInTheDocument();

        fireEvent.scroll(window);
        expect(screen.queryByText('Move to Status')).not.toBeInTheDocument();
    });

    it('toggles selection when tapping card body', () => {
        const { container } = render(<EnrollmentCard {...defaultProps} />);

        const card = container.querySelector('.enrollment-card');
        expect(card).not.toBeNull();
        fireEvent.click(card!);

        expect(mockToggleSelect).toHaveBeenCalledWith('enrollment-1');
    });

    it('renders mobile slide-up Action Sheet with Cancel button when screen is small', () => {
        window.innerWidth = 400;
        window.dispatchEvent(new Event('resize'));

        render(<EnrollmentCard {...defaultProps} />);

        const quickMoveBtn = screen.getByTitle('Move status');
        fireEvent.click(quickMoveBtn);

        // Action Sheet header with student context
        expect(screen.getByText(/John Doe • Current:/i)).toBeInTheDocument();
        // Cancel button
        const cancelBtn = screen.getByRole('button', { name: /^Cancel$/i });
        expect(cancelBtn).toBeInTheDocument();

        // Clicking cancel closes the sheet
        fireEvent.click(cancelBtn);
        expect(screen.queryByRole('button', { name: /^Cancel$/i })).not.toBeInTheDocument();

        // Restore window.innerWidth for subsequent tests
        window.innerWidth = 1024;
        window.dispatchEvent(new Event('resize'));
    });
});
