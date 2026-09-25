// ─── App Configuration (localStorage/Supabase-based) ───────────
// Centralized config for email templates, display preferences, etc.
import { supabase } from './supabase';
import type { CourseEmailInfo } from './types';

export interface ExcelColumn {
    /** Column header text shown in the Excel file */
    header: string;
    /** Placeholder key from the same set used by Word templates (e.g. 'firstName', 'email') */
    placeholder: string;
}

export interface AppConfig {
    /** HTML Email body template for courses requiring high English. Supports placeholders: {courseDetails}, {capacityNotice}, {confirmationButton}, {confirmationLink}, {responseDays} */
    htmlEmailTemplate: string;
    /** HTML Email body template for standard courses. Supports placeholders: {courseDetails}, {capacityNotice}, {confirmationButton}, {confirmationLink}, {responseDays} */
    htmlEmailTemplateStandard: string;
    /** Email subject format. Supports placeholders: {courseName}, {date} */
    emailSubjectFormat: string;
    /** Attendance reminder for confirmed people. Supports: {courseDetails}, {attendanceNotice} */
    reminderEmailTemplate: string;
    /** Reminder subject. Supports placeholders: {courseName}, {date} */
    reminderEmailSubjectFormat: string;
    /** Columns to include in the Excel spreadsheet exported with the archive */
    excelColumns: ExcelColumn[];
    /** HTML Email body template for status clarification. Supports: {statusButton}, {statusLink} */
    statusEmailTemplate: string;
    /** Email subject for status clarification emails */
    statusEmailSubjectFormat: string;
    /** Same survey email for external outreach lists (e.g. Action 11 from IRIS). Supports: {statusDetails}, {statusButton}, {statusLink} */
    outreachEmailTemplate: string;
    /** Email subject for external outreach list survey emails */
    outreachEmailSubjectFormat: string;
    /** Whether to include the Cork City Partnership logo banner in emails */
    includeLogosInEmails: boolean;
}

const STORAGE_KEY = 'crm_app_config';

export const DEFAULT_EXCEL_COLUMNS: ExcelColumn[] = [
    { header: 'First Name', placeholder: 'firstName' },
    { header: 'Last Name', placeholder: 'lastName' },
    { header: 'Email', placeholder: 'email' },
    { header: 'Phone', placeholder: 'mobileNumber' },
    { header: 'Course', placeholder: 'courseTitle' },
    { header: 'Course Date', placeholder: 'courseDate' },
];

/** Font stack inlined into every email element (email clients ignore <style>). */
const FONT = "Arial,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

export const DEFAULT_CONFIG: AppConfig = {
    htmlEmailTemplate: `<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${FONT};">Hello,</p>
<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${FONT};">We are delighted to invite you to join our upcoming course. Please review the details below and confirm your suitability and attendance.</p>
<p style="margin:0 0 20px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${FONT};">Places on this course are <strong>limited</strong> and allocated on a first-come, first-served basis, so please confirm your suitability and attendance <strong>as soon as possible</strong> (and no later than <strong>{responseDays} days</strong>) by clicking the button below.</p>
{courseDetails}
{englishWarning}
{capacityNotice}
{confirmationButton}
<p style="margin:0 0 10px 0;font-size:15px;line-height:22px;color:#475569;font-family:${FONT};">If you have any questions, feel free to reply to this email. You can also let me know if:</p>
<ul style="margin:0 0 16px 0;padding-left:20px;font-size:14px;line-height:22px;color:#64748b;font-family:${FONT};">
  <li style="margin-bottom:4px;">You've already taken this course elsewhere</li>
  <li style="margin-bottom:4px;">You're not interested</li>
  <li>You’d prefer not to receive future emails</li>
</ul>`,
    htmlEmailTemplateStandard: `<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${FONT};">Hello,</p>
<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${FONT};">We are delighted to invite you to join our upcoming course. Please review the details below and confirm your attendance.</p>
<p style="margin:0 0 20px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${FONT};">Places on this course are <strong>limited</strong> and allocated on a first-come, first-served basis, so please confirm your attendance <strong>as soon as possible</strong> (and no later than <strong>{responseDays} days</strong>) by clicking the button below.</p>
{courseDetails}
{capacityNotice}
{confirmationButton}
<p style="margin:0 0 10px 0;font-size:15px;line-height:22px;color:#475569;font-family:${FONT};">If you have any questions, feel free to reply to this email. You can also let me know if:</p>
<ul style="margin:0 0 16px 0;padding-left:20px;font-size:14px;line-height:22px;color:#64748b;font-family:${FONT};">
  <li style="margin-bottom:4px;">You've already taken this course elsewhere</li>
  <li style="margin-bottom:4px;">You're not interested</li>
  <li>You’d prefer not to receive future emails</li>
</ul>`,
    emailSubjectFormat: 'You are Invited to join our {courseName} course which will take place on {date}',
    reminderEmailTemplate: `<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${FONT};">Hello,</p>
<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${FONT};">This is a friendly reminder that you have a place on our upcoming course. Please check the date, time and location below — we look forward to seeing you!</p>
{courseDetails}
{attendanceNotice}
<p style="margin:0 0 10px 0;font-size:15px;line-height:22px;color:#475569;font-family:${FONT};">If you have any questions, feel free to reply to this email.</p>`,
    reminderEmailSubjectFormat: 'Reminder: your {courseName} course on {date}',
    excelColumns: DEFAULT_EXCEL_COLUMNS,
    statusEmailTemplate: `<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${FONT};">Hello,</p>
<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${FONT};">We hope you are keeping well! You recently completed a course with <strong>Cork City Partnership</strong>, and we would love to hear how things have been going for you since then.</p>
<p style="margin:0 0 20px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${FONT};">Could you spare <strong>one minute</strong> to answer four quick questions? You can use the button below or simply reply to this email. Your answers help us see what difference our courses make and plan better ones for future participants.</p>
{statusDetails}
{statusButton}
<p style="margin:0 0 16px 0;font-size:15px;line-height:22px;color:#475569;font-family:${FONT};"><strong>Prefer not to use the link?</strong> Simply reply to this email with your answers to the questions above — that works just as well.</p>
<p style="margin:0 0 10px 0;font-size:15px;line-height:22px;color:#475569;font-family:${FONT};">Whether you are working or not yet, every answer counts. If you are still looking for work or another course, let us know in your reply — we are happy to help.</p>
<p style="margin:0 0 16px 0;font-size:13px;line-height:19px;color:#64748b;font-family:${FONT};">Your answers are confidential and only used, anonymously, to report on the results of our programmes.</p>`,
    statusEmailSubjectFormat: 'How are things going since your course? (1-minute update)',
    outreachEmailTemplate: `<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${FONT};">Hello,</p>
<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${FONT};">We hope you are keeping well! You have been supported by <strong>Cork City Partnership</strong>, and we would love to hear how things are going for you now.</p>
<p style="margin:0 0 20px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${FONT};">Could you spare <strong>one minute</strong> to answer four quick questions? You can use the button below or simply reply to this email. Your answers help us see what difference our support makes and plan better services for the people we work with.</p>
{statusDetails}
{statusButton}
<p style="margin:0 0 16px 0;font-size:15px;line-height:22px;color:#475569;font-family:${FONT};"><strong>Prefer not to use the link?</strong> Simply reply to this email with your answers to the questions above — that works just as well.</p>
<p style="margin:0 0 10px 0;font-size:15px;line-height:22px;color:#475569;font-family:${FONT};">Whether you are working or not yet, every answer counts. If you are still looking for work or a course, let us know in your reply — we are happy to help.</p>
<p style="margin:0 0 16px 0;font-size:13px;line-height:19px;color:#64748b;font-family:${FONT};">Your answers are confidential and only used, anonymously, to report on the results of our programmes.</p>`,
    outreachEmailSubjectFormat: 'How are things going? (1-minute update from Cork City Partnership)',
    includeLogosInEmails: false,
};

/** Invitation-type templates are useless without the confirm button or link. */
export function hasConfirmationTag(tpl: string): boolean {
    return tpl.includes('{confirmationButton}') || tpl.includes('{confirmationLink}');
}

export type InviteEmailKind = 'invite' | 'reminder';

/** Read the full config, merging saved values over defaults. */
export function getConfig(): AppConfig {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_CONFIG };
        const saved = JSON.parse(raw) as Partial<AppConfig>;
        
        // MIGRATION: If the saved template contains a full HTML skeleton, force reset to the new default.
        // This fixes broken templates from previous versions where ReactQuill destroyed the HTML.
        if (saved.htmlEmailTemplate && (saved.htmlEmailTemplate.includes('<html') || saved.htmlEmailTemplate.includes('hero-gradient'))) {
            saved.htmlEmailTemplate = DEFAULT_CONFIG.htmlEmailTemplate;
            saved.statusEmailTemplate = DEFAULT_CONFIG.statusEmailTemplate;
        }

        // RECOVERY: If htmlEmailTemplate got corrupted/truncated (e.g. missing confirmation button or just {englishWarning}), restore to default
        if (saved.htmlEmailTemplate && (!saved.htmlEmailTemplate.includes('{confirmationButton}') && !saved.htmlEmailTemplate.includes('{confirmationLink}'))) {
            saved.htmlEmailTemplate = DEFAULT_CONFIG.htmlEmailTemplate;
        }

        // MIGRATION: Safely convert plain text Important note in saved templates to {englishWarning}
        if (saved.htmlEmailTemplate && saved.htmlEmailTemplate.includes('Important note before you confirm:') && !saved.htmlEmailTemplate.includes('{englishWarning}')) {
            saved.htmlEmailTemplate = saved.htmlEmailTemplate.replace(
                /<p[^>]*>[^<]*?Important note before you confirm:[^<]*?<\/p>[\s\S]*?<\/ul>/i,
                '{englishWarning}'
            );
        }

        // MIGRATION: Upgrade the old "Spaces are limited ... within N days" sentence
        // to the capacity-aware wording (confirm as soon as possible).
        const upgradeLimitedSentence = (tpl?: string) => tpl
            ?.replace(
                'Spaces are limited, so please confirm your suitability and attendance within <strong>{responseDays} days</strong> by clicking the button below or replying to this email.',
                'Places on this course are <strong>limited</strong> and allocated on a first-come, first-served basis, so please confirm your suitability and attendance <strong>as soon as possible</strong> (and no later than <strong>{responseDays} days</strong>) by clicking the button below.'
            )
            .replace(
                'Spaces are limited, so please confirm your attendance within <strong>{responseDays} days</strong> by clicking the button below or replying to this email.',
                'Places on this course are <strong>limited</strong> and allocated on a first-come, first-served basis, so please confirm your attendance <strong>as soon as possible</strong> (and no later than <strong>{responseDays} days</strong>) by clicking the button below.'
            );
        if (saved.htmlEmailTemplate) saved.htmlEmailTemplate = upgradeLimitedSentence(saved.htmlEmailTemplate);
        if (saved.htmlEmailTemplateStandard) saved.htmlEmailTemplateStandard = upgradeLimitedSentence(saved.htmlEmailTemplateStandard);

        // MIGRATION: Replace the old Google-Form-era status template (purple box) with the new default.
        if (saved.statusEmailTemplate && (
            saved.statusEmailTemplate.includes('Could you take 30 seconds') ||
            (!saved.statusEmailTemplate.includes('{statusButton}') && !saved.statusEmailTemplate.includes('{statusLink}'))
        )) {
            saved.statusEmailTemplate = DEFAULT_CONFIG.statusEmailTemplate;
        }
        if (saved.statusEmailSubjectFormat === 'Quick Status Update — How are things going?') {
            saved.statusEmailSubjectFormat = DEFAULT_CONFIG.statusEmailSubjectFormat;
        }
        if (saved.outreachEmailTemplate && !saved.outreachEmailTemplate.includes('{statusButton}') && !saved.outreachEmailTemplate.includes('{statusLink}')) {
            saved.outreachEmailTemplate = DEFAULT_CONFIG.outreachEmailTemplate;
        }

        if (!saved.htmlEmailTemplateStandard || (!saved.htmlEmailTemplateStandard.includes('{confirmationButton}') && !saved.htmlEmailTemplateStandard.includes('{confirmationLink}'))) {
            saved.htmlEmailTemplateStandard = DEFAULT_CONFIG.htmlEmailTemplateStandard;
        }
        // MIGRATION: the first reminder asked people to confirm; reminders now go to confirmed people
        if (saved.reminderEmailTemplate?.includes('{confirmationButton}')) {
            saved.reminderEmailTemplate = DEFAULT_CONFIG.reminderEmailTemplate;
        }
        if (saved.reminderEmailSubjectFormat === 'Reminder: please confirm your place on {courseName} ({date})') {
            saved.reminderEmailSubjectFormat = DEFAULT_CONFIG.reminderEmailSubjectFormat;
        }

        return { ...DEFAULT_CONFIG, ...saved };
    } catch {
        return { ...DEFAULT_CONFIG };
    }
}

/** Persist a partial config update (merges with existing). */
export function setConfig(patch: Partial<AppConfig>): AppConfig {
    const current = getConfig();
    const merged = { ...current, ...patch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));

    // Async sync to Supabase in background if user is authenticated
    supabase.auth.getSession().then(({ data: { session } }) => {
        const user = session?.user;
        if (user) {
            supabase
                .from('user_settings')
                .upsert({
                    user_id: user.id,
                    settings: merged,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' })
                .then(({ error }) => {
                    if (error) {
                        console.error('Failed to sync settings to Supabase:', error);
                    }
                });
        }
    });

    return merged;
}

/** Reset config to defaults. */
export function resetConfig(): AppConfig {
    localStorage.removeItem(STORAGE_KEY);

    // Async reset in Supabase in background
    supabase.auth.getSession().then(({ data: { session } }) => {
        const user = session?.user;
        if (user) {
            supabase
                .from('user_settings')
                .upsert({
                    user_id: user.id,
                    settings: DEFAULT_CONFIG,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' })
                .then(({ error }) => {
                    if (error) {
                        console.error('Failed to reset settings in Supabase:', error);
                    }
                });
        }
    });

    return { ...DEFAULT_CONFIG };
}

/**
 * Converts rgb(...) and rgba(...) color values in HTML string to hex format (#RRGGBB).
 * This ensures Outlook compatibility, as Outlook ignores rgb() colors in inline styles.
 */
/**
 * Converts rgb(...) and rgba(...) color values in HTML string to hex format (#RRGGBB).
 * This ensures Outlook compatibility, as Outlook ignores rgb() colors in inline styles.
 */
export function convertRgbToHex(html: string): string {
    return html.replace(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/gi, (_match, rStr, gStr, bStr) => {
        const r = parseInt(rStr, 10);
        const g = parseInt(gStr, 10);
        const b = parseInt(bStr, 10);
        
        const clamp = (val: number) => Math.max(0, Math.min(255, val));
        const hex = ((1 << 24) + (clamp(r) << 16) + (clamp(g) << 8) + clamp(b)).toString(16).slice(1);
        return `#${hex}`;
    });
}

/**
 * Inlines Quill's class-based formatting (e.g. ql-color-red, ql-bg-facccc) to standard inline CSS styles.
 * This is crucial for HTML email rendering in clients like Outlook which do not load the Quill stylesheet.
 */
export function convertQuillClassesToInlineStyles(html: string): string {
    const colorMap: Record<string, string> = {
        'black': '#000000',
        'red': '#e60000',
        'orange': '#ff9900',
        'yellow': '#ffff00',
        'green': '#008a00',
        'blue': '#0066cc',
        'purple': '#9933ff',
        'white': '#ffffff',
        'silver': '#bbbbbb',
        'gray': '#888888'
    };

    const fontMap: Record<string, string> = {
        'serif': 'Georgia, Times New Roman, serif',
        'monospace': 'Monaco, Courier New, monospace'
    };

    const sizeMap: Record<string, string> = {
        'small': '0.75em',
        'large': '1.5em',
        'huge': '2.5em'
    };

    return html.replace(/<([a-z0-9]+)(\s+[^>]*)>/gi, (tagMatch, tagName, attrs) => {
        const classMatch = attrs.match(/class=["']([^"']+)["']/i);
        if (!classMatch) return tagMatch;

        const classList = classMatch[1].split(/\s+/);
        const stylesToAdd: string[] = [];
        const remainingClasses: string[] = [];

        for (const cls of classList) {
            let processed = false;

            if (cls.startsWith('ql-color-')) {
                const val = cls.substring(9);
                const color = colorMap[val] || (val.match(/^[0-9a-f]{3,6}$/i) ? `#${val}` : null);
                if (color) {
                    stylesToAdd.push(`color: ${color};`);
                    processed = true;
                }
            } else if (cls.startsWith('ql-bg-')) {
                const val = cls.substring(6);
                const color = colorMap[val] || (val.match(/^[0-9a-f]{3,6}$/i) ? `#${val}` : null);
                if (color) {
                    stylesToAdd.push(`background-color: ${color};`);
                    processed = true;
                }
            } else if (cls.startsWith('ql-font-')) {
                const val = cls.substring(8);
                const font = fontMap[val];
                if (font) {
                    stylesToAdd.push(`font-family: ${font};`);
                    processed = true;
                }
            } else if (cls.startsWith('ql-size-')) {
                const val = cls.substring(8);
                const size = sizeMap[val];
                if (size) {
                    stylesToAdd.push(`font-size: ${size};`);
                    processed = true;
                }
            }

            if (!processed && cls.trim()) {
                remainingClasses.push(cls);
            }
        }

        if (stylesToAdd.length === 0) {
            return tagMatch;
        }

        let newAttrs = attrs;

        const styleMatch = attrs.match(/style=["']([^"']*)["']/i);
        const styleStr = stylesToAdd.join(' ');
        if (styleMatch) {
            const existingStyle = styleMatch[1].trim();
            const delimiter = existingStyle && !existingStyle.endsWith(';') ? ';' : '';
            const newStyle = `${existingStyle}${delimiter} ${styleStr}`.trim();
            newAttrs = newAttrs.replace(/style=["']([^"']*)["']/i, `style="${newStyle}"`);
        } else {
            newAttrs = `${newAttrs} style="${styleStr}"`;
        }

        if (remainingClasses.length > 0) {
            newAttrs = newAttrs.replace(/class=["']([^"']+)["']/i, `class="${remainingClasses.join(' ')}"`);
        } else {
            newAttrs = newAttrs.replace(/\s*class=["']([^"']+)["']/i, '');
        }

        return `<${tagName}${newAttrs}>`;
    });
}

/**
 * Replaces color-styled <span> tags with <font color> tags for Outlook compatibility.
 * Outlook's Word engine strips <span> elements during paste but preserves legacy <font> tags.
 * Uses a non-regex DOM approach to handle nested elements correctly.
 */
export function replaceColorSpansWithFontTags(html: string): string {
    // Use regex that handles nested content (including other tags) inside spans.
    // Match spans with style attributes containing color (but not background-color).
    return html.replace(/<span\s+([^>]*?)>([\s\S]*?)<\/span>/gi, (match, attrs, content) => {
        // Extract color from style, being careful not to match background-color
        const colorMatch = attrs.match(/style\s*=\s*["']([^"']*)(?:^|[;\s])color\s*:\s*([^;"']+)/i) ||
                           attrs.match(/style\s*=\s*["']color\s*:\s*([^;"']+)/i);
        
        if (!colorMatch) return match;
        
        // Get the color value (last capture group)
        const color = colorMatch[colorMatch.length === 3 ? 2 : 1].trim();
        // <font color> reads any word as a hex code ("inherit" → bright green), so only
        // hex values and real colour names are converted; pasted inherit/var(...) stay as CSS.
        if (!/^#[0-9a-f]{3,8}$|^[a-z]+$/i.test(color) || /^(inherit|initial|unset|revert|currentcolor|transparent)$/i.test(color)) return match;
        
        // Check for background-color too
        const bgMatch = attrs.match(/background-color\s*:\s*([^;"']+)/i);
        
        if (bgMatch) {
            const bgColor = bgMatch[1].trim();
            // Use font tag for color + inline style for background
            return `<font color="${color}" style="background-color:${bgColor};">${content}</font>`;
        }
        
        // Replace span entirely with font tag
        return `<font color="${color}">${content}</font>`;
    });
}

/** Matches wording that already tells the reader how to stop receiving emails. */
const UNSUBSCRIBE_TEXT_RE = /prefer not to receive|unsubscribe|opt[\s-]?out|stop receiving|(?:don['’]t|do not) (?:want|wish) to receive/i;

export const UNSUBSCRIBE_FOOTER_TEXT = "If you don't want to receive emails from us, just let us know by replying to this email and we will remove you from our mailing list.";

/** Every email must say how to stop receiving them — unless the template already does. */
export function hasUnsubscribeText(html: string): boolean {
    return UNSUBSCRIBE_TEXT_RE.test(html.replace(/<[^>]+>/g, ' ').replace(/&rsquo;|&#8217;|&#39;|&apos;/g, "'"));
}

function getEmailWrapper(content: string, type: InviteEmailKind | 'status', includeLogos: boolean) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    
    const [heroTitle, heroSubtitle] = {
        invite: ["You're Invited!", 'Cork City Partnership course invitation'],
        reminder: ['See You Soon!', 'Reminder about your Cork City Partnership course'],
        status: ['How Are Things Going?', 'Cork City Partnership participant update'],
    }[type];
    const cacheBuster = Date.now();

    const unsubscribeHtml = hasUnsubscribeText(content) ? '' : `
          <!-- Unsubscribe -->
          <tr>
            <td align="left" style="padding: 14px 0 6px 0; border-top: 1px solid #e2e8f0; font-family: Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif; font-size: 12px; line-height: 18px; color: #64748b;">
              ${UNSUBSCRIBE_FOOTER_TEXT}
            </td>
          </tr>`;

    const logoHtml = includeLogos ? `
          <!-- Logos -->
          <tr>
            <td align="center" style="padding: 16px 0 20px 0; text-align: center; border-bottom: 1px solid #e2e8f0;">
              <img src="${origin}/logos-banner.png?v=${cacheBuster}" alt="Cork City Partnership — Government of Ireland, EU Co-Funded, SICAP" width="500" style="width: 100%; max-width: 500px; height: auto; border: 0; outline: none; text-decoration: none; display: block; margin: 0 auto;">
            </td>
          </tr>` : '';
    
    const htmlWrapper = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <title></title>
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    table { border-collapse: collapse !important; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
    a { color: #0284c7; text-decoration: underline; }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif; font-size: 15px; line-height: 23px; color: #1e293b;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
    <tr>
      <td align="left" style="padding: 10px 0; font-family: Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif; font-size: 15px; line-height: 23px; color: #1e293b;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
          ${logoHtml}
          <!-- Hero -->
          <tr>
            <td align="left" style="padding: 8px 0 16px 0; font-family: Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif;">
              <div style="font-size: 22px; font-weight: bold; color: #0f172a; line-height: 28px; margin: 0 0 4px 0;">${heroTitle}</div>
              <div style="font-size: 14px; color: #64748b; line-height: 20px; margin: 0;">${heroSubtitle}</div>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td align="left" style="padding: 6px 0; font-family: Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif; font-size: 15px; line-height: 23px; color: #1e293b;">
              ${content}
            </td>
          </tr>
          ${unsubscribeHtml}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const inlined = convertQuillClassesToInlineStyles(htmlWrapper);
    const withHex = convertRgbToHex(inlined);
    return replaceColorSpansWithFontTags(withHex);
}

/** Sanitize string for safe insertion into HTML email templates. */
export function escapeHtml(str: string): string {
    return (str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/** Course's own rich text (Quill HTML) inside the course card, with email-safe spacing. */
function cardText(html?: string | null): string {
    if (!html || !html.replace(/<[^>]+>|&nbsp;/g, '').trim()) return '';
    const styled = html
        .replace(/<p>/g, '<p style="margin:0 0 4px 0;">')
        .replace(/<(ul|ol)>/g, '<$1 style="margin:4px 0;padding-left:20px;">');
    return `<div style="font-size:14px;line-height:21px;color:#334155;margin-top:6px;font-family:${FONT};">${styled}</div>`;
}

/** Build the email body HTML by replacing placeholders. */
export function buildEmailBodyHtml(
    courseTitle: string, 
    /** One formatted date, or several for a multi-date invite (the student picks one). */
    date: string | string[], 
    confirmationLink?: string, 
    customConfig?: AppConfig, 
    responseDays?: number,
    requiresEnglish: boolean = false,
    kind: InviteEmailKind = 'invite',
    /** The course's own text shown in the course card */
    courseInfo?: CourseEmailInfo | null
): string {
    const config = customConfig || getConfig();
    const linkStr = confirmationLink || '#';
    const dateList = Array.isArray(date) ? date.filter(Boolean) : [date];
    const isMultiDate = dateList.length > 1;
    const safeCourseTitle = escapeHtml(courseTitle);
    const buttonText = isMultiDate
        ? (requiresEnglish ? 'I Am Confident in English — Choose My Date' : 'Choose My Date &amp; Confirm')
        : (requiresEnglish ? 'I Am Confident in English — Confirm My Place' : 'Confirm My Place');
    const dateRowHtml = isMultiDate
        ? `<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:bold;line-height:16px;">Choose one of the dates</div>
${dateList.map(d => `            <div style="font-size:15px;color:#0369a1;font-weight:bold;line-height:22px;margin-top:4px;">🗓️ ${escapeHtml(d)}</div>`).join('\n')}
            <div style="font-size:12px;color:#64748b;line-height:18px;margin-top:6px;">You will pick your preferred date on the confirmation page.</div>`
        : `<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:bold;line-height:16px;">Date &amp; Time</div>
            <div style="font-size:15px;color:#0369a1;font-weight:bold;line-height:22px;margin-top:2px;">🗓️ ${escapeHtml(dateList[0] ?? '')}</div>`;
    
    const courseDetailsHtml = `<!-- Course Details Card -->
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:600px;border-collapse:collapse;margin:18px 0;background-color:#f8fafc;border:1px solid #e2e8f0;border-left:5px solid #0284c7;border-radius:8px;">
  <tr>
    <td style="padding:16px 20px;font-family:${FONT};">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
        <tr>
          <td style="padding-bottom:10px;font-family:${FONT};">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:bold;line-height:16px;">Course Title</div>
            <div style="font-size:17px;color:#0f172a;font-weight:bold;line-height:24px;margin-top:2px;">${safeCourseTitle}</div>
            ${cardText(courseInfo?.description)}
          </td>
        </tr>
        <tr>
          <td style="font-family:${FONT};">
            ${dateRowHtml}
            ${cardText(courseInfo?.details)}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

    const englishWarningHtml = `<!-- English Warning Card -->
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:600px;border-collapse:collapse;margin:18px 0;background-color:#fffbeb;border:1px solid #fef08a;border-left:5px solid #f59e0b;border-radius:8px;">
  <tr>
    <td style="padding:15px 20px;font-family:${FONT};">
      <div style="font-size:13px;font-weight:bold;color:#b45309;line-height:20px;margin-bottom:8px;">⚠️ Important note before you confirm:</div>
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;font-family:${FONT};font-size:13px;line-height:19px;color:#92400e;">
        <tr>
          <td style="padding:2px 8px 2px 0;vertical-align:top;font-size:13px;line-height:19px;color:#b45309;width:12px;font-weight:bold;">&bull;</td>
          <td style="padding:2px 0;vertical-align:top;font-size:13px;line-height:19px;color:#92400e;">Please only accept this place if you feel confident with your English.</td>
        </tr>
        <tr>
          <td style="padding:2px 8px 2px 0;vertical-align:top;font-size:13px;line-height:19px;color:#b45309;width:12px;font-weight:bold;">&bull;</td>
          <td style="padding:2px 0;vertical-align:top;font-size:13px;line-height:19px;color:#92400e;">The course and final test are all in English. You will need a good understanding of English to pass.</td>
        </tr>
        <tr>
          <td style="padding:2px 8px 2px 0;vertical-align:top;font-size:13px;line-height:19px;color:#b45309;width:12px;font-weight:bold;">&bull;</td>
          <td style="padding:2px 0;vertical-align:top;font-size:13px;line-height:19px;color:#92400e;">We cannot offer a second chance or a retake if you don't pass.</td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

    const days = responseDays ?? 7;
    const capacityNoticeHtml = `<!-- Limited Places Notice -->
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:600px;border-collapse:collapse;margin:18px 0;background-color:#fef2f2;border:1px solid #fecaca;border-left:5px solid #dc2626;border-radius:8px;">
  <tr>
    <td style="padding:15px 20px;font-family:${FONT};">
      <div style="font-size:13px;font-weight:bold;color:#b91c1c;line-height:20px;margin-bottom:6px;">⏳ Limited places — please read before you confirm</div>
      <div style="font-size:13px;line-height:19px;color:#7f1d1d;">Places on this course are allocated on a first-come, first-served basis. Once all places are taken, confirmation for ${isMultiDate ? "that date" : "this date"} will close — even if your ${days}-day response window has not yet expired.</div>
      <div style="font-size:13px;line-height:19px;color:#7f1d1d;margin-top:8px;"><strong>Please only confirm if you are sure you can attend.</strong> If you confirm but don't attend without letting us know in advance, <strong>you may not be offered a place on this course again</strong>. If you can no longer attend, simply reply to this email as early as possible so we can offer your place to someone else.</div>
    </td>
  </tr>
</table>`;

    const attendanceNoticeHtml = `<!-- Attendance Notice -->
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:600px;border-collapse:collapse;margin:18px 0;background-color:#fef2f2;border:1px solid #fecaca;border-left:5px solid #dc2626;border-radius:8px;">
  <tr>
    <td style="padding:15px 20px;font-family:${FONT};">
      <div style="font-size:13px;font-weight:bold;color:#b91c1c;line-height:20px;margin-bottom:6px;">⏳ Your place is reserved — please let us know if you can't come</div>
      <div style="font-size:13px;line-height:19px;color:#7f1d1d;">You have confirmed your place on this course and it is being kept for you. Places are limited and other people are waiting for one.</div>
      <div style="font-size:13px;line-height:19px;color:#7f1d1d;margin-top:8px;"><strong>If you can no longer attend, please reply to this email as early as possible</strong> so we can offer your place to someone else. If you don't attend without letting us know in advance, <strong>you may not be offered a place on this course again</strong>.</div>
    </td>
  </tr>
</table>`;

    const buttonHtml = confirmationLink
        ? `<!-- Action Button Container -->
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:22px 0;">
  <tr>
    <td align="left" style="padding:0;">
      <!-- Bulletproof Table Button -->
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:separate;">
        <tr>
          <td align="center" bgcolor="#0284c7" style="border-radius:8px;background-color:#0284c7;padding:13px 26px;">
            <a href="${linkStr}" target="_blank" style="font-family:${FONT};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;display:inline-block;line-height:20px;">${buttonText} &rarr;</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
        : '';
        
    let body = kind === 'reminder'
        ? (config.reminderEmailTemplate || DEFAULT_CONFIG.reminderEmailTemplate)
        : requiresEnglish
        ? (config.htmlEmailTemplate || DEFAULT_CONFIG.htmlEmailTemplate)
        : (config.htmlEmailTemplateStandard || DEFAULT_CONFIG.htmlEmailTemplateStandard);

    // Strip wrapping <p> tags ReactQuill might have added around placeholders
    body = body.replace(/<p>\s*\{courseDetails\}\s*<\/p>/g, '{courseDetails}');
    body = body.replace(/<p>\s*\{englishWarning\}\s*<\/p>/g, '{englishWarning}');
    body = body.replace(/<p>\s*\{confirmationButton\}\s*<\/p>/g, '{confirmationButton}');
    body = body.replace(/<p>\s*\{capacityNotice\}\s*<\/p>/g, '{capacityNotice}');
    body = body.replace(/<p>\s*\{attendanceNotice\}\s*<\/p>/g, '{attendanceNotice}');

    // Every invitation must mention limited places: inject the notice into
    // custom templates that don't include the placeholder yet.
    if (kind === 'invite' && !body.includes('{capacityNotice}')) {
        body = body.includes('{confirmationButton}')
            ? body.replace('{confirmationButton}', '{capacityNotice}\n{confirmationButton}')
            : `${body}\n{capacityNotice}`;
    }

    // If template has plain text Important note before you confirm, replace it with the styled card
    if (requiresEnglish && body.includes('Important note before you confirm:') && !body.includes('{englishWarning}')) {
        body = body.replace(
            /<p[^>]*>[^<]*?Important note before you confirm:[^<]*?<\/p>[\s\S]*?<\/ul>/i,
            englishWarningHtml
        );
    }
    
    body = body
        .replace(/\{courseDetails\}/g, courseDetailsHtml)
        .replace(/\{englishWarning\}/g, requiresEnglish ? englishWarningHtml : '')
        .replace(/\{capacityNotice\}/g, capacityNoticeHtml)
        .replace(/\{attendanceNotice\}/g, attendanceNoticeHtml)
        .replace(/\{confirmationButton\}/g, buttonHtml)
        .replace(/\{responseDays\}/g, String(days));

    return getEmailWrapper(body, kind, config.includeLogosInEmails ?? false);
}

/** Build the email subject by replacing placeholders. */
export function buildEmailSubject(courseName: string, date: string, customConfig?: AppConfig, kind: InviteEmailKind = 'invite'): string {
    const config = customConfig || getConfig();
    return (kind === 'reminder' ? config.reminderEmailSubjectFormat || DEFAULT_CONFIG.reminderEmailSubjectFormat : config.emailSubjectFormat)
        .replace(/\{courseName\}/g, courseName)
        .replace(/\{date\}/g, date);
}

/** Who a status survey email goes to: CRM graduates or an external outreach list (e.g. Action 11). */
export type StatusEmailAudience = 'graduates' | 'outreach';

/** Build the status clarification email body HTML. */
export function buildStatusEmailBodyHtml(statusLink: string, customConfig?: AppConfig, audience: StatusEmailAudience = 'graduates'): string {
    const config = customConfig || getConfig();

    // Same card / button markup as the course invitation so both emails look alike
    // and survive copy-paste into Outlook and Gmail.
    const detailsHtml = `<!-- Status Questions Card -->
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:600px;border-collapse:collapse;margin:18px 0;background-color:#f8fafc;border:1px solid #e2e8f0;border-left:5px solid #0284c7;border-radius:8px;">
  <tr>
    <td style="padding:16px 20px;font-family:${FONT};">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:bold;line-height:16px;margin-bottom:6px;">What we will ask</div>
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
        <tr>
          <td style="padding:3px 10px 3px 0;vertical-align:top;font-size:14px;line-height:21px;color:#0284c7;width:14px;font-weight:bold;font-family:${FONT};">&bull;</td>
          <td style="padding:3px 0;vertical-align:top;font-size:14px;line-height:21px;color:#0f172a;font-family:${FONT};">Are you working at the moment?</td>
        </tr>
        <tr>
          <td style="padding:3px 10px 3px 0;vertical-align:top;font-size:14px;line-height:21px;color:#0284c7;width:14px;font-weight:bold;font-family:${FONT};">&bull;</td>
          <td style="padding:3px 0;vertical-align:top;font-size:14px;line-height:21px;color:#0f172a;font-family:${FONT};">If yes — when did you start?</td>
        </tr>
        <tr>
          <td style="padding:3px 10px 3px 0;vertical-align:top;font-size:14px;line-height:21px;color:#0284c7;width:14px;font-weight:bold;font-family:${FONT};">&bull;</td>
          <td style="padding:3px 0;vertical-align:top;font-size:14px;line-height:21px;color:#0f172a;font-family:${FONT};">Where do you work (company or sector)?</td>
        </tr>
        <tr>
          <td style="padding:3px 10px 3px 0;vertical-align:top;font-size:14px;line-height:21px;color:#0284c7;width:14px;font-weight:bold;font-family:${FONT};">&bull;</td>
          <td style="padding:3px 0;vertical-align:top;font-size:14px;line-height:21px;color:#0f172a;font-family:${FONT};">Is it full-time or part-time?</td>
        </tr>
      </table>
      <div style="font-size:13px;color:#0369a1;font-weight:bold;line-height:20px;margin-top:10px;">&#9201; Takes less than a minute &mdash; online or by replying to this email</div>
    </td>
  </tr>
</table>`;

    const buttonHtml = `<!-- Action Button Container -->
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:22px 0;">
  <tr>
    <td align="left" style="padding:0;">
      <!-- Bulletproof Table Button -->
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:separate;">
        <tr>
          <td align="center" bgcolor="#0284c7" style="border-radius:8px;background-color:#0284c7;padding:13px 26px;">
            <a href="${statusLink}" target="_blank" style="font-family:${FONT};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;display:inline-block;line-height:20px;">Share My Update &rarr;</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

    let body = audience === 'outreach'
        ? config.outreachEmailTemplate || DEFAULT_CONFIG.outreachEmailTemplate
        : config.statusEmailTemplate || DEFAULT_CONFIG.statusEmailTemplate;
    // Strip wrapping <p> tags ReactQuill might have added around placeholders
    body = body.replace(/<p>\s*\{statusButton\}\s*<\/p>/g, '{statusButton}');
    body = body.replace(/<p>\s*\{statusDetails\}\s*<\/p>/g, '{statusDetails}');

    // The email goes out as one BCC message, so it can't be personalised
    body = body.replace(/\s*\{studentName\}/g, '');

    body = body
        .replace(/\{statusDetails\}/g, detailsHtml)
        .replace(/\{statusButton\}/g, buttonHtml)
        .replace(/\{statusLink\}/g, statusLink);

    return getEmailWrapper(body, 'status', config.includeLogosInEmails ?? false);
}

/** Build the status clarification email subject. */
export function buildStatusEmailSubject(customConfig?: AppConfig, audience: StatusEmailAudience = 'graduates'): string {
    const config = customConfig || getConfig();
    return audience === 'outreach'
        ? config.outreachEmailSubjectFormat || DEFAULT_CONFIG.outreachEmailSubjectFormat
        : config.statusEmailSubjectFormat;
}
