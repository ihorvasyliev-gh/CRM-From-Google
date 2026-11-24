import type { FormEvent } from 'react';
import {
    AlertCircle,
    ArrowLeft,
    Calendar,
    CalendarX,
    Check,
    Clock,
    Copy,
    ExternalLink,
    Link2Off,
    Loader2,
    Mail,
    MapPin,
    RefreshCw,
    Star,
    Users,
} from 'lucide-react';
import {
    dayTime,
    formatTimeRange,
    hasDayOverrides,
    sessionDays,
    weeklySummary,
    type CourseSession,
} from '../../lib/courseSessions';
import { placeHref } from '../../lib/maps';
import {
    ContactFooter,
    ORGANIZER_EMAIL,
    PublicAlert,
    PublicCardHeader,
    PublicEmailField,
    PublicMessage,
    primaryButtonCls,
    secondaryButtonCls,
} from '../PublicPage';

import { formatCourseDate, type CapacityInfo } from './confirmationDateUtils';

/** Next to a "Could not connect" message */
export function RetryButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="hit-area shrink-0 text-sm font-semibold underline underline-offset-2 touch-manipulation"
        >
            Try again
        </button>
    );
}

export function CapacityMeter({ capacity }: { capacity: CapacityInfo }) {
    const { max, confirmed, isFull } = capacity;
    const taken = Math.min(confirmed, max);
    const left = Math.max(max - confirmed, 0);
    const pct = Math.round((taken / max) * 100);
    // Nudge people to act fast once the course is mostly booked
    const almostFull = !isFull && (left <= 3 || pct >= 75);

    const barColor = isFull ? 'bg-danger' : almostFull ? 'bg-warning' : 'bg-success';
    const statusText = isFull
        ? 'No places left'
        : `${left} ${left === 1 ? 'place' : 'places'} left`;
    const statusColor = isFull ? 'text-status-rejected' : almostFull ? 'text-status-requested' : 'text-status-confirmed';

    return (
        <div className="mt-4" data-testid="capacity-meter">
            <div className="flex items-center justify-between gap-2 text-sm mb-1.5">
                <span className="flex items-center gap-1.5 text-muted">
                    <Users size={14} className="text-brand-600 dark:text-brand-400 shrink-0" aria-hidden="true" />
                    <span><strong className="text-primary">{taken}</strong> of <strong className="text-primary">{max}</strong> places confirmed</span>
                </span>
                <span className={`font-semibold ${statusColor}`}>{statusText}</span>
            </div>
            <div
                className="h-2 w-full rounded-full bg-surface-elevated overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={max}
                aria-valuenow={taken}
                aria-label="Confirmed places"
            >
                <div className={`h-full rounded-full ${barColor} transition-all duration-700`} style={{ width: `${pct}%` }} />
            </div>
            {almostFull && (
                <p className="text-sm font-medium text-status-requested mt-1.5">
                    Places are filling up fast. Confirm now to secure yours.
                </p>
            )}
        </div>
    );
}

/** The course's place, with a link to find it (Google Maps, or the place's own link) */
export function PlaceLine({ place }: { place: string }) {
    const href = placeHref(place);
    const isMap = href?.startsWith('https://www.google.com/maps/');
    return (
        <p className="flex items-start gap-1.5 text-primary">
            <MapPin size={14} className="text-brand-600 dark:text-brand-400 shrink-0 mt-0.5" aria-hidden="true" />
            <span className="min-w-0">
                <span className="wrap-break-word">{place}</span>
                {href && (
                    <>
                        {' '}
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={isMap ? `Directions to ${place} (opens Google Maps)` : 'Open link (opens in a new tab)'}
                            className="hit-area inline-flex items-center gap-1 ml-0.5 whitespace-nowrap font-semibold text-brand-700 dark:text-brand-300 hover:text-brand-800 dark:hover:text-brand-200 underline underline-offset-2"
                        >
                            {isMap ? 'Directions' : 'Open link'}
                            <ExternalLink size={12} aria-hidden="true" />
                        </a>
                    </>
                )}
            </span>
        </p>
    );
}

/** Days, time and place of a course date (Day 1 highlighted; long weekly courses summed up). */
export function SessionDetails({ session, showPlace = true }: { session: CourseSession; showPlace?: boolean }) {
    const days = sessionDays(session);
    const multiDay = days.length > 1;
    const weekly = weeklySummary(session);
    const ownTimes = multiDay && hasDayOverrides(session);
    const time = ownTimes ? '' : formatTimeRange(session.start_time, session.end_time);
    const shortDate = (d: string) => formatCourseDate(d).replace(/ \d{4}$/, '');

    return (
        <div className="mt-2 space-y-1.5 text-sm" data-testid="session-details">
            {multiDay && (weekly ? (
                <p className="text-primary">
                    <span className="font-semibold">Every {weekly.weekday} for {weekly.weeks} weeks</span>
                    {' '}· {shortDate(weekly.first)} – {formatCourseDate(weekly.last)}
                </p>
            ) : (
                <ol className="space-y-0.5">
                    {days.map((d, i) => (
                        <li key={d.date} className="flex items-baseline gap-2">
                            <span className="w-11 shrink-0 text-xs font-bold text-muted uppercase tracking-wider">Day {i + 1}</span>
                            <span className={i === 0 ? 'font-semibold text-primary' : 'text-primary'}>{formatCourseDate(d.date)}</span>
                            {ownTimes && <span className="text-xs text-muted tabular-nums">{formatTimeRange(dayTime(session, d).start, dayTime(session, d).end)}</span>}
                        </li>
                    ))}
                </ol>
            ))}
            {time && (
                <p className="flex items-center gap-1.5 text-primary">
                    <Clock size={14} className="text-brand-600 dark:text-brand-400 shrink-0" aria-hidden="true" />
                    <span className="tabular-nums">{time}</span>
                </p>
            )}
            {showPlace && session.location && <PlaceLine place={session.location} />}
            {multiDay && (
                <p className="text-sm font-semibold text-status-requested">Attendance on all {days.length} days is required.</p>
            )}
        </div>
    );
}

/** One of the ready-to-send emails on "Can't make it?" */
function MailOption({ href, icon: Icon, title, hint }: { href: string; icon: typeof Mail; title: string; hint: string }) {
    return (
        <a
            href={href}
            className="flex items-start gap-3.5 p-4 rounded-xl border-2 border-border-strong bg-surface hover:border-brand-500/50 transition-colors touch-manipulation active:scale-[0.99]"
        >
            <span className="p-2.5 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 shrink-0" aria-hidden="true">
                <Icon size={18} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                    <span className="text-sm font-bold text-primary">{title}</span>
                    <Mail size={14} className="text-muted shrink-0 mt-0.5" aria-hidden="true" />
                </span>
                <span className="block text-sm text-muted mt-1 leading-snug">{hint}</span>
            </span>
        </a>
    );
}

export function LoadingView() {
    return (
        <div className="p-6 sm:p-8 space-y-6" aria-busy="true">
            <div className="flex items-center gap-3 animate-pulse" aria-hidden="true">
                <div className="w-11 h-11 bg-surface-elevated rounded-xl" />
                <div className="space-y-2 flex-1">
                    <div className="h-3 w-28 bg-surface-elevated rounded-sm" />
                    <div className="h-5 w-48 bg-border-strong/60 rounded-sm" />
                </div>
            </div>
            <div className="space-y-3 pt-2 animate-pulse" aria-hidden="true">
                <div className="h-3 w-32 bg-surface-elevated rounded-sm" />
                <div className="h-12 w-full bg-surface-elevated/70 rounded-xl border border-border-subtle" />
            </div>
            <div role="status" className="h-13 w-full bg-success/10 rounded-xl flex items-center justify-center gap-2 text-status-confirmed">
                <Loader2 size={20} className="animate-spin" aria-hidden="true" />
                <span className="text-sm font-medium">Loading course invitation...</span>
            </div>
        </div>
    );
}

export function ErrorView({ onRetry }: { onRetry: () => void }) {
    return (
        <PublicMessage icon={AlertCircle} tone="warning" title="Connection problem">
            <p className="text-muted text-sm leading-relaxed max-w-xs -mt-1">
                We couldn't load the course details. Please check your internet connection and try again.
            </p>
            <div className="w-full flex flex-col gap-2.5 mt-1">
                <button type="button" onClick={onRetry} className={primaryButtonCls}>
                    <RefreshCw size={18} aria-hidden="true" /> Try again
                </button>
                <button type="button" onClick={() => window.location.reload()} className={secondaryButtonCls}>
                    Reload page
                </button>
            </div>
            <ContactFooter prompt="Still not working?" subject="Course confirmation page not loading" />
        </PublicMessage>
    );
}

export function InvalidLinkView() {
    return (
        <PublicMessage icon={Link2Off} tone="danger" title="This link has expired">
            <p className="text-muted text-sm leading-relaxed max-w-xs -mt-1">
                This confirmation link is no longer valid. Ask the organizer and they'll send you a new invitation.
            </p>
            <a
                href={`mailto:${ORGANIZER_EMAIL}?subject=${encodeURIComponent('Expired confirmation link')}`}
                className={`${secondaryButtonCls} mt-1`}
            >
                <Mail size={16} aria-hidden="true" /> Ask for a new invitation
            </a>
            <p className="text-xs text-muted">{ORGANIZER_EMAIL}</p>
        </PublicMessage>
    );
}

export interface FullyBookedViewProps {
    courseName: string;
    courseDate: string;
    courseDates: string[];
    isMultiDate: boolean;
    capacity: CapacityInfo | null;
    email: string;
    emailError?: string;
    inlineError: string;
    retryable: boolean;
    isSubmitting: boolean;
    priorityMailtoUrl: string;
    onEmailChange: (value: string) => void;
    onCheckPlace: (e?: FormEvent) => void;
}

export function FullyBookedView({
    courseName,
    courseDate,
    courseDates,
    isMultiDate,
    capacity,
    email,
    emailError,
    inlineError,
    retryable,
    isSubmitting,
    priorityMailtoUrl,
    onEmailChange,
    onCheckPlace,
}: FullyBookedViewProps) {
    return (
        <div className="flex flex-col animate-fadeIn">
            <PublicCardHeader
                icon={Users}
                eyebrow="Fully booked"
                tone="danger"
                title={courseName}
                below={!isMultiDate && capacity && <CapacityMeter capacity={capacity} />}
            >
                <div className="space-y-1 mt-1.5">
                    {(isMultiDate ? courseDates : courseDate ? [courseDate] : []).map(d => (
                        <p key={d} className="flex items-center gap-1.5 text-sm text-primary font-medium">
                            <Calendar size={14} className="text-brand-600 dark:text-brand-400 shrink-0" aria-hidden="true" />
                            <span>{formatCourseDate(d)}</span>
                        </p>
                    ))}
                </div>
            </PublicCardHeader>

            <div className="p-5 sm:p-6 space-y-5">
                <div>
                    <h2 className="text-base font-bold text-primary">
                        {isMultiDate ? 'All places for these dates have been taken' : 'All places for this date have been taken'}
                    </h2>
                    <p className="text-sm text-muted mt-1.5 leading-relaxed">
                        {isMultiDate ? 'Sorry, all offered dates are now full' : 'Sorry, this course date is now full'}, so confirmations are closed.
                    </p>
                </div>

                {/* People already in the group (confirmed earlier or added by the organizer) see their place here */}
                <form onSubmit={onCheckPlace} noValidate className="p-4 rounded-xl bg-surface-elevated/50 border border-border-subtle space-y-3">
                    <div>
                        <h2 className="text-sm font-bold text-primary">Already have a place?</h2>
                        <p className="text-sm text-muted mt-0.5 leading-relaxed">
                            If you confirmed earlier or the organizer added you to the group, enter your email to see your place.
                        </p>
                    </div>
                    <PublicEmailField
                        id="check-email"
                        label="Your email"
                        value={email}
                        disabled={isSubmitting}
                        onChange={onEmailChange}
                        error={emailError}
                    />
                    {inlineError && <PublicAlert action={retryable && <RetryButton onClick={() => onCheckPlace()} />}>{inlineError}</PublicAlert>}
                    <button type="submit" disabled={isSubmitting} className={secondaryButtonCls}>
                        {isSubmitting && <Loader2 size={16} className="animate-spin shrink-0" aria-hidden="true" />}
                        <span>Check my place</span>
                    </button>
                </form>

                <div className="space-y-2.5">
                    <p className="text-sm text-muted leading-relaxed">
                        No place yet? If you're still interested, email the organizer and you'll get <strong className="text-primary">priority for the next course</strong>.
                    </p>
                    <a
                        href={priorityMailtoUrl}
                        className="w-full flex items-center justify-center gap-2 bg-brand-700 hover:bg-brand-800 active:scale-[0.98] text-white font-bold text-base py-3.5 px-6 rounded-xl shadow-md shadow-brand-700/20 transition-all touch-manipulation"
                    >
                        <Star size={18} className="shrink-0" aria-hidden="true" />
                        <span>Get priority for the next course</span>
                    </a>
                    <p className="text-xs text-muted leading-normal text-center">
                        Opens an email to {ORGANIZER_EMAIL}, ready to send.
                    </p>
                </div>

                <ContactFooter prompt="Questions or difficulties?" subject={`Question about ${courseName}`} />
            </div>
        </div>
    );
}

export interface DeclineViewProps {
    courseName: string;
    isMultiDate: boolean;
    invitationDatesLabel: string;
    rescheduleMailtoUrl: string;
    withdrawMailtoUrl: string;
    copiedCoordinatorEmail: boolean;
    onCopyCoordinatorEmail: () => void;
    onBack: () => void;
}

export function DeclineView({
    courseName,
    isMultiDate,
    invitationDatesLabel,
    rescheduleMailtoUrl,
    withdrawMailtoUrl,
    copiedCoordinatorEmail,
    onCopyCoordinatorEmail,
    onBack,
}: DeclineViewProps) {
    return (
        <div className="flex flex-col animate-fadeIn">
            <PublicCardHeader
                icon={CalendarX}
                tone="warning"
                title={isMultiDate ? 'None of these dates work?' : "Can't make it?"}
            >
                <p className="text-sm text-primary font-medium mt-1 wrap-break-word">{courseName}</p>
                <p className="text-sm text-muted">{invitationDatesLabel}</p>
            </PublicCardHeader>

            <div className="p-5 sm:p-6 space-y-4">
                <p className="text-sm text-muted leading-relaxed">
                    Let the organizer know by email. Please send it from the address that received the invitation, so we know it's really you.
                </p>

                <div className="space-y-2.5">
                    <MailOption
                        href={rescheduleMailtoUrl}
                        icon={Calendar}
                        title="Keep me on the waiting list for future dates"
                        hint="We'll invite you again when there's a new date."
                    />
                    <MailOption
                        href={withdrawMailtoUrl}
                        icon={CalendarX}
                        title="I'm no longer interested in this course"
                        hint="We'll take you off the list for this course."
                    />
                </div>

                <div className="pt-3.5 border-t border-border-subtle space-y-2">
                    <p className="text-sm text-muted">
                        Each option opens a ready-to-send email. No email app on this device? Write to us from your usual email instead.
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm text-muted">
                            Email: <span className="text-primary font-medium">{ORGANIZER_EMAIL}</span>
                        </p>
                        <button
                            type="button"
                            onClick={onCopyCoordinatorEmail}
                            className="hit-area inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-primary bg-surface-elevated hover:bg-border-strong/60 rounded-lg transition-colors active:scale-95 touch-manipulation cursor-pointer"
                        >
                            {copiedCoordinatorEmail ? (
                                <>
                                    <Check size={14} className="text-status-confirmed" aria-hidden="true" />
                                    <span className="text-status-confirmed">Copied!</span>
                                </>
                            ) : (
                                <>
                                    <Copy size={14} className="text-muted" aria-hidden="true" />
                                    <span>Copy address</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                <button type="button" onClick={onBack} className={secondaryButtonCls}>
                    <ArrowLeft size={15} aria-hidden="true" /> Back to confirmation
                </button>
            </div>
        </div>
    );
}
