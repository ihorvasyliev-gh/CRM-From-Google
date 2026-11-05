// ─── Certificates: what was typed last time, kept in this browser only ───
// The tutor (and any other text typed once for everyone) is offered again next time. Nothing
// leaves the browser; a private window or blocked storage simply starts empty.

const KEY = 'certificates.recent.v1';
const MAX = 6;

type Recent = Record<string, string[]>;

function read(): Recent {
    try {
        const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Recent : {};
    } catch {
        return {};
    }
}

/** The values typed for a field before, the last one first */
export function recentValues(tag: string): string[] {
    const list = read()[tag];
    return Array.isArray(list) ? list.filter(v => typeof v === 'string' && v.trim()) : [];
}

/** Keeps the values just used, each first in its field's list */
export function rememberValues(values: Record<string, string>): void {
    const recent = read();
    for (const [tag, raw] of Object.entries(values)) {
        const value = raw.trim();
        if (!value) continue;
        const list = (recent[tag] ?? []).filter(v => v.toLowerCase() !== value.toLowerCase());
        recent[tag] = [value, ...list].slice(0, MAX);
    }
    try {
        localStorage.setItem(KEY, JSON.stringify(recent));
    } catch {
        // Storage full or blocked: next time just starts empty
    }
}
