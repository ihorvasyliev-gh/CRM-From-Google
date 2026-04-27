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
    /** HTML Email body template for status clarification. Supports: {statusButton}, {statusLink} */
    statusEmailTemplate: string;
    /** Email subject for status clarification emails */
    statusEmailSubjectFormat: string;
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

export const DEFAULT_CONFIG: AppConfig = {
    htmlEmailTemplate: `<p style="margin:0 0 24px 0;font-size:17px;color:#4b5563;line-height:1.6;">Hello,</p>
<p style="margin:0 0 32px 0;font-size:17px;color:#4b5563;line-height:1.6;">We are delighted to invite you to join our upcoming course. Please review the details below and confirm your attendance.</p>
{courseDetails}
<p style="margin:0 0 32px 0;font-size:16px;color:#64748b;text-align:center;">Spaces are limited, please let us know within <strong>7 days</strong>.</p>
{confirmationButton}
<p style="margin:0;font-size:15px;color:#94a3b8;line-height:1.6;text-align:center;">If you have any questions, simply reply to this email.</p>`,
    emailSubjectFormat: 'You are Invited to join our {courseName} course which will take place on {date}',
    dateFormat: 'en-IE',
    excelColumns: DEFAULT_EXCEL_COLUMNS,
    statusEmailTemplate: `<p style="margin:0 0 20px 0;font-size:17px;color:#4b5563;line-height:1.6;">Hello from <strong>Cork City Partnership</strong>,</p>
<p style="margin:0 0 20px 0;font-size:17px;color:#4b5563;line-height:1.6;">We hope you're doing well! As a recent participant in our programmes, we'd love to hear how things are going for you.</p>
<p style="margin:0 0 32px 0;font-size:17px;color:#4b5563;line-height:1.6;">Could you take 30 seconds to let us know your current status? This helps us understand the impact of our courses and continue improving our offerings.</p>
{statusButton}
<p style="margin:0;font-size:14px;color:#94a3b8;line-height:1.6;text-align:center;">Your information is confidential and used only for internal statistics.</p>`,
    statusEmailSubjectFormat: 'Quick Status Update — How are things going?',
    includeLogosInEmails: true,
};

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

function getEmailWrapper(content: string, type: 'invite' | 'status', includeLogos: boolean) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    
    const isInvite = type === 'invite';
    const heroBg = '#ffffff';
    const heroTitle = isInvite ? "You're Invited!" : "Quick Status Update";
    const heroSubtitle = isInvite ? "Cork City Partnership course invitation" : "How are things going?";
    const titleColor = '#0f172a';
    const subtitleColor = '#64748b';
    const heroPadding = '24px 32px 8px 32px';
    const titleSize = '24px';
    const cacheBuster = Date.now();

    const logoHtml = includeLogos ? `
            <!-- Logos -->
            <tr>
              <td style="padding:24px 32px;text-align:center;background-color:#ffffff;border-bottom:1px solid #f0f0f0;">
                <img src="${origin}/logos-banner.png?v=${cacheBuster}" alt="Cork City Partnership — Government of Ireland, EU Co-Funded, SICAP" width="500" style="width:100%;max-width:500px;height:auto;border:none;text-decoration:none;color:#ffffff;">
              </td>
            </tr>` : '';
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title></title>
</head>
<body style="margin:0;padding:0;word-spacing:normal;background-color:#f4f7f6;">
  <div role="article" aria-roledescription="email" lang="en" style="text-size-adjust:100%;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;background-color:#f4f7f6;padding:40px 0;">
    <table role="presentation" style="width:100%;border:none;border-spacing:0;">
      <tr>
        <td align="center" style="padding:0;">
          <table role="presentation" width="600" style="width:600px;max-width:100%;border:none;border-spacing:0;text-align:left;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:22px;color:#363636;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);">${logoHtml}
            <!-- Hero -->
            <tr>
              <td bgcolor="${heroBg}" style="padding:${heroPadding};text-align:center;background-color:${heroBg};">
                <h1 style="margin:0;font-size:${titleSize};font-weight:800;color:${titleColor};letter-spacing:-1px;">${heroTitle}</h1>
                <p style="margin:12px 0 0 0;font-size:18px;color:${subtitleColor};font-weight:500;">${heroSubtitle}</p>
              </td>
            </tr>
            <!-- Content -->
            <tr>
              <td style="padding:32px 32px 40px 32px;">
                ${content}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
}

/** Build the email body HTML by replacing placeholders. */
export function buildEmailBodyHtml(courseTitle: string, date: string, confirmationLink?: string, customConfig?: AppConfig): string {
    const config = customConfig || getConfig();
    const linkStr = confirmationLink || '#';
    
    const courseDetailsHtml = `<!-- Course Details Card -->
<table role="presentation" style="width:100%;border:none;border-spacing:0;margin-bottom:32px;">
  <tr>
    <td bgcolor="#f8fafc" style="padding:24px;background-color:#f8fafc;border-radius:12px;border-left:4px solid #2563eb;">
      <p style="margin:0 0 8px 0;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:700;">Course Title</p>
      <p style="margin:0 0 16px 0;font-size:22px;color:#0f172a;font-weight:800;">${courseTitle}</p>
      <p style="margin:0 0 8px 0;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:700;">Date & Time</p>
      <p style="margin:0;font-size:18px;color:#334155;font-weight:600;">${date}</p>
    </td>
  </tr>
</table>`;

    const buttonHtml = confirmationLink
        ? `<!-- Action Button Container -->
<table role="presentation" style="width:100%;border:none;border-spacing:0;margin-bottom:24px;">
  <tr>
    <td align="center" style="padding:0;">
      <!-- Bulletproof Table Button -->
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td align="center" bgcolor="#2563eb" style="border-radius:12px;padding:16px 36px;box-shadow:0 4px 6px -1px rgba(37,99,235,0.2), 0 2px 4px -1px rgba(37,99,235,0.1);">
            <a href="${linkStr}" target="_blank" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:18px;font-weight:700;color:#ffffff;text-decoration:none;display:inline-block;letter-spacing:0.5px;">Confirm My Place</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
        : '';
        
    let body = config.htmlEmailTemplate;
    // Strip wrapping <p> tags ReactQuill might have added around placeholders
    body = body.replace(/<p>\s*\{courseDetails\}\s*<\/p>/g, '{courseDetails}');
    body = body.replace(/<p>\s*\{confirmationButton\}\s*<\/p>/g, '{confirmationButton}');
    
    body = body
        .replace(/\{courseDetails\}/g, courseDetailsHtml)
        .replace(/\{confirmationButton\}/g, buttonHtml);

    return getEmailWrapper(body, 'invite', config.includeLogosInEmails ?? true);
}

/** Build the email subject by replacing placeholders. */
export function buildEmailSubject(courseName: string, date: string, customConfig?: AppConfig): string {
    const config = customConfig || getConfig();
    return config.emailSubjectFormat
        .replace(/\{courseName\}/g, courseName)
        .replace(/\{date\}/g, date);
}

/** Build the status clarification email body HTML. */
export function buildStatusEmailBodyHtml(statusLink: string, customConfig?: AppConfig): string {
    const config = customConfig || getConfig();
    const buttonHtml = `<!-- Action Button Container -->
<table role="presentation" style="width:100%;border:none;border-spacing:0;margin-bottom:32px;">
  <tr>
    <td align="center" bgcolor="#faf5ff" style="padding:32px 24px;background-color:#faf5ff;border-radius:16px;border:1px solid #f3e8ff;">
      <p style="margin:0 0 20px 0;font-size:15px;color:#7c3aed;font-weight:700;text-transform:uppercase;letter-spacing:1px;">👇 Tap below to update 👇</p>
      <!-- Bulletproof Table Button -->
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td align="center" bgcolor="#7c3aed" style="border-radius:12px;padding:16px 36px;box-shadow:0 4px 6px -1px rgba(124,58,237,0.2), 0 2px 4px -1px rgba(124,58,237,0.1);">
            <a href="${statusLink}" target="_blank" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:18px;font-weight:700;color:#ffffff;text-decoration:none;display:inline-block;letter-spacing:0.5px;">Update My Status</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

    let body = config.statusEmailTemplate;
    // Strip wrapping <p> tags ReactQuill might have added around placeholders
    body = body.replace(/<p>\s*\{statusButton\}\s*<\/p>/g, '{statusButton}');
    
    body = body.replace(/\{statusButton\}/g, buttonHtml);

    return getEmailWrapper(body, 'status', config.includeLogosInEmails ?? true);
}

/** Build the status clarification email subject. */
export function buildStatusEmailSubject(customConfig?: AppConfig): string {
    const config = customConfig || getConfig();
    return config.statusEmailSubjectFormat;
}
