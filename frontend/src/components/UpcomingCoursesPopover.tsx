import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { ViewerUpcomingCourse } from '../lib/types';
import { formatDateDMY } from '../lib/dateUtils';
import { Calendar, ChevronDown, ChevronRight, Users, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

interface UpcomingCoursesPopoverProps {
    onSelectCourse?: (courseId: string, courseDate?: string) => void;
}

export default function UpcomingCoursesPopover({ onSelectCourse }: UpcomingCoursesPopoverProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Fetch upcoming courses via Supabase RPC
    const { data: upcomingCourses = [], isLoading } = useQuery<ViewerUpcomingCourse[]>({
        queryKey: ['viewer_upcoming_courses'],
        queryFn: async () => {
            const { data, error } = await supabase.rpc('get_viewer_upcoming_courses');
            if (error) throw error;
            return (data || []).map((row: any) => ({
                course_id: row.course_id,
                course_name: row.course_name,
                course_date: row.course_date,
                confirmed_count: Number(row.confirmed_count || 0),
                pending_count: Number(row.pending_count || 0),
                total_active_count: Number(row.total_active_count || 0),
            }));
        },
        refetchInterval: 30000, // keep freshly synced
    });

    // Close on click outside or Esc key
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        }

        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        }

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    // Aggregate totals across all upcoming courses
    const { totalConfirmed, totalPending } = useMemo(() => {
        let confirmed = 0;
        let pending = 0;
        for (const item of upcomingCourses) {
            confirmed += item.confirmed_count;
            pending += item.pending_count;
        }
        return { totalConfirmed: confirmed, totalPending: pending };
    }, [upcomingCourses]);

    const handleSelect = (courseId: string, courseDate: string) => {
        setIsOpen(false);
        if (onSelectCourse) {
            onSelectCourse(courseId, courseDate);
        }
    };

    return (
        <div className="relative" ref={containerRef}>
            {/* Header Trigger Button */}
            <button
                type="button"
                onClick={() => setIsOpen(prev => !prev)}
                aria-expanded={isOpen}
                aria-label="Upcoming Courses"
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border shadow-xs group ${
                    isOpen
                        ? 'bg-brand-500/10 border-brand-500/40 text-brand-600 dark:text-brand-400 ring-2 ring-brand-500/20'
                        : 'bg-surface-elevated hover:bg-surface border-border-subtle hover:border-brand-500/40 text-primary'
                }`}
                title="View upcoming scheduled courses"
            >
                <Calendar size={14} className="text-brand-500 flex-shrink-0" />
                <span className="hidden md:inline font-medium">Upcoming Courses</span>
                <span className="md:hidden font-medium">Upcoming</span>
                
                {/* Badge showing count of upcoming sessions */}
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-brand-500 text-white min-w-[18px]">
                    {upcomingCourses.length}
                </span>

                <ChevronDown
                    size={13}
                    className={`text-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>

            {/* Dropdown Popover */}
            {isOpen && (
                <div className="absolute right-0 sm:right-auto sm:left-0 mt-2 w-80 sm:w-96 bg-surface-elevated border border-border-subtle rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                    {/* Header Summary */}
                    <div className="px-4 py-3 bg-surface border-b border-border-subtle flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Calendar size={15} className="text-brand-500" />
                            <h3 className="text-xs font-bold text-primary tracking-tight">Upcoming Courses</h3>
                        </div>
                        <div className="flex items-center gap-2 text-[11px]">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                                <CheckCircle2 size={11} /> {totalConfirmed} confirmed
                            </span>
                            {totalPending > 0 && (
                                <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold"
                                    title="Students invited with active response timer (timer not expired)"
                                >
                                    <Clock size={11} /> {totalPending} pending
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Content List */}
                    <div className="max-h-80 overflow-y-auto divide-y divide-border-subtle/50">
                        {isLoading ? (
                            <div className="p-6 text-center text-xs text-muted">
                                Loading upcoming courses...
                            </div>
                        ) : upcomingCourses.length === 0 ? (
                            <div className="p-6 text-center">
                                <AlertCircle size={24} className="mx-auto text-muted/60 mb-2" />
                                <p className="text-xs font-semibold text-primary">No upcoming courses</p>
                                <p className="text-[11px] text-muted mt-0.5">There are no future course dates scheduled.</p>
                            </div>
                        ) : (
                            upcomingCourses.map((item) => {
                                const formattedDate = formatDateDMY(item.course_date);

                                return (
                                    <button
                                        key={`${item.course_id}-${item.course_date}`}
                                        type="button"
                                        onClick={() => handleSelect(item.course_id, item.course_date)}
                                        className="w-full text-left p-3 hover:bg-surface transition-colors flex items-center justify-between group"
                                    >
                                        <div className="min-w-0 pr-3">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-bold text-primary truncate group-hover:text-brand-500 transition-colors">
                                                    {item.course_name}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-1 text-[11px] text-muted">
                                                <span className="flex items-center gap-1 font-mono text-[11px] font-semibold text-secondary">
                                                    <Calendar size={11} className="text-muted" />
                                                    {formattedDate}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Badges for confirmed & pending */}
                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                            <span
                                                className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20"
                                                title="Confirmed participants"
                                            >
                                                {item.confirmed_count} confirmed
                                            </span>
                                            {item.pending_count > 0 && (
                                                <span
                                                    className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20"
                                                    title="Pending participants (active timer)"
                                                >
                                                    {item.pending_count} pending
                                                </span>
                                            )}
                                            <ChevronRight
                                                size={14}
                                                className="text-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all ml-1"
                                            />
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>

                    {/* Footer Tip */}
                    <div className="px-4 py-2 bg-surface/50 border-t border-border-subtle text-[10px] text-muted flex items-center justify-between">
                        <span>Click any course to open its roster</span>
                        <span className="font-semibold text-muted/70">Viewer Portal</span>
                    </div>
                </div>
            )}
        </div>
    );
}
