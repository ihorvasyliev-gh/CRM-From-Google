/**
 * Calendar utilities for Course CRM
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
    url.searchParams.set('text', `Course: ${courseName}`);
    url.searchParams.set('dates', `${start}/${end}`);
    url.searchParams.set('details', details);
    url.searchParams.set('location', location);

    return url.toString();
}

/**
 * Generates and triggers download of an .ics file for Apple Calendar, Outlook, and mobile calendars.
 */
export function downloadIcsFile(params: CalendarEventParams): void {
    const { courseName, courseDate, location = DEFAULT_LOCATION, organizerEmail = DEFAULT_ORGANIZER_EMAIL } = params;
    const { start, end } = formatDatesForIcs(courseDate, params.startTime, params.endTime);
    
    const nowStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const uid = `course-${Date.now()}-${Math.random().toString(36).substring(2, 9)}@partnershipcork.ie`;
    
    const description = params.description || 
        `Attendance confirmed for ${courseName} with Cork City Partnership. Questions: ${organizerEmail}`;

    // RFC 5545 format
    const icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Cork City Partnership//Course CRM//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${nowStamp}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:Course: ${courseName}`,
        `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
        `LOCATION:${location.replace(/,/g, '\\,')}`,
        'STATUS:CONFIRMED',
        `ORGANIZER;CN="Cork City Partnership":mailto:${organizerEmail}`,
        'END:VEVENT',
        'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `${courseName.replace(/[^a-zA-Z0-9_-]/g, '_')}_Invitation.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(link.href);
}
