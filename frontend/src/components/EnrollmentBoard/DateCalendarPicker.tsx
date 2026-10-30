import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { EnrollmentRow } from '../../hooks/useEnrollments';

const POPOVER_WIDTH = 288;
/** Gap between the field and the calendar, and the least room kept to the window's edges */
const GAP = 6;
const EDGE = 8;

interface DateCalendarPickerProps {
    label: string;
    value: string; // "YYYY-MM-DDT00:00" or empty
    onChange: (val: string) => void;
    placeholder: string;
    enrollments: EnrollmentRow[];
    selectedCourse: string;
    limitDate?: string; // "YYYY-MM-DDT00:00" or empty
    isEndDate?: boolean;
    dateField?: 'created_at' | 'confirmed_date';
}

export default function DateCalendarPicker({
    label,
    value,
    onChange,
    placeholder,
    enrollments,
    selectedCourse,
    limitDate,
    isEndDate = false,
    dateField = 'created_at',
}: DateCalendarPickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popRef = useRef<HTMLDivElement>(null);

    // Parse current value
    const selectedDate = useMemo(() => {
        if (!value) return null;
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }, [value]);

    // Calendar state (month/year we are currently viewing)
    const [viewDate, setViewDate] = useState(() => {
        return selectedDate || new Date();
    });

    const currentYear = viewDate.getFullYear();
    const currentMonth = viewDate.getMonth(); // 0-11

    // Reset viewDate when selected date changes or popover opens
    useEffect(() => {
        if (isOpen && selectedDate) {
            setViewDate(selectedDate);
        }
    }, [isOpen, selectedDate]);

    /**
     * The calendar is portaled and fixed to the window, so a dialog's scrolling body (the Filters
     * sheet) can't clip it. It goes under the field, or above it when there is more room there,
     * and is kept inside the window.
     */
    function place() {
        if (!containerRef.current) return;
        const r = containerRef.current.getBoundingClientRect();
        const width = Math.min(POPOVER_WIDTH, window.innerWidth - 2 * EDGE);
        const maxHeight = window.innerHeight - 2 * EDGE;
        const h = Math.min(popRef.current?.offsetHeight ?? 330, maxHeight);
        const roomBelow = window.innerHeight - r.bottom - GAP - EDGE;
        const roomAbove = r.top - GAP - EDGE;
        const top = h <= roomBelow || roomBelow >= roomAbove ? r.bottom + GAP : r.top - GAP - h;
        setPos({
            top: Math.max(EDGE, Math.min(top, window.innerHeight - EDGE - h)),
            left: Math.max(EDGE, Math.min(r.left, window.innerWidth - EDGE - width)),
            width,
            maxHeight,
        });
    }

    useLayoutEffect(() => {
        if (isOpen) place();
    }, [isOpen]);

    // Close on a click elsewhere, a scroll behind it or Escape (which leaves the dialog under it
    // open); follow the field when the window resizes
    useEffect(() => {
        if (!isOpen) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!popRef.current?.contains(t) && !containerRef.current?.contains(t)) setIsOpen(false);
        };
        const onScroll = (e: Event) => {
            if (!popRef.current?.contains(e.target as Node)) setIsOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.preventDefault(); // tells useModalBehavior to leave the dialog open
            setIsOpen(false);
            triggerRef.current?.focus();
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey, true);
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', place);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey, true);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', place);
        };
    }, [isOpen]);

    // Format value for input display e.g., DD/MM/YYYY
    const displayValue = useMemo(() => {
        if (!selectedDate) return '';
        const day = String(selectedDate.getDate()).padStart(2, '0');
        const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const year = selectedDate.getFullYear();
        return `${day}/${month}/${year}`;
    }, [selectedDate]);

    // Compute enrollment distribution map for highlights
    const enrollmentCountsByDate = useMemo(() => {
        const counts: Record<string, number> = {};
        enrollments.forEach((e) => {
            // Check course filter matches
            if (selectedCourse !== 'all' && e.course_id !== selectedCourse) {
                return;
            }
            const dateVal = dateField === 'confirmed_date' ? (e.confirmed_date || e.invited_date || e.completed_date) : e.created_at;
            if (!dateVal) return;
            // Parse to local date key: YYYY-MM-DD
            const d = new Date(dateVal);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            counts[key] = (counts[key] || 0) + 1;
        });
        return counts;
    }, [enrollments, selectedCourse, dateField]);

    // Calendar grid calculations
    const calendarDays = useMemo(() => {
        // First day of current view month
        const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
        // Weekday index (0 = Sunday, 1 = Monday, etc.) -> Adjust so Monday is 0
        const firstDayIndex = firstDayOfMonth.getDay();
        const startOffset = (firstDayIndex + 6) % 7;

        // Total days in current month
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        // Total days in previous month
        const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

        const list: Array<{
            day: number;
            month: number; // 0-11
            year: number;
            isCurrentMonth: boolean;
            isToday: boolean;
            dateKey: string;
            isDisabled: boolean;
            isSelected: boolean;
            hasEnrollments: boolean;
            enrollmentCount: number;
        }> = [];

        const today = new Date();
        const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        // 1. Fill previous month's trailing days
        for (let i = startOffset - 1; i >= 0; i--) {
            const dayNum = daysInPrevMonth - i;
            const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
            const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
            const dateKey = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
            list.push({
                day: dayNum,
                month: prevMonth,
                year: prevYear,
                isCurrentMonth: false,
                isToday: dateKey === todayKey,
                dateKey,
                isDisabled: true, // Disable clicking adjacent month days to keep UX simple
                isSelected: false,
                hasEnrollments: false,
                enrollmentCount: 0,
            });
        }

        // 2. Fill current month's days
        for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
            const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
            const count = enrollmentCountsByDate[dateKey] || 0;

            // Check if date violates start/end constraints
            let isDisabled = false;
            if (limitDate) {
                const limitD = new Date(limitDate);
                const currentD = new Date(currentYear, currentMonth, dayNum, isEndDate ? 23 : 0, isEndDate ? 59 : 0);
                if (isEndDate) {
                    isDisabled = currentD < limitD; // End Date cannot be before Start Date
                } else {
                    isDisabled = currentD > limitD; // Start Date cannot be after End Date
                }
            }

            const isSelected = selectedDate
                ? selectedDate.getDate() === dayNum &&
                  selectedDate.getMonth() === currentMonth &&
                  selectedDate.getFullYear() === currentYear
                : false;

            list.push({
                day: dayNum,
                month: currentMonth,
                year: currentYear,
                isCurrentMonth: true,
                isToday: dateKey === todayKey,
                dateKey,
                isDisabled,
                isSelected,
                hasEnrollments: count > 0,
                enrollmentCount: count,
            });
        }

        // 3. Fill next month's trailing days (to make 42 grid cells total)
        const remaining = 42 - list.length;
        for (let dayNum = 1; dayNum <= remaining; dayNum++) {
            const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
            const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
            const dateKey = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
            list.push({
                day: dayNum,
                month: nextMonth,
                year: nextYear,
                isCurrentMonth: false,
                isToday: dateKey === todayKey,
                dateKey,
                isDisabled: true,
                isSelected: false,
                hasEnrollments: false,
                enrollmentCount: 0,
            });
        }

        return list;
    }, [currentYear, currentMonth, selectedDate, enrollmentCountsByDate, limitDate, isEndDate]);

    // Handle day selection
    const handleSelectDay = (dayObj: typeof calendarDays[0]) => {
        if (dayObj.isDisabled) return;
        
        // Construct standard ISO-like string YYYY-MM-DD
        const monthStr = String(dayObj.month + 1).padStart(2, '0');
        const dayStr = String(dayObj.day).padStart(2, '0');
        const timePart = isEndDate ? 'T23:59' : 'T00:00';
        
        onChange(`${dayObj.year}-${monthStr}-${dayStr}${timePart}`);
        setIsOpen(false);
    };

    const handleClear = () => {
        onChange('');
        setIsOpen(false);
    };

    const handlePrevMonth = () => {
        setViewDate(new Date(currentYear, currentMonth - 1, 1));
    };

    const handleNextMonth = () => {
        setViewDate(new Date(currentYear, currentMonth + 1, 1));
    };

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    return (
        <div ref={containerRef} className="relative inline-block w-full sm:w-auto">
            {/* Input Trigger Button */}
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                aria-label={`${label}: ${displayValue || placeholder}`}
                className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 md:py-2 bg-surface-elevated border hover:border-brand-500 dark:hover:border-brand-400 rounded-xl text-xs text-left cursor-pointer transition-all ${
                    isOpen ? 'border-brand-500 shadow-xs' : 'border-border-subtle'
                } ${value ? 'text-primary border-border-strong font-medium' : 'text-muted'}`}
            >
                <span className="flex items-center gap-1.5 min-w-0">
                    <Calendar size={13} className="text-muted shrink-0" />
                    <span className="truncate">{displayValue || placeholder}</span>
                </span>
                {/* With a date set, room for the clear button laid over the field */}
                {value ? (
                    <span aria-hidden className="w-4 shrink-0" />
                ) : (
                    <span className="text-xs uppercase font-semibold text-muted px-1">{label}</span>
                )}
            </button>
            {value && (
                <button
                    type="button"
                    onClick={handleClear}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-border-strong rounded-full transition-colors text-muted hover:text-primary"
                    title={`Clear ${label.toLowerCase()}`}
                    aria-label={`Clear ${label.toLowerCase()} date`}
                >
                    <X size={12} />
                </button>
            )}

            {/* Dropdown Popover */}
            {isOpen && createPortal(
                <div
                    ref={popRef}
                    role="dialog"
                    aria-label={`${label} date`}
                    style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? 0, width: pos?.width ?? POPOVER_WIDTH, maxHeight: pos?.maxHeight }}
                    className="z-300 overflow-y-auto overscroll-contain bg-surface border border-border-subtle rounded-2xl shadow-float p-3 select-none animate-scaleIn"
                >
                    {/* Calendar Header */}
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-primary pl-1">
                            {monthNames[currentMonth]} {currentYear}
                        </span>
                        <div className="flex items-center gap-0.5">
                            <button
                                type="button"
                                onClick={handlePrevMonth}
                                aria-label="Previous month"
                                className="p-1 hover:bg-border-strong text-muted hover:text-primary rounded-lg transition-colors"
                            >
                                <ChevronLeft size={14} />
                            </button>
                            <button
                                type="button"
                                onClick={handleNextMonth}
                                aria-label="Next month"
                                className="p-1 hover:bg-border-strong text-muted hover:text-primary rounded-lg transition-colors"
                            >
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Weekday Grid */}
                    <div className="grid grid-cols-7 gap-0.5 mb-1 text-center">
                        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((wd) => (
                            <span key={wd} className="text-xs font-bold text-muted uppercase py-0.5">
                                {wd}
                            </span>
                        ))}
                    </div>

                    {/* Calendar Days */}
                    <div className="grid grid-cols-7 gap-0.5">
                        {calendarDays.map((dayObj, index) => {
                            const isClickable = dayObj.isCurrentMonth && !dayObj.isDisabled;
                            
                            // Visual classes
                            let btnClass = 'text-xs rounded-xl relative py-1 flex flex-col items-center justify-center h-8 transition-all ';
                            
                            if (!dayObj.isCurrentMonth) {
                                btnClass += 'text-muted/20 pointer-events-none ';
                            } else if (dayObj.isDisabled) {
                                btnClass += 'text-muted/30 cursor-not-allowed ';
                            } else if (dayObj.isSelected) {
                                btnClass += 'bg-brand-500 text-white font-bold shadow-xs ';
                            } else {
                                btnClass += 'text-primary hover:bg-border-strong cursor-pointer ';
                                if (dayObj.isToday) {
                                    btnClass += 'border border-brand-500/40 font-semibold ';
                                }
                            }

                            return (
                                <button
                                    key={index}
                                    type="button"
                                    disabled={!isClickable}
                                    aria-pressed={dayObj.isSelected}
                                    onClick={() => handleSelectDay(dayObj)}
                                    className={btnClass}
                                    title={
                                        dayObj.hasEnrollments
                                            ? `${dayObj.enrollmentCount} enrollment${
                                                  dayObj.enrollmentCount > 1 ? 's' : ''
                                              } on this day`
                                            : undefined
                                    }
                                >
                                    <span>{dayObj.day}</span>
                                    
                                    {/* Enrollment indicators */}
                                    {dayObj.isCurrentMonth && dayObj.hasEnrollments && (
                                        <span
                                            className={`absolute bottom-1 w-1 h-1 rounded-full ${
                                                dayObj.isSelected ? 'bg-white' : 'bg-brand-500'
                                            }`}
                                        />
                                    )}

                                    {/* Enrollment count small bubble on hover if not selected */}
                                    {dayObj.isCurrentMonth && dayObj.hasEnrollments && !dayObj.isSelected && !dayObj.isDisabled && (
                                        <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand-500/20 dark:bg-brand-400/20 text-[8px] font-bold text-brand-600 dark:text-brand-400 scale-75 pointer-events-none">
                                            {dayObj.enrollmentCount}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
}
