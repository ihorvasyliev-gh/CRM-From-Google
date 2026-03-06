// ─── App Configuration (localStorage-based) ────────────────────
// Centralized config for email templates, display preferences, etc.

export interface AppConfig {
    /** HTML Email body template. Supports placeholders: {courseTitle}, {date}, {confirmationButton}, {confirmationLink} */
    htmlEmailTemplate: string;
    /** Email subject format. Supports placeholders: {courseName}, {date} */
    emailSubjectFormat: string;
    /** Date display format across the app */
    dateFormat: 'en-IE' | 'en-US' | 'ISO';
}

const STORAGE_KEY = 'crm_app_config';

export const DEFAULT_CONFIG: AppConfig = {
    htmlEmailTemplate: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
    <!-- Header -->
    <div style="background-color: #0ea5e9; padding: 40px 32px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">Cork City Partnership</h1>
    </div>
    
    <!-- Body -->
    <div style="padding: 40px 32px;">
      <p style="margin-top: 0; margin-bottom: 16px; font-size: 16px; color: #374151; line-height: 1.6;">Hello!</p>
      
      <p style="margin-top: 0; margin-bottom: 16px; font-size: 16px; color: #374151; line-height: 1.6;">I hope this email finds you well. I'm delighted to invite you to participate in our upcoming course:</p>
      
      <div style="background-color: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 16px 24px; margin: 24px 0; border-radius: 0 8px 8px 0;">
        <p style="margin: 0; font-size: 18px; font-weight: 600; color: #0369a1;">{courseTitle}</p>
        <p style="margin: 4px 0 0 0; font-size: 15px; color: #0c4a6e;">Date: {date}</p>
      </div>
      
      <p style="margin-top: 0; margin-bottom: 24px; font-size: 16px; color: #374151; line-height: 1.6;">We would be thrilled to have you join us! Please note that spaces for this course are limited, so we encourage you to confirm your participation as soon as possible.</p>
      
      <div style="text-align: center; margin: 32px 0;">
        {confirmationButton}
      </div>
      
      <p style="margin-top: 0; margin-bottom: 0; font-size: 16px; color: #374151; line-height: 1.6;">We look forward to having you join us. If you have any questions, please don't hesitate to reach out.</p>
    </div>
    
    <!-- Footer -->
    <div style="background-color: #f9fafb; padding: 24px 32px; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="margin: 0; font-size: 13px; color: #6b7280;">© 2026 Cork City Partnership. All rights reserved.</p>
    </div>
  </div>
</div>`,
    emailSubjectFormat: '{courseName} — {date}',
    dateFormat: 'en-IE',
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
        ? `<table border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto; width: auto;"><tr><td align="center" bgcolor="#0ea5e9" style="background-color: #0ea5e9; border-radius: 8px;"><a href="${linkStr}" target="_blank" style="display: inline-block; font-size: 16px; font-weight: bold; color: #ffffff; text-decoration: none; padding: 14px 28px; border: 1px solid #0ea5e9; border-radius: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Confirm Participation</a></td></tr></table>`
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
