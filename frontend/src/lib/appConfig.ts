// ─── App Configuration (localStorage/Supabase-based) ───────────
// The user's settings (email templates and subjects, Excel columns, email style): defaults,
// upgrades of older saved versions, and the local copy synced to user_settings.
// Turning the templates into email HTML lives in emailTemplates.ts.
import { supabase } from './supabase';
import { BASE_EMAIL_FONT, DEFAULT_EMAIL_STYLE, normalizeEmailStyle, type EmailTextStyle } from './emailFormat';

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
    /** Same reminder, used instead when the course is tomorrow. Supports: {courseDetails}, {attendanceNotice} */
    reminderTomorrowEmailTemplate: string;
    /** Subject of the "course is tomorrow" reminder. Supports placeholders: {courseName}, {date} */
    reminderTomorrowEmailSubjectFormat: string;
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
    /** Base font, size and colour of every email's text */
    emailStyle: EmailTextStyle;
}

const STORAGE_KEY = 'crm_app_config';

const DEFAULT_EXCEL_COLUMNS: ExcelColumn[] = [
    { header: 'First Name', placeholder: 'firstName' },
    { header: 'Last Name', placeholder: 'lastName' },
    { header: 'Email', placeholder: 'email' },
    { header: 'Phone', placeholder: 'mobileNumber' },
    { header: 'Course', placeholder: 'courseTitle' },
    { header: 'Course Date', placeholder: 'courseDate' },
];

/** Font stack inlined into every email element (email clients ignore <style>). */
export const DEFAULT_CONFIG: AppConfig = {
    htmlEmailTemplate: `<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${BASE_EMAIL_FONT};">Hello,</p>
<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${BASE_EMAIL_FONT};">We are delighted to invite you to join our upcoming course. Please review the details below and confirm your suitability and attendance.</p>
<p style="margin:0 0 20px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${BASE_EMAIL_FONT};">Places on this course are <strong>limited</strong> and allocated on a first-come, first-served basis, so please confirm your suitability and attendance <strong>as soon as possible</strong> (and no later than <strong>{responseDays} days</strong>) by clicking the button below.</p>
{courseDetails}
{englishWarning}
{capacityNotice}
{confirmationButton}
<p style="margin:0 0 10px 0;font-size:15px;line-height:22px;color:#475569;font-family:${BASE_EMAIL_FONT};">If you have any questions, feel free to reply to this email. You can also let me know if:</p>
<ul style="margin:0 0 16px 0;padding-left:20px;font-size:14px;line-height:22px;color:#64748b;font-family:${BASE_EMAIL_FONT};">
  <li style="margin-bottom:4px;">You've already taken this course elsewhere</li>
  <li style="margin-bottom:4px;">You're not interested</li>
  <li>You’d prefer not to receive future emails</li>
</ul>`,
    htmlEmailTemplateStandard: `<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${BASE_EMAIL_FONT};">Hello,</p>
<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${BASE_EMAIL_FONT};">We are delighted to invite you to join our upcoming course. Please review the details below and confirm your attendance.</p>
<p style="margin:0 0 20px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${BASE_EMAIL_FONT};">Places on this course are <strong>limited</strong> and allocated on a first-come, first-served basis, so please confirm your attendance <strong>as soon as possible</strong> (and no later than <strong>{responseDays} days</strong>) by clicking the button below.</p>
{courseDetails}
{capacityNotice}
{confirmationButton}
<p style="margin:0 0 10px 0;font-size:15px;line-height:22px;color:#475569;font-family:${BASE_EMAIL_FONT};">If you have any questions, feel free to reply to this email. You can also let me know if:</p>
<ul style="margin:0 0 16px 0;padding-left:20px;font-size:14px;line-height:22px;color:#64748b;font-family:${BASE_EMAIL_FONT};">
  <li style="margin-bottom:4px;">You've already taken this course elsewhere</li>
  <li style="margin-bottom:4px;">You're not interested</li>
  <li>You’d prefer not to receive future emails</li>
</ul>`,
    emailSubjectFormat: 'You are Invited to join our {courseName} course which will take place on {date}',
    reminderEmailTemplate: `<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${BASE_EMAIL_FONT};">Hello,</p>
<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${BASE_EMAIL_FONT};">This is a friendly reminder that you have a place on our upcoming course. Please check the date, time and location below — we look forward to seeing you!</p>
{courseDetails}
{attendanceNotice}
<p style="margin:0 0 10px 0;font-size:15px;line-height:22px;color:#475569;font-family:${BASE_EMAIL_FONT};">If you have any questions, feel free to reply to this email.</p>`,
    reminderEmailSubjectFormat: 'Reminder: your {courseName} course on {date}',
    reminderTomorrowEmailTemplate: `<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${BASE_EMAIL_FONT};">Hello,</p>
<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${BASE_EMAIL_FONT};">Just a quick reminder that your course is <strong>tomorrow</strong>. Please check the date, time and location below and make sure you arrive on time — we look forward to seeing you!</p>
{courseDetails}
{attendanceNotice}
<p style="margin:0 0 10px 0;font-size:15px;line-height:22px;color:#475569;font-family:${BASE_EMAIL_FONT};">If you have any questions, feel free to reply to this email.</p>`,
    reminderTomorrowEmailSubjectFormat: 'Reminder: your {courseName} course is tomorrow ({date})',
    excelColumns: DEFAULT_EXCEL_COLUMNS,
    statusEmailTemplate: `<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${BASE_EMAIL_FONT};">Hello,</p>
<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${BASE_EMAIL_FONT};">We hope you are keeping well! You recently completed a course with <strong>Cork City Partnership</strong>, and we would love to hear how things have been going for you since then.</p>
<p style="margin:0 0 20px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${BASE_EMAIL_FONT};">Could you spare <strong>one minute</strong> to answer four quick questions? You can use the button below or simply reply to this email. Your answers help us see what difference our courses make and plan better ones for future participants.</p>
{statusDetails}
{statusButton}
<p style="margin:0 0 16px 0;font-size:15px;line-height:22px;color:#475569;font-family:${BASE_EMAIL_FONT};"><strong>Prefer not to use the link?</strong> Simply reply to this email with your answers to the questions above — that works just as well.</p>
<p style="margin:0 0 10px 0;font-size:15px;line-height:22px;color:#475569;font-family:${BASE_EMAIL_FONT};">Whether you are working or not yet, every answer counts. If you are still looking for work or another course, let us know in your reply — we are happy to help.</p>
<p style="margin:0 0 16px 0;font-size:13px;line-height:19px;color:#64748b;font-family:${BASE_EMAIL_FONT};">Your answers are confidential and only used, anonymously, to report on the results of our programmes.</p>`,
    statusEmailSubjectFormat: 'How are things going since your course? (1-minute update)',
    outreachEmailTemplate: `<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${BASE_EMAIL_FONT};">Hello,</p>
<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${BASE_EMAIL_FONT};">We hope you are keeping well! You have been supported by <strong>Cork City Partnership</strong>, and we would love to hear how things are going for you now.</p>
<p style="margin:0 0 20px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:${BASE_EMAIL_FONT};">Could you spare <strong>one minute</strong> to answer four quick questions? You can use the button below or simply reply to this email. Your answers help us see what difference our support makes and plan better services for the people we work with.</p>
{statusDetails}
{statusButton}
<p style="margin:0 0 16px 0;font-size:15px;line-height:22px;color:#475569;font-family:${BASE_EMAIL_FONT};"><strong>Prefer not to use the link?</strong> Simply reply to this email with your answers to the questions above — that works just as well.</p>
<p style="margin:0 0 10px 0;font-size:15px;line-height:22px;color:#475569;font-family:${BASE_EMAIL_FONT};">Whether you are working or not yet, every answer counts. If you are still looking for work or a course, let us know in your reply — we are happy to help.</p>
<p style="margin:0 0 16px 0;font-size:13px;line-height:19px;color:#64748b;font-family:${BASE_EMAIL_FONT};">Your answers are confidential and only used, anonymously, to report on the results of our programmes.</p>`,
    outreachEmailSubjectFormat: 'How are things going? (1-minute update from Cork City Partnership)',
    includeLogosInEmails: false,
    emailStyle: DEFAULT_EMAIL_STYLE,
};

/** Invitation-type templates are useless without the confirm button or link. */
export function hasConfirmationTag(tpl: string): boolean {
    return tpl.includes('{confirmationButton}') || tpl.includes('{confirmationLink}');
}

/** 'reminder' is the usual attendance reminder; 'reminder_tomorrow' goes out the day before the course. */
export type InviteEmailKind = 'invite' | 'reminder' | 'reminder_tomorrow';

/**
 * Brings a config saved by an older version up to date (templates broken by the old editor,
 * reworded sentences, superseded defaults). Mutates and returns `saved`.
 */
function migrateSavedConfig(saved: Partial<AppConfig>): Partial<AppConfig> {
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

    return saved;
}

/** The stored string last read and its migrated JSON: the migrations run once per change, not on every read. */
let migratedCache: { raw: string; json: string } | null = null;

/** Read the full config, merging saved values over defaults. */
export function getConfig(): AppConfig {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_CONFIG };
        if (migratedCache?.raw !== raw) {
            migratedCache = { raw, json: JSON.stringify(migrateSavedConfig(JSON.parse(raw) as Partial<AppConfig>)) };
        }
        // Parsed per call, so callers never share (and can't change) each other's objects
        const saved = JSON.parse(migratedCache.json) as Partial<AppConfig>;
        return { ...DEFAULT_CONFIG, ...saved, emailStyle: normalizeEmailStyle(saved.emailStyle) };
    } catch {
        return { ...DEFAULT_CONFIG };
    }
}

/** Replace the locally stored config with the copy saved on the server (on sign-in). */
export function storeServerConfig(settings: unknown): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** Forget the locally stored config (on sign-out), without touching the server copy. */
export function clearStoredConfig(): void {
    localStorage.removeItem(STORAGE_KEY);
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
