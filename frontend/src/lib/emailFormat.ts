// ─── Email formatting helpers ───────────────────────────────────
// The rich-text editor stores semantic HTML (<p>, <ul>, <table>, styled <span>s) and keeps any
// inline styles already on paragraphs and lists, so existing templates send exactly as before.
// Email clients ignore <style> blocks: elements the old editor couldn't make (headings, tables,
// quotes, dividers) get their look inlined here when the email is built.

/** Base text style of every email (Settings → Email text style). */
export interface EmailTextStyle {
    /** CSS font stack (one of EMAIL_FONTS) */
    fontFamily: string;
    /** px */
    fontSize: number;
    /** Hex colour of normal text */
    textColor: string;
    /** Unitless multiplier, e.g. 1.5 */
    lineHeight: number;
}

/** Fonts every mail client has (Outlook, Gmail, Apple Mail) — web fonts would silently fall back. */
/** Font stack the default templates and the email cards were written with. */
export const BASE_EMAIL_FONT = "Arial,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

export const EMAIL_FONTS: { label: string; value: string }[] = [
    { label: 'Arial', value: "Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif" },
    { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
    { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
    { label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
    { label: 'Trebuchet MS', value: "'Trebuchet MS', Helvetica, sans-serif" },
    { label: 'Segoe UI', value: "'Segoe UI', Tahoma, Arial, sans-serif" },
    { label: 'Calibri', value: "Calibri, Carlito, 'Segoe UI', Arial, sans-serif" },
    { label: 'Georgia', value: "Georgia, 'Times New Roman', serif" },
    { label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
    { label: 'Palatino', value: "'Palatino Linotype', 'Book Antiqua', Palatino, serif" },
    { label: 'Garamond', value: 'Garamond, Georgia, serif' },
    { label: 'Courier New', value: "'Courier New', Courier, monospace" },
];

export const EMAIL_FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 28, 32, 36, 48];
export const EMAIL_LINE_HEIGHTS = [1, 1.15, 1.3, 1.5, 1.75, 2, 2.5];

/** The look emails have always had: Arial 15px, 23px lines, slate text. */
export const DEFAULT_EMAIL_STYLE: EmailTextStyle = {
    fontFamily: EMAIL_FONTS[0].value,
    fontSize: 15,
    textColor: '#1e293b',
    lineHeight: 1.5,
};

/** Merge a saved (possibly partial or stale) style over the defaults, dropping invalid values. */
export function normalizeEmailStyle(saved?: Partial<EmailTextStyle> | null): EmailTextStyle {
    const s = saved || {};
    const num = (v: unknown, min: number, max: number, fallback: number) =>
        typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fallback;
    return {
        // Double quotes would end the style="" attribute the font is inlined into
        fontFamily: typeof s.fontFamily === 'string' && s.fontFamily.trim() ? s.fontFamily.replace(/"/g, "'") : DEFAULT_EMAIL_STYLE.fontFamily,
        fontSize: num(s.fontSize, 8, 72, DEFAULT_EMAIL_STYLE.fontSize),
        textColor: typeof s.textColor === 'string' && /^#[0-9a-f]{3,8}$/i.test(s.textColor) ? s.textColor : DEFAULT_EMAIL_STYLE.textColor,
        lineHeight: num(s.lineHeight, 0.8, 4, DEFAULT_EMAIL_STYLE.lineHeight),
    };
}

/** Text inside the course card of invitations/reminders (see cardText in appConfig.ts). */
export function cardTextStyle(base: EmailTextStyle): EmailTextStyle {
    return { fontFamily: normalizeEmailStyle(base).fontFamily, fontSize: 14, textColor: '#334155', lineHeight: 1.5 };
}

/** Line height in whole pixels (Outlook handles px line heights best). */
export function lineHeightPx(style: EmailTextStyle): number {
    return Math.round(style.fontSize * style.lineHeight);
}

/** First family of a font stack, lower-cased and unquoted — used to match stacks written differently. */
export function primaryFontName(stack?: string | null): string {
    return (stack || '').split(',')[0].replace(/["']/g, '').trim().toLowerCase();
}

/** The default templates inline this stack on every paragraph; it stands for "the email font". */
export function isLegacyDefaultFont(family: string): boolean {
    return primaryFontName(family) === 'arial' && family.includes('-apple-system');
}

// ─── Inline style helpers ──────────────────────────────────────

type StyleMap = Map<string, string>;

function parseStyle(style: string | null): StyleMap {
    const map: StyleMap = new Map();
    for (const decl of (style || '').split(';')) {
        const i = decl.indexOf(':');
        if (i < 0) continue;
        const prop = decl.slice(0, i).trim().toLowerCase();
        const value = decl.slice(i + 1).trim();
        if (prop && value) map.set(prop, value);
    }
    return map;
}

function writeStyle(el: Element, map: StyleMap) {
    if (map.size === 0) el.removeAttribute('style');
    else el.setAttribute('style', [...map].map(([k, v]) => `${k}:${v}`).join(';') + ';');
}

/** Add declarations the element doesn't set itself (explicit formatting always wins). */
function addDefaults(el: Element, defaults: Record<string, string | number>) {
    const map = parseStyle(el.getAttribute('style'));
    const has = (prop: string) => map.has(prop) || ((prop === 'margin' || prop === 'padding' || prop === 'border') && [...map.keys()].some(k => k.startsWith(`${prop}-`)));
    let changed = false;
    for (const [prop, value] of Object.entries(defaults)) {
        if (!has(prop)) { map.set(prop, String(value)); changed = true; }
    }
    if (changed) writeStyle(el, map);
}

function parseHtml(html: string): HTMLElement {
    return new DOMParser().parseFromString(`<!DOCTYPE html><html><body>${html}</body></html>`, 'text/html').body;
}

function isEmptyBlock(el: Element): boolean {
    return !el.textContent?.trim() && !el.querySelector('br, img, table, hr');
}

// ─── Editor input ──────────────────────────────────────────────

// Templates saved by the old Quill editor still carry its class names (ql-color-red, ql-size-large…).
// These are the inline styles the email builder has always given them.
const QUILL_COLORS: Record<string, string> = {
    black: '#000000', red: '#e60000', orange: '#ff9900', yellow: '#ffff00', green: '#008a00',
    blue: '#0066cc', purple: '#9933ff', white: '#ffffff', silver: '#bbbbbb', gray: '#888888',
};
export const QUILL_FONTS: Record<string, string> = { serif: 'Georgia, Times New Roman, serif', monospace: 'Monaco, Courier New, monospace' };
export const QUILL_SIZES: Record<string, string> = { small: '0.75em', large: '1.5em', huge: '2.5em' };

/** A Quill colour class value (`red`, `facccc`) as a CSS colour, or null. */
export function quillColor(value: string): string | null {
    return QUILL_COLORS[value] || (/^[0-9a-f]{3,6}$/i.test(value) ? `#${value}` : null);
}

/** Old Quill class names → the inline styles the email builder has always given them. */
function quillClassesToStyles(root: HTMLElement) {

    root.querySelectorAll('[class]').forEach(el => {
        const classes = el.className.split(/\s+/).filter(Boolean);
        if (!classes.some(c => c.startsWith('ql-'))) return;
        const map = parseStyle(el.getAttribute('style'));
        const keep: string[] = [];
        for (const cls of classes) {
            let m: RegExpMatchArray | null;
            if ((m = cls.match(/^ql-color-(.+)$/)) && quillColor(m[1])) map.set('color', quillColor(m[1])!);
            else if ((m = cls.match(/^ql-bg-(.+)$/)) && quillColor(m[1])) map.set('background-color', quillColor(m[1])!);
            else if ((m = cls.match(/^ql-font-(.+)$/)) && QUILL_FONTS[m[1]]) map.set('font-family', QUILL_FONTS[m[1]]);
            else if ((m = cls.match(/^ql-size-(.+)$/)) && QUILL_SIZES[m[1]]) map.set('font-size', QUILL_SIZES[m[1]]);
            else if (!cls.startsWith('ql-')) keep.push(cls);
        }
        writeStyle(el, map);
        if (keep.length) el.className = keep.join(' ');
        else el.removeAttribute('class');
    });
    root.querySelectorAll('.ql-ui').forEach(el => el.remove());
}

/** Stored template HTML (possibly from the old Quill editor) → editor content. */
export function prepareEditorHtml(html: string): string {
    if (!html || typeof DOMParser === 'undefined') return html || '';
    const root = parseHtml(html);
    quillClassesToStyles(root);
    // Default templates put block placeholders on bare lines between paragraphs: give each
    // line its own paragraph, or the editor would merge them into one
    Array.from(root.childNodes).forEach(node => {
        if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) return;
        for (const line of node.textContent.split('\n').map(l => l.trim()).filter(Boolean)) {
            const p = root.ownerDocument.createElement('p');
            p.textContent = line;
            root.insertBefore(p, node);
        }
        node.remove();
    });
    // Quill wrote blank lines as <p><br></p>; the editor's own blank line is an empty <p>
    root.querySelectorAll('p').forEach(p => {
        if (p.childNodes.length === 1 && p.firstChild?.nodeName === 'BR') p.removeChild(p.firstChild);
    });
    return root.innerHTML;
}

// ─── Email output ──────────────────────────────────────────────

/** Heading sizes relative to the base text size (kept in sync with the editor's CSS). */
const HEADING_SCALE: Record<string, number> = { H1: 1.75, H2: 1.4, H3: 1.2 };

/**
 * Editor HTML → email-ready HTML. Paragraphs and lists that already exist keep their exact
 * markup; only structure the editor adds (list item wrappers, blank lines) and new elements
 * (headings, tables, quotes, dividers) are rewritten, with every style inlined.
 * Placeholders ({courseDetails}…) are left in place.
 */
export function inlineEmailStyles(html: string, style: EmailTextStyle): string {
    if (!html || typeof DOMParser === 'undefined') return html;
    const s = normalizeEmailStyle(style);
    const root = parseHtml(html);
    const px = (n: number) => `${Math.round(n)}px`;

    // The editor wraps list item text in <p>; unwrap it so lists keep their tight spacing
    root.querySelectorAll('li').forEach(li => {
        const blocks = Array.from(li.children).filter(c => c.tagName === 'P');
        const onlyOneP = blocks.length === 1 && Array.from(li.childNodes).every(n => n === blocks[0] || (n.nodeType === 3 && !n.textContent?.trim()) || (n.nodeType === 1 && /^(UL|OL)$/.test((n as Element).tagName)));
        if (onlyOneP) {
            const p = blocks[0];
            const liStyle = parseStyle(li.getAttribute('style'));
            parseStyle(p.getAttribute('style')).forEach((v, k) => { if (!k.startsWith('margin')) liStyle.set(k, v); });
            writeStyle(li, liStyle);
            while (p.firstChild) li.insertBefore(p.firstChild, p);
            p.remove();
        } else {
            blocks.forEach(p => addDefaults(p, { margin: '0' }));
        }
    });

    // A blank line typed in the editor must still take up a line (Quill wrote <p><br></p>)
    root.querySelectorAll('p').forEach(p => { if (isEmptyBlock(p)) p.innerHTML = '<br>'; });

    root.querySelectorAll('h1, h2, h3').forEach(el => {
        addDefaults(el, {
            margin: '16px 0 8px 0',
            'font-size': px(s.fontSize * (HEADING_SCALE[el.tagName] || 1)),
            'font-weight': 'bold',
            'line-height': '1.3',
            'font-family': s.fontFamily,
        });
    });

    root.querySelectorAll('blockquote').forEach(el =>
        addDefaults(el, { margin: '0 0 0 0', padding: '0 0 0 14px', 'border-left': '3px solid #cbd5e1', color: '#475569' })
    );

    root.querySelectorAll('hr').forEach(el =>
        addDefaults(el, { border: '0', 'border-top': '1px solid #e2e8f0', height: '0', margin: '16px 0' })
    );

    root.querySelectorAll('table').forEach(el => {
        el.querySelectorAll(':scope > colgroup').forEach(c => c.remove());
        const map = parseStyle(el.getAttribute('style'));
        map.delete('min-width');
        writeStyle(el, map);
        addDefaults(el, { width: '100%', 'border-collapse': 'collapse', margin: '0 0 16px 0' });
        el.setAttribute('width', '100%');
        el.setAttribute('cellpadding', '0');
        el.setAttribute('cellspacing', '0');
        el.setAttribute('border', '0');
    });
    root.querySelectorAll('td, th').forEach(el => {
        if (el.getAttribute('colspan') === '1') el.removeAttribute('colspan');
        if (el.getAttribute('rowspan') === '1') el.removeAttribute('rowspan');
        el.removeAttribute('colwidth');
        // Outlook doesn't carry the body font into table cells
        addDefaults(el, {
            border: '1px solid #cbd5e1', padding: '6px 10px', 'vertical-align': 'top', 'text-align': 'left',
            'font-family': s.fontFamily, 'font-size': px(s.fontSize), 'line-height': px(lineHeightPx(s)), color: s.textColor,
        });
        if (el.tagName === 'TH') addDefaults(el, { 'background-color': '#f1f5f9', 'font-weight': 'bold' });
        el.querySelectorAll(':scope > p').forEach(p => addDefaults(p, { margin: '0' }));
    });

    // The default templates inline Arial on each paragraph: follow the chosen email font instead
    if (!isLegacyDefaultFont(s.fontFamily)) {
        root.querySelectorAll('[style*="-apple-system"]').forEach(el => {
            const map = parseStyle(el.getAttribute('style'));
            const family = map.get('font-family');
            if (family && isLegacyDefaultFont(family)) {
                map.set('font-family', s.fontFamily);
                writeStyle(el, map);
            }
        });
    }

    return root.innerHTML;
}
