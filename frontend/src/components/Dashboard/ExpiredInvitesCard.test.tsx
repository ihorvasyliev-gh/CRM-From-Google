import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExpiredInvitesCard from './ExpiredInvitesCard';
import { ExpiredInviteItem } from './dashboardUtils';

describe('ExpiredInvitesCard', () => {
    it('renders empty success state when no expired invites', () => {
        render(<ExpiredInvitesCard items={[]} />);
        expect(screen.getByText(/All invites on track/i)).toBeInTheDocument();
        expect(screen.getByText(/No students currently past their response deadline/i)).toBeInTheDocument();
    });

    it('renders list of overdue invites and navigates to enrollment course when onOpenStudentDetail is not provided', () => {
        const mockNavigate = vi.fn();
        const items: ExpiredInviteItem[] = [
            {
                id: 'enr-1',
                studentId: 'stu-1',
                studentName: 'John Doe',
                courseId: 'crs-1',
                courseName: 'SafePass',
                invitedAt: '2026-08-20',
                deadlineMs: 123456,
                hoursRemaining: -48,
                isExpired: true,
                timeLabel: 'Expired 2d ago',
            },
        ];

        render(<ExpiredInvitesCard items={items} onNavigate={mockNavigate} />);
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('SafePass')).toBeInTheDocument();
        expect(screen.getByText('Expired 2d ago')).toBeInTheDocument();
        expect(screen.getByText('1 overdue')).toBeInTheDocument();

        const studentBtn = screen.getByRole('button', { name: 'John Doe' });
        fireEvent.click(studentBtn);
        expect(mockNavigate).toHaveBeenCalledWith('enrollments', { courseId: 'crs-1' });
    });

    it('calls onOpenStudentDetail when student name button is clicked and onOpenStudentDetail is provided', () => {
        const mockNavigate = vi.fn();
        const mockOpenStudentDetail = vi.fn();
        const items: ExpiredInviteItem[] = [
            {
                id: 'enr-1',
                studentId: 'stu-1',
                studentName: 'Jane Smith',
                courseId: 'crs-1',
                courseName: 'SafePass',
                invitedAt: '2026-08-20',
                deadlineMs: 123456,
                hoursRemaining: -24,
                isExpired: true,
                timeLabel: 'Expired 1d ago',
            },
        ];

        render(
            <ExpiredInvitesCard
                items={items}
                onNavigate={mockNavigate}
                onOpenStudentDetail={mockOpenStudentDetail}
            />
        );

        const studentBtn = screen.getByRole('button', { name: 'Jane Smith' });
        fireEvent.click(studentBtn);
        expect(mockOpenStudentDetail).toHaveBeenCalledWith('stu-1');
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('calls onNavigate with courseId when arrow button is clicked', () => {
        const mockNavigate = vi.fn();
        const items: ExpiredInviteItem[] = [
            {
                id: 'enr-1',
                studentId: 'stu-1',
                studentName: 'John Doe',
                courseId: 'crs-99',
                courseName: 'Manual Handling',
                invitedAt: '2026-08-20',
                deadlineMs: 123456,
                hoursRemaining: -10,
                isExpired: true,
                timeLabel: 'Expired today',
            },
        ];

        render(<ExpiredInvitesCard items={items} onNavigate={mockNavigate} />);
        const arrowBtn = screen.getByRole('button', { name: 'Open Manual Handling board' });
        fireEvent.click(arrowBtn);
        expect(mockNavigate).toHaveBeenCalledWith('enrollments', { courseId: 'crs-99' });
    });

    it('renders maximum 5 items and provides View all button when items.length > 5', () => {
        const mockNavigate = vi.fn();
        const items: ExpiredInviteItem[] = Array.from({ length: 7 }, (_, i) => ({
            id: `enr-${i + 1}`,
            studentId: `stu-${i + 1}`,
            studentName: `Student ${i + 1}`,
            courseId: `crs-${i + 1}`,
            courseName: `Course ${i + 1}`,
            invitedAt: '2026-08-20',
            deadlineMs: 1000 + i,
            hoursRemaining: -10 - i,
            isExpired: true,
            timeLabel: 'Expired 1d ago',
        }));

        render(<ExpiredInvitesCard items={items} onNavigate={mockNavigate} />);

        // First 5 should be rendered
        expect(screen.getByText('Student 1')).toBeInTheDocument();
        expect(screen.getByText('Student 5')).toBeInTheDocument();
        // 6th and 7th should not be rendered
        expect(screen.queryByText('Student 6')).not.toBeInTheDocument();
        expect(screen.queryByText('Student 7')).not.toBeInTheDocument();

        // View all button
        const viewAllBtn = screen.getByRole('button', { name: 'View all 7 in Kanban →' });
        expect(viewAllBtn).toBeInTheDocument();

        fireEvent.click(viewAllBtn);
        expect(mockNavigate).toHaveBeenCalledWith('enrollments', { status: 'invited' });
    });

    it('does not render View all button when items.length <= 5', () => {
        const items: ExpiredInviteItem[] = Array.from({ length: 3 }, (_, i) => ({
            id: `enr-${i + 1}`,
            studentId: `stu-${i + 1}`,
            studentName: `Student ${i + 1}`,
            courseId: `crs-${i + 1}`,
            courseName: `Course ${i + 1}`,
            invitedAt: '2026-08-20',
            deadlineMs: 1000 + i,
            hoursRemaining: -5,
            isExpired: true,
            timeLabel: 'Expired today',
        }));

        render(<ExpiredInvitesCard items={items} />);
        expect(screen.queryByRole('button', { name: /View all .* in Kanban/i })).not.toBeInTheDocument();
    });

    it('handles nearing deadline styling when isExpired is false', () => {
        const items: ExpiredInviteItem[] = [
            {
                id: 'enr-1',
                studentId: 'stu-1',
                studentName: 'Alice Young',
                courseId: 'crs-1',
                courseName: 'SafePass',
                invitedAt: '2026-08-20',
                deadlineMs: 123456,
                hoursRemaining: 12,
                isExpired: false,
                timeLabel: '12h left',
            },
        ];

        render(<ExpiredInvitesCard items={items} />);
        const badge = screen.getByText('12h left');
        expect(badge).toBeInTheDocument();
        expect(badge.className).toContain('text-amber-600');
    });
});
