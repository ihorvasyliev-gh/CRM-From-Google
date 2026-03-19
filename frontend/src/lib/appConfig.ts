// ─── App Configuration (localStorage-based) ────────────────────
// Centralized config for email templates, display preferences, etc.

export interface ExcelColumn {
    /** Column header text shown in the Excel file */
    header: string;
    /** Placeholder key from the same set used by Word templates (e.g. 'firstName', 'email') */
    placeholder: string;
}

export interface AppConfig {
    /** HTML Email body template. Supports placeholders: {courseTitle}, {date}, {confirmationButton}, {confirmationLink} */
    htmlEmailTemplate: string;
    /** Email subject format. Supports placeholders: {courseName}, {date} */
    emailSubjectFormat: string;
    /** Date display format across the app */
    dateFormat: 'en-IE' | 'en-US' | 'ISO';
    /** Columns to include in the Excel spreadsheet exported with the archive */
    excelColumns: ExcelColumn[];
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

export const DEFAULT_CONFIG: AppConfig = {
    htmlEmailTemplate: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
    <!-- Header -->
    <div style="background-color: #0ea5e9; padding: 32px 32px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">You're Invited!</h1>
    </div>
    
    <!-- Body -->
    <div style="padding: 40px 32px;">
      <p style="margin-top: 0; margin-bottom: 20px; font-size: 16px; color: #374151; line-height: 1.6;">Hello!</p>
      
      <p style="margin-top: 0; margin-bottom: 24px; font-size: 16px; color: #374151; line-height: 1.6;">We are thrilled to invite you to our upcoming course. Join us to expand your skills and knowledge:</p>
      
      <!-- Course Details Box -->
      <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-left: 4px solid #0ea5e9; padding: 20px 24px; margin: 0 0 32px 0; border-radius: 6px;">
        <h2 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: #0369a1;">{courseTitle}</h2>
        <p style="margin: 0; font-size: 16px; color: #0c4a6e; font-weight: 500;">🗓️ Date: {date}</p>
      </div>
      
      <p style="margin-top: 0; margin-bottom: 8px; font-size: 16px; color: #374151; line-height: 1.6; font-weight: 600;">Secure your spot today!</p>
      <p style="margin-top: 0; margin-bottom: 32px; font-size: 16px; color: #374151; line-height: 1.6;">Spaces are strictly limited. To guarantee your participation, please confirm your attendance within 7 days of receiving this email.</p>
      
      <p style="margin-top: 0; margin-bottom: 20px; font-size: 18px; font-weight: 700; color: #111827; text-align: center;">👇 Please click the button below to register:</p>
      
      <div style="text-align: center; margin: 0 0 40px 0;">
        {confirmationButton}
      </div>
      
      <p style="margin-top: 0; margin-bottom: 8px; font-size: 16px; color: #475569; line-height: 1.6;">We look forward to welcoming you!</p>
      <p style="margin: 0; font-size: 15px; color: #64748b; line-height: 1.6;">If you have any questions or can no longer attend, please don't hesitate to reach out.</p>
    </div>
  </div>
</div>`,
    emailSubjectFormat: '{courseName} — {date}',
    dateFormat: 'en-IE',
    excelColumns: DEFAULT_EXCEL_COLUMNS,
};

/** Read the full config, merging saved values over defaults. */
export function getConfig(): AppConfig {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_CONFIG };
        const saved = JSON.parse(raw) as Partial<AppConfig>;
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
    return merged;
}

/** Reset config to defaults. */
export function resetConfig(): AppConfig {
    localStorage.removeItem(STORAGE_KEY);
    return { ...DEFAULT_CONFIG };
}

/** Build the email body HTML by replacing placeholders. */
export function buildEmailBodyHtml(courseTitle: string, date: string, confirmationLink?: string): string {
    const config = getConfig();
    const linkStr = confirmationLink || '#';
    const buttonHtml = confirmationLink
        ? `<table border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto; width: auto;"><tr><td align="center" bgcolor="#059669" style="background-color: #059669; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);"><a href="${linkStr}" target="_blank" style="display: inline-block; font-size: 18px; font-weight: 700; color: #ffffff; text-decoration: none; padding: 16px 36px; border: 1px solid #059669; border-radius: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">✓ Confirm My Participation</a></td></tr></table>`
        : '';
        
    return config.htmlEmailTemplate
        .replace(/\{courseTitle\}/g, courseTitle)
        .replace(/\{date\}/g, date)
        .replace(/\{confirmationLink\}/g, linkStr)
        .replace(/\{confirmationButton\}/g, buttonHtml);
}

/** Build the email subject by replacing placeholders. */
export function buildEmailSubject(courseName: string, date: string): string {
    const config = getConfig();
    return config.emailSubjectFormat
        .replace(/\{courseName\}/g, courseName)
        .replace(/\{date\}/g, date);
}
