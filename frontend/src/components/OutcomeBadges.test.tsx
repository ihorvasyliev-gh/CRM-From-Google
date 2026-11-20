import { describe, it, expect, vi, beforeEach, onTestFinished } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
    TrackingBadge,
    EmploymentBadge,
    CallMarkButton,
    PhoneLink,
    EmailStatusBadges,
} from './OutcomeBadges';

function mockFinePointer(matches: boolean) {
    const realMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) =>
        query.includes('pointer: fine')
            ? { ...realMatchMedia(query), matches }
            : realMatchMedia(query)
    ) as typeof window.matchMedia;
    onTestFinished(() => { window.matchMedia = realMatchMedia; });
}

describe('OutcomeBadges', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.innerWidth = 1280;
        window.dispatchEvent(new Event('resize'));
    });

    describe('TrackingBadge', () => {
        it('renders each tracking status pill', () => {
            const { rerender } = render(<TrackingBadge status="not_contacted" />);
            expect(screen.getByText('Not Contacted')).toBeInTheDocument();

            rerender(<TrackingBadge status="pending" />);
            expect(screen.getByText('Pending')).toBeInTheDocument();

            rerender(<TrackingBadge status="responded" />);
            expect(screen.getByText('Responded')).toBeInTheDocument();
        });
    });

    describe('EmploymentBadge', () => {
        it.each([
            ['full_time', 'Working · Full-time'],
            ['part_time', 'Working · Part-time'],
            ['self_employed', 'Working · Self-employed'],
            ['ce_tus', 'Working · CE / TUS'],
        ] as const)('renders responded working pill for %s', (type, expectedText) => {
            render(
                <EmploymentBadge
                    status="responded"
                    row={{ is_working: true, employment_type: type, field_of_work: 'Healthcare' }}
                />,
            );
            expect(screen.getByText(expectedText)).toBeInTheDocument();
            expect(screen.getByText('in Healthcare')).toBeInTheDocument();
        });

        it('renders Working without separator or sector when employment_type and field_of_work are null', () => {
            render(
                <EmploymentBadge
                    status="responded"
                    row={{ is_working: true, employment_type: null, field_of_work: null }}
                />,
            );
            expect(screen.getByText('Working')).toBeInTheDocument();
            expect(screen.queryByText(/·/)).not.toBeInTheDocument();
            expect(screen.queryByText(/^in /)).not.toBeInTheDocument();
        });

        it('renders Not working pill when responded and is_working is false', () => {
            render(
                <EmploymentBadge
                    status="responded"
                    row={{ is_working: false, employment_type: null, field_of_work: null }}
                />,
            );
            expect(screen.getByText('Not working')).toBeInTheDocument();
        });

        it('renders Previously: Not working (never No data) when pending with prior false answer', () => {
            render(
                <EmploymentBadge
                    status="pending"
                    row={{ is_working: false, employment_type: null, field_of_work: null }}
                />,
            );
            expect(screen.getByText('Previously: Not working')).toBeInTheDocument();
            expect(screen.queryByText('No data')).not.toBeInTheDocument();
        });

        it('renders Previously: Working with employment type when pending with prior true answer', () => {
            render(
                <EmploymentBadge
                    status="pending"
                    row={{ is_working: true, employment_type: 'self_employed', field_of_work: 'Design' }}
                />,
            );
            expect(screen.getByText('Previously: Working · Self-employed')).toBeInTheDocument();
            expect(screen.getByText('in Design')).toBeInTheDocument();
            expect(screen.queryByText('No data')).not.toBeInTheDocument();
        });

        it('renders No data when pending without a prior answer or not contacted', () => {
            const { rerender } = render(
                <EmploymentBadge
                    status="pending"
                    row={{ is_working: null, employment_type: null, field_of_work: null }}
                />,
            );
            expect(screen.getByText('No data')).toBeInTheDocument();

            rerender(
                <EmploymentBadge
                    status="not_contacted"
                    row={{ is_working: null, employment_type: null, field_of_work: null }}
                />,
            );
            expect(screen.getByText('No data')).toBeInTheDocument();
        });
    });

    describe('EmailStatusBadges', () => {
        it('shows No email when email is missing or whitespace', () => {
            const { rerender } = render(<EmailStatusBadges email={null} optedOut={false} />);
            expect(screen.getByText('No email')).toBeInTheDocument();

            rerender(<EmailStatusBadges email="   " optedOut={true} />);
            expect(screen.getByText('No email')).toBeInTheDocument();
            expect(screen.queryByText('Unsubscribed')).not.toBeInTheDocument();
        });

        it('shows Unsubscribed with explanatory title when optedOut is true and email exists', () => {
            render(<EmailStatusBadges email="user@example.com" optedOut={true} />);
            const badge = screen.getByText('Unsubscribed');
            expect(badge).toBeInTheDocument();
            expect(badge).toHaveAttribute('title', 'Unsubscribed from emails — skipped automatically');
        });

        it('renders nothing when email is present and not opted out', () => {
            const { container } = render(<EmailStatusBadges email="user@example.com" optedOut={false} />);
            expect(container.firstChild).toBeNull();
        });
    });

    describe('PhoneLink', () => {
        it('returns null when phone is empty or whitespace', () => {
            const { container, rerender } = render(<PhoneLink phone={null} />);
            expect(container.firstChild).toBeNull();

            rerender(<PhoneLink phone="   " />);
            expect(container.firstChild).toBeNull();
        });

        it('copies formatted number on desktop click, shows Copied for 1500ms, and stops propagation', async () => {
            vi.useFakeTimers();
            onTestFinished(() => { vi.useRealTimers(); });

            mockFinePointer(true);
            const writeText = vi.fn().mockResolvedValue(undefined);
            Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
            const parentClick = vi.fn();

            render(
                <div onClick={parentClick}>
                    <PhoneLink phone="+353871234567" />
                </div>,
            );

            const link = screen.getByTitle('Click to copy the number');
            expect(link).toHaveAttribute('href', 'tel:+353871234567');
            expect(link).toHaveTextContent('087 123 4567');

            const textEl = screen.getByText('087 123 4567');
            expect(textEl).toHaveAttribute('aria-live', 'polite');

            await act(async () => {
                fireEvent.click(link);
            });

            expect(writeText).toHaveBeenCalledWith('087 123 4567');
            expect(parentClick).not.toHaveBeenCalled();
            expect(link).toHaveTextContent('Copied');

            await act(async () => {
                vi.advanceTimersByTime(1500);
            });
            expect(link).toHaveTextContent('087 123 4567');
        });

        it('renders a tel: dial link on mobile/touch screens without copying to clipboard', () => {
            mockFinePointer(false);
            window.innerWidth = 390;
            window.dispatchEvent(new Event('resize'));

            const writeText = vi.fn().mockResolvedValue(undefined);
            Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
            const parentClick = vi.fn();

            render(
                <div onClick={parentClick}>
                    <PhoneLink phone="+353871234567" />
                </div>,
            );

            const link = screen.getByTitle('Click to call');
            expect(link).toHaveAttribute('href', 'tel:+353871234567');
            expect(link).toHaveTextContent('087 123 4567');

            fireEvent.click(link);
            expect(parentClick).not.toHaveBeenCalled();
            expect(writeText).not.toHaveBeenCalled();
        });
    });

    describe('CallMarkButton', () => {
        it('returns null when status is responded and toggles when not responded', () => {
            const onToggle = vi.fn();
            const parentClick = vi.fn();

            const { container, rerender } = render(
                <CallMarkButton status="responded" calledAt={null} onToggle={onToggle} name="Jane Doe" />,
            );
            expect(container.firstChild).toBeNull();

            rerender(
                <div onClick={parentClick}>
                    <CallMarkButton status="pending" calledAt={null} onToggle={onToggle} name="Jane Doe" />
                </div>,
            );
            fireEvent.click(screen.getByRole('button', { name: /Mark Jane Doe as called, no answer/i }));
            expect(onToggle).toHaveBeenCalledTimes(1);
            expect(parentClick).not.toHaveBeenCalled();
        });
    });
});
