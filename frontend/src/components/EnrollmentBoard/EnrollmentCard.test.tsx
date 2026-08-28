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
        },
        courses: {
            id: 'course-1',
            name: 'First Aid Course',
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

    it('toggles selection when tapping card body', () => {
        const { container } = render(<EnrollmentCard {...defaultProps} />);

        const card = container.querySelector('.enrollment-card');
        expect(card).not.toBeNull();
        fireEvent.click(card!);

        expect(mockToggleSelect).toHaveBeenCalledWith('enrollment-1');
    });
});
