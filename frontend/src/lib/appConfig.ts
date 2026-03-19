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
      <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: -0.5px;">You're Invited!</h1>
      <p style="color: #e0f2fe; margin: 8px 0 0 0; font-size: 16px; font-weight: 500;">Cork City Partnership</p>
    </div>
    
    <!-- Body -->
    <div style="padding: 40px 32px;">
      <p style="margin-top: 0; margin-bottom: 20px; font-size: 16px; color: #374151; line-height: 1.6;">Hello!</p>
      
      <p style="margin-top: 0; margin-bottom: 24px; font-size: 16px; color: #374151; line-height: 1.6;">We have great news! We are delighted to invite you to participate in our upcoming course.</p>
      
      <!-- Course Details Box -->
      <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-left: 4px solid #0ea5e9; padding: 20px 24px; margin: 0 0 32px 0; border-radius: 6px;">
        <h2 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 600; color: #0369a1;">{courseTitle}</h2>
        <p style="margin: 0; font-size: 16px; color: #0c4a6e; font-weight: 500;">📅 Date: {date}</p>
      </div>
      
      <p style="margin-top: 0; margin-bottom: 16px; font-size: 16px; color: #374151; line-height: 1.6;">Spaces for this course are limited. To secure your place, please confirm your attendance by clicking the button below.</p>
      
      <!-- Deadline Alert -->
      <div style="background-color: #fffbeb; border-radius: 6px; padding: 16px; margin-bottom: 32px; border: 1px solid #fde68a;">
        <p style="margin: 0; font-size: 15px; color: #92400e; font-weight: 600; text-align: center;">
          ⏳ Action Required: Please confirm within 7 days of receiving this email to guarantee your spot.
        </p>
      </div>
      
      <div style="text-align: center; margin: 40px 0;">
        {confirmationButton}
      </div>
      
      <p style="margin-top: 0; margin-bottom: 8px; font-size: 16px; color: #475569; line-height: 1.6;">We are very much looking forward to welcoming you.</p>
      <p style="margin: 0; font-size: 15px; color: #64748b; line-height: 1.6;">If you have any questions or are no longer able to attend, please don't hesitate to reach out to us.</p>
    </div>
    
    <!-- Footer -->
    <div style="background-color: #f8fafc; padding: 24px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="margin: 0; font-size: 14px; color: #64748b; font-weight: 500;">Cork City Partnership</p>
      <p style="margin: 8px 0 0 0; font-size: 13px; color: #94a3b8;">© 2026 All rights reserved.</p>
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
