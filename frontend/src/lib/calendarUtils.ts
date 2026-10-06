/**
 * Calendar utilities for CCP CRM
 * Generates Google Calendar links and downloadable .ics files (Apple Calendar / Outlook)
 */

export interface CalendarEventParams {
    courseName: string;
    courseDate: string; // YYYY-MM-DD
    startTime?: string; // HH:mm (default: '09:30')
    endTime?: string;   // HH:mm (default: '16:30')
    location?: string;
    description?: string;
    organizerEmail?: string;
    /** Added to the event title, e.g. "Day 2 of 4" */
    titleSuffix?: string;
    /** Every day of a multi-day course (the .ics file gets one event per day) */
    days?: CalendarDay[];
}

export interface CalendarDay {
    date: string;       // YYYY-MM-DD
    startTime?: string; // HH:mm (default: the course's start time)
    endTime?: string;   // HH:mm (default: the course's end time)
}

const DEFAULT_ORGANIZER_EMAIL = 'ivasyliev@partnershipcork.ie';
const DEFAULT_LOCATION = 'Cork City Partnership, Cork, Ireland';

function formatDatesForGoogle(dateStr: string, startTime = '09:30', endTime = '16:30'): { start: string; end: string } {
    const cleanDate = dateStr.replace(/[-:]/g, '').split('T')[0];
    const cleanStart = startTime.replace(':', '') + '00';
    const cleanEnd = endTime.replace(':', '') + '00';
    return {
        start: `${cleanDate}T${cleanStart}`,
        end: `${cleanDate}T${cleanEnd}`,
    };
}

function formatDatesForIcs(dateStr: string, startTime = '09:30', endTime = '16:30'): { start: string; end: string } {
    const cleanDate = dateStr.replace(/[-:]/g, '').split('T')[0];
    const cleanStart = startTime.replace(':', '') + '00';
    const cleanEnd = endTime.replace(':', '') + '00';
    return {
        start: `${cleanDate}T${cleanStart}`,
        end: `${cleanDate}T${cleanEnd}`,
    };
}

/**
 * Builds a direct URL to create an event in Google Calendar.
 */
export function getGoogleCalendarUrl(params: CalendarEventParams): string {
    const { courseName, courseDate, location = DEFAULT_LOCATION, organizerEmail = DEFAULT_ORGANIZER_EMAIL } = params;
    const { start, end } = formatDatesForGoogle(courseDate, params.startTime, params.endTime);
    
    const details = params.description || 
        `Attendance confirmed for ${courseName} with Cork City Partnership.\n\nQuestions or issues? Contact ${organizerEmail}`;

    const url = new URL('https://calendar.google.com/calendar/render');
    url.searchParams.set('action', 'TEMPLATE');
    url.searchParams.set('text', `Course: ${courseName}${params.titleSuffix ? ` (${params.titleSuffix})` : ''}`);
    url.searchParams.set('dates', `${start}/${end}`);
    url.searchParams.set('details', details);
    url.searchParams.set('location', location);

    return url.toString();
}

/** Text value escaped for an .ics file (RFC 5545). */
function icsText(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** .ics calendar text: one event, or one per day of a multi-day course. */
export function buildIcsContent(params: CalendarEventParams): string {
    const { courseName, courseDate, location = DEFAULT_LOCATION, organizerEmail = DEFAULT_ORGANIZER_EMAIL } = params;
    const nowStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const description = params.description ||
        `Attendance confirmed for ${courseName} with Cork City Partnership. Questions: ${organizerEmail}`;
    const days: CalendarDay[] = params.days && params.days.length > 0 ? params.days : [{ date: courseDate }];
    const batch = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const events = days.flatMap((day, i) => {
        const { start, end } = formatDatesForIcs(day.date, day.startTime || params.startTime, day.endTime || params.endTime);
        const suffix = days.length > 1 ? ` (Day ${i + 1} of ${days.length})` : params.titleSuffix ? ` (${params.titleSuffix})` : '';
        return [
            'BEGIN:VEVENT',
            `UID:course-${batch}-${i + 1}@partnershipcork.ie`,
            `DTSTAMP:${nowStamp}`,
            `DTSTART:${start}`,
            `DTEND:${end}`,
            `SUMMARY:${icsText(`Course: ${courseName}${suffix}`)}`,
            `DESCRIPTION:${icsText(description)}`,
            `LOCATION:${icsText(location)}`,
            'STATUS:CONFIRMED',
            `ORGANIZER;CN="Cork City Partnership":mailto:${organizerEmail}`,
            'END:VEVENT',
        ];
    });

    // RFC 5545 format
    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Cork City Partnership//CCP CRM//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        ...events,
        'END:VCALENDAR',
    ].join('\r\n');
}

/**
 * Generates and triggers download of an .ics file for Apple Calendar, Outlook, and mobile calendars.
 */
export function downloadIcsFile(params: CalendarEventParams): void {
    const { courseName } = params;
    const icsContent = buildIcsContent(params);

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `${courseName.replace(/[^a-zA-Z0-9_-]/g, '_')}_Invitation.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(link.href);
}
