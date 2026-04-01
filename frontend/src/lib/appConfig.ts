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
    /** HTML Email body template for status clarification. Supports: {firstName}, {statusButton}, {statusLink} */
    statusEmailTemplate: string;
    /** Email subject for status clarification emails */
    statusEmailSubjectFormat: string;
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
    htmlEmailTemplate: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; padding: 16px 12px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
    <!-- Header -->
    <div style="background-color: #0ea5e9; padding: 18px 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">You're Invited!</h1>
    </div>
    
    <!-- Body -->
    <div style="padding: 20px 24px;">
      <p style="margin: 0 0 12px 0; font-size: 15px; color: #374151; line-height: 1.5;">You've been invited to join an upcoming course:</p>
      
      <!-- Course Details Box -->
      <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-left: 4px solid #0ea5e9; padding: 14px 18px; margin: 0 0 16px 0; border-radius: 6px;">
        <h2 style="margin: 0 0 4px 0; font-size: 18px; font-weight: 700; color: #0369a1;">{courseTitle}</h2>
        <p style="margin: 0; font-size: 15px; color: #0c4a6e; font-weight: 500;">🗓️ Date: {date}</p>
      </div>
      
      <p style="margin: 0 0 16px 0; font-size: 15px; color: #374151; line-height: 1.5;">Spaces are limited — please confirm within <strong>7 days</strong>.</p>
      
      <div style="text-align: center; margin: 0 0 16px 0; padding: 16px 0; background-color: #f0fdf4; border-radius: 8px; border: 2px dashed #059669;">
        <p style="margin: 0 0 12px 0; font-size: 16px; font-weight: 700; color: #059669;">👇 TAP THE BUTTON TO CONFIRM 👇</p>
        {confirmationButton}
      </div>
      
      <p style="margin: 0; font-size: 13px; color: #94a3b8; line-height: 1.5; text-align: center;">Questions? Simply reply to this email.</p>
    </div>
  </div>
</div>`,
    emailSubjectFormat: 'You are Invited to join our {courseName} course which will take place on {date}',
    dateFormat: 'en-IE',
    excelColumns: DEFAULT_EXCEL_COLUMNS,
    statusEmailTemplate: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; padding: 16px 12px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
    <!-- Header -->
    <div style="background-color: #7c3aed; padding: 18px 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Quick Status Update</h1>
    </div>
    
    <!-- Body -->
    <div style="padding: 20px 24px;">
      <p style="margin: 0 0 12px 0; font-size: 15px; color: #374151; line-height: 1.5;">Hi {firstName},</p>
      <p style="margin: 0 0 12px 0; font-size: 15px; color: #374151; line-height: 1.5;">We hope you're doing well! As a graduate of our programme, we'd love to hear how things are going for you.</p>
      <p style="margin: 0 0 16px 0; font-size: 15px; color: #374151; line-height: 1.5;">Could you take 30 seconds to let us know your current employment status? This helps us understand the impact of our courses and improve our programmes.</p>
      
      <div style="text-align: center; margin: 0 0 16px 0; padding: 16px 0; background-color: #f5f3ff; border-radius: 8px; border: 2px dashed #7c3aed;">
        <p style="margin: 0 0 12px 0; font-size: 16px; font-weight: 700; color: #7c3aed;">👇 TAP THE BUTTON BELOW 👇</p>
        {statusButton}
      </div>
      
      <p style="margin: 0 0 8px 0; font-size: 13px; color: #94a3b8; line-height: 1.5; text-align: center;">This link will expire in 7 days.</p>
      <p style="margin: 0; font-size: 13px; color: #94a3b8; line-height: 1.5; text-align: center;">Your information is confidential and used only for internal statistics.</p>
    </div>
  </div>
</div>`,
    statusEmailSubjectFormat: 'Quick Status Update — How are things going?',
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

/** Build the status clarification email body HTML. */
export function buildStatusEmailBodyHtml(firstName: string, statusLink: string): string {
    const config = getConfig();
    const buttonHtml = `<table border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto; width: auto;"><tr><td align="center" bgcolor="#7c3aed" style="background-color: #7c3aed; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);"><a href="${statusLink}" target="_blank" style="display: inline-block; font-size: 18px; font-weight: 700; color: #ffffff; text-decoration: none; padding: 16px 36px; border: 1px solid #7c3aed; border-radius: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">📝 Update My Status</a></td></tr></table>`;

    return config.statusEmailTemplate
        .replace(/\{firstName\}/g, firstName)
        .replace(/\{statusLink\}/g, statusLink)
        .replace(/\{statusButton\}/g, buttonHtml);
}

/** Build the status clarification email subject. */
export function buildStatusEmailSubject(): string {
    const config = getConfig();
    return config.statusEmailSubjectFormat;
}
