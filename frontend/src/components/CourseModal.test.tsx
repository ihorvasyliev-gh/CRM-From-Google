import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CourseModal from './CourseModal';
import type { Course } from '../lib/types';

vi.mock('./EmailEditor/EmailEditor', () => ({ default: () => <div data-testid="email-editor" /> }));

const course: Course = { id: 'c1', name: 'First Aid', max_capacity: 10, created_at: '2026-01-01T00:00:00Z' };

function setup(props: Partial<React.ComponentProps<typeof CourseModal>> = {}) {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<CourseModal open course={course} templates={[]} onSave={onSave} onClose={vi.fn()} {...props} />);
    return onSave;
}

describe('CourseModal', () => {
    it('is split into titled sections', () => {
        setup();
        for (const t of ['Basics', 'Places', 'Invitation email', 'Documents']) {
            expect(screen.getByRole('heading', { name: t })).toBeInTheDocument();
        }
    });

    it('warns, but does not block, when the limit is below the confirmed count', () => {
        const onSave = setup({ confirmedCount: 8 });
        fireEvent.change(screen.getByLabelText('Max participants per date'), { target: { value: '5' } });
        expect(screen.getByText(/8 people are already confirmed/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Update Course' }));
        expect(onSave).toHaveBeenCalled();
    });

    it('stops a name that another course already has', () => {
        const onSave = setup({ existingCourses: [{ id: 'c2', name: 'Manual Handling' }] });
        fireEvent.change(screen.getByLabelText('Course name *'), { target: { value: ' manual  handling ' } });
        expect(screen.getByText(/A course called "Manual Handling" already exists/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Update Course' }));
        expect(onSave).not.toHaveBeenCalled();
    });
});
