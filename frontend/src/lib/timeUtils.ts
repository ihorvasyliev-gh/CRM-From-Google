// ─── Times of day ("HH:MM", 24-hour) ───────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * A typed time → "HH:MM", or null when it isn't one. Accepts what people type in a hurry:
 * "9", "930", "0930", "9:30", "9.30", "9h30", "14", "1400", "9am", "2:30 pm".
 */
export function parseTimeText(raw: string): string | null {
    const text = raw.trim().toLowerCase().replace(/\s+/g, '');
    const m = /^(\d{1,2})(?:[:.h]?(\d{2}))?(am|pm|a|p)?$/.exec(text);
    if (!m) return null;
    let hours = Number(m[1]);
    const minutes = m[2] ? Number(m[2]) : 0;
    const half = m[3]?.[0];
    if (minutes > 59) return null;
    if (half) {
        if (hours < 1 || hours > 12) return null;
        if (half === 'p' && hours !== 12) hours += 12;
        if (half === 'a' && hours === 12) hours = 0;
    }
    if (hours > 23) return null;
    return `${pad(hours)}:${pad(minutes)}`;
}

/** Minutes since midnight of "HH:MM". */
export function minutesOf(time: string): number {
    return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/** "HH:MM" of minutes since midnight. */
export function timeOf(minutes: number): string {
    return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
}

/** Every `step` minutes of the day: "00:00", "00:15", … "23:45". */
export function timeSlots(step = 15): string[] {
    return Array.from({ length: Math.ceil((24 * 60) / step) }, (_, i) => timeOf(i * step));
}

/** "30 min", "1 h", "1 h 30 min". */
export function formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} min`;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
