import { Calendar, CheckCircle, Download, ExternalLink } from 'lucide-react';
import { downloadIcsFile, getGoogleCalendarUrl, type CalendarEventParams } from '../../lib/calendarUtils';
import { dayTime, sessionDays, type CourseSession } from '../../lib/courseSessions';
import { ContactFooter, PublicMessage } from '../PublicPage';
import { courseDateLine, formatCourseDate } from './confirmationDateUtils';
import { SessionDetails } from './ConfirmationViews';

const calendarButtonCls =
    'flex items-center justify-center gap-2 py-3 px-3.5 rounded-xl border border-border-strong bg-surface hover:bg-surface-elevated ' +
    'text-primary text-sm font-semibold transition-colors active:scale-[0.98] touch-manipulation text-center';

export interface ConfirmedSuccessViewProps {
    courseName: string;
    courseDate: string;
    sessions: Record<string, CourseSession>;
    resultMessage: string;
}

export function ConfirmedSuccessView({
    courseName,
    courseDate,
    sessions,
    resultMessage,
}: ConfirmedSuccessViewProps) {
    // The confirmed date's schedule for the calendar buttons (one event per course day)
    const confirmedSession = courseDate ? sessions[courseDate] : undefined;
    const calendarDays = confirmedSession
        ? sessionDays(confirmedSession).map(d => {
            const t = dayTime(confirmedSession, d);
            return { date: d.date, startTime: t.start ?? undefined, endTime: t.end ?? undefined };
        })
        : [];
    const calendarParams: CalendarEventParams = {
        courseName,
        courseDate,
        startTime: confirmedSession?.start_time ?? undefined,
        endTime: confirmedSession?.end_time ?? undefined,
        location: confirmedSession?.location ?? undefined,
        days: calendarDays.length > 1 ? calendarDays : undefined,
    };

    return (
        <PublicMessage icon={CheckCircle} tone="success" title="You're All Set!">
            <p className="text-muted text-sm leading-relaxed max-w-xs -mt-1">
                {resultMessage || 'Your attendance has been confirmed! We look forward to seeing you at the course.'}
            </p>

            {/* Ticket */}
            <div className="w-full p-4 bg-surface-elevated/50 rounded-xl border border-border-subtle text-left space-y-2">
                <p className="text-xs font-semibold text-status-confirmed uppercase tracking-wider">Your place</p>
                <p className="text-base font-bold text-primary wrap-break-word">{courseName}</p>
                {courseDate && (
                    <p className="flex items-center gap-2 text-sm text-primary font-medium pt-2 border-t border-border-subtle">
                        <Calendar size={15} className="text-brand-600 dark:text-brand-400 shrink-0" aria-hidden="true" />
                        <span>{courseDateLine(courseDate, confirmedSession)}</span>
                    </p>
                )}
                {courseDate && confirmedSession && <SessionDetails session={confirmedSession} />}
            </div>

            {/* ─── Add to Calendar ─── */}
            {courseDate && (
                <div className="w-full text-left space-y-2.5">
                    <h2 className="text-sm font-bold text-primary">Add to your calendar</h2>
                    <p className="text-sm text-muted leading-normal -mt-1">
                        {calendarDays.length > 1 ? 'Save all course days' : 'Save the course date'} so you don't miss {calendarDays.length > 1 ? 'any of them' : 'it'}.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {calendarDays.length <= 1 && (
                            <a
                                href={getGoogleCalendarUrl(calendarParams)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={calendarButtonCls}
                            >
                                <ExternalLink size={15} className="text-brand-600 dark:text-brand-400 shrink-0" aria-hidden="true" />
                                <span>Google Calendar</span>
                            </a>
                        )}
                        <button
                            type="button"
                            onClick={() => downloadIcsFile(calendarParams)}
                            className={`${calendarButtonCls} ${calendarDays.length > 1 ? 'sm:col-span-2' : ''}`}
                        >
                            <Download size={15} className="text-status-confirmed shrink-0" aria-hidden="true" />
                            <span>Apple / Outlook (.ics){calendarDays.length > 1 ? ` — all ${calendarDays.length} days` : ''}</span>
                        </button>
                    </div>
                    {calendarDays.length > 1 && (
                        <div className="space-y-1.5">
                            <p className="text-sm text-muted">Google Calendar: add each day</p>
                            <div className="grid grid-cols-2 gap-2">
                                {calendarDays.map((d, i) => (
                                    <a
                                        key={d.date}
                                        href={getGoogleCalendarUrl({
                                            ...calendarParams,
                                            courseDate: d.date,
                                            startTime: d.startTime,
                                            endTime: d.endTime,
                                            titleSuffix: `Day ${i + 1} of ${calendarDays.length}`,
                                        })}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`${calendarButtonCls} min-h-11 py-2 text-xs`}
                                    >
                                        <ExternalLink size={12} className="text-brand-600 dark:text-brand-400 shrink-0" aria-hidden="true" />
                                        <span>Day {i + 1} · {formatCourseDate(d.date).replace(/ \d{4}$/, '')}</span>
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <ContactFooter prompt="Need to change plans or have any questions?" subject={`Confirmed course question - ${courseName}`} />
        </PublicMessage>
    );
}
