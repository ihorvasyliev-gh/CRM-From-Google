import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import CourseFilter from './CourseFilter';

const courses = [
    { id: 'c-barista', name: 'Barista Skills' },
    { id: 'c-excel', name: 'Excel Basics' },
    { id: 'c-forklift', name: 'Forklift Training' },
    { id: 'c-safe', name: 'Safe Pass' },
];

function setup(value = 'all') {
    const onChange = vi.fn();
    const view = render(<CourseFilter courses={courses} value={value} onChange={onChange} />);
    return { onChange, ...view };
}

const open = (name: RegExp | string) => fireEvent.click(screen.getByRole('button', { name }));
const optionNames = () => within(screen.getByRole('listbox')).getAllByRole('option').map(o => o.textContent);

describe('CourseFilter', () => {
    beforeEach(() => localStorage.clear());

    it('finds a course by typing and picks it with the keyboard', () => {
        const { onChange } = setup();
        open('Course: all courses');

        const search = screen.getByRole('combobox', { name: 'Search courses' });
        expect(search).toHaveFocus();
        fireEvent.change(search, { target: { value: 'fork' } });
        expect(optionNames()).toEqual(['Forklift Training']);

        fireEvent.keyDown(search, { key: 'Enter' });
        expect(onChange).toHaveBeenCalledWith('c-forklift');
        expect(screen.queryByRole('listbox')).toBeNull();
        expect(screen.getByRole('button', { name: 'Course: all courses' })).toHaveFocus();
    });

    it('lists the courses picked last first, and remembers them', () => {
        const { onChange, unmount } = setup();
        open('Course: all courses');
        fireEvent.click(screen.getByRole('option', { name: 'Safe Pass' }));
        open('Course: all courses');
        fireEvent.click(screen.getByRole('option', { name: 'Excel Basics' }));
        expect(onChange).toHaveBeenLastCalledWith('c-excel');
        unmount();

        setup('c-excel');
        open('Course: Excel Basics');
        expect(screen.getByText('Recent')).toBeInTheDocument();
        expect(optionNames()).toEqual(['All courses', 'Excel Basics', 'Safe Pass', 'Barista Skills', 'Forklift Training']);
        expect(screen.getByRole('option', { name: 'Excel Basics' })).toHaveAttribute('aria-selected', 'true');
    });

    it('goes back to every course, and closes on Escape', () => {
        const { onChange } = setup('c-safe');
        open('Course: Safe Pass');
        fireEvent.click(screen.getByRole('option', { name: 'All courses' }));
        expect(onChange).toHaveBeenCalledWith('all');

        open('Course: Safe Pass');
        fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
        expect(screen.queryByRole('listbox')).toBeNull();
    });
});
