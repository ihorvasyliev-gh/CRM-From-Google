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
    htmlEmailTemplate: `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title></title>
  <!--[if mso]>
  <style>
    table {border-collapse:collapse;border-spacing:0;border:none;margin:0;}
    div, td {padding:0;}
    div {margin:0 !important;}
  </style>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .hero-gradient { background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%); }
    .shadow { box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1); }
  </style>
</head>
<body style="margin:0;padding:0;word-spacing:normal;background-color:#f4f7f6;">
  <div role="article" aria-roledescription="email" lang="en" style="text-size-adjust:100%;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;background-color:#f4f7f6;padding:40px 0;">
    <table role="presentation" style="width:100%;border:none;border-spacing:0;">
      <tr>
        <td align="center" style="padding:0;">
          <!--[if mso]>
          <table role="presentation" align="center" style="width:600px;">
          <tr>
          <td>
          <![endif]-->
          <table role="presentation" class="shadow" style="width:94%;max-width:600px;border:none;border-spacing:0;text-align:left;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:22px;color:#363636;background-color:#ffffff;border-radius:16px;overflow:hidden;">
            <!-- Logos -->
            <tr>
              <td style="padding:24px 32px;text-align:center;background-color:#ffffff;border-bottom:1px solid #f0f0f0;">
                <img src="{origin}/logos-banner.png" alt="Cork City Partnership — Government of Ireland, EU Co-Funded, SICAP" style="width:100%;max-width:500px;height:auto;border:none;text-decoration:none;color:#ffffff;">
              </td>
            </tr>
            <!-- Hero -->
            <tr>
              <td class="hero-gradient" style="padding:48px 32px;text-align:center;background-color:#2563eb;">
                <h1 style="margin:0;font-size:32px;font-weight:800;color:#ffffff;letter-spacing:-1px;">You're Invited!</h1>
                <p style="margin:12px 0 0 0;font-size:18px;color:#e0e7ff;font-weight:500;">Cork City Partnership course invitation</p>
              </td>
            </tr>
            <!-- Content -->
            <tr>
              <td style="padding:40px 32px;">
                <p style="margin:0 0 24px 0;font-size:17px;color:#4b5563;line-height:1.6;">Hello,</p>
                <p style="margin:0 0 32px 0;font-size:17px;color:#4b5563;line-height:1.6;">We are delighted to invite you to join our upcoming course. Please review the details below and confirm your attendance.</p>
                
                <!-- Course Details Card -->
                <table role="presentation" style="width:100%;border:none;border-spacing:0;margin-bottom:32px;">
                  <tr>
                    <td style="padding:24px;background-color:#f8fafc;border-radius:12px;border-left:4px solid #2563eb;">
                      <p style="margin:0 0 8px 0;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:700;">Course Title</p>
                      <p style="margin:0 0 16px 0;font-size:22px;color:#0f172a;font-weight:800;">{courseTitle}</p>
                      <p style="margin:0 0 8px 0;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:700;">Date & Time</p>
                      <p style="margin:0;font-size:18px;color:#334155;font-weight:600;">{date}</p>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 32px 0;font-size:16px;color:#64748b;text-align:center;">Spaces are limited, please let us know within <strong>7 days</strong>.</p>
                
                <!-- Action Button Container -->
                <table role="presentation" style="width:100%;border:none;border-spacing:0;margin-bottom:24px;">
                  <tr>
                    <td align="center" style="padding:0;">
                      {confirmationButton}
                    </td>
                  </tr>
                </table>
                
                <p style="margin:0;font-size:15px;color:#94a3b8;line-height:1.6;text-align:center;">If you have any questions, simply reply to this email.</p>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="padding:32px;text-align:center;background-color:#f8fafc;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-size:13px;color:#64748b;font-weight:600;letter-spacing:0.5px;">CORK CITY PARTNERSHIP CLG</p>
                <p style="margin:8px 0 0 0;font-size:13px;color:#94a3b8;">Education | Employment | Empowerment</p>
              </td>
            </tr>
          </table>
          <!--[if mso]>
          </td>
          </tr>
          </table>
          <![endif]-->
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`,
    emailSubjectFormat: 'You are Invited to join our {courseName} course which will take place on {date}',
    dateFormat: 'en-IE',
    excelColumns: DEFAULT_EXCEL_COLUMNS,
    statusEmailTemplate: `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title></title>
  <!--[if mso]>
  <style>
    table {border-collapse:collapse;border-spacing:0;border:none;margin:0;}
    div, td {padding:0;}
    div {margin:0 !important;}
  </style>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .hero-gradient { background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); }
    .shadow { box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1); }
  </style>
</head>
<body style="margin:0;padding:0;word-spacing:normal;background-color:#f5f3ff;">
  <div role="article" aria-roledescription="email" lang="en" style="text-size-adjust:100%;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;background-color:#f5f3ff;padding:40px 0;">
    <table role="presentation" style="width:100%;border:none;border-spacing:0;">
      <tr>
        <td align="center" style="padding:0;">
          <!--[if mso]>
          <table role="presentation" align="center" style="width:600px;">
          <tr>
          <td>
          <![endif]-->
          <table role="presentation" class="shadow" style="width:94%;max-width:600px;border:none;border-spacing:0;text-align:left;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:22px;color:#363636;background-color:#ffffff;border-radius:16px;overflow:hidden;">
            <!-- Logos -->
            <tr>
              <td style="padding:24px 32px;text-align:center;background-color:#ffffff;border-bottom:1px solid #f0f0f0;">
                <img src="{origin}/logos-banner.png" alt="Cork City Partnership — Government of Ireland, EU Co-Funded, SICAP" style="width:100%;max-width:500px;height:auto;border:none;text-decoration:none;color:#ffffff;">
              </td>
            </tr>
            <!-- Hero -->
            <tr>
              <td class="hero-gradient" style="padding:48px 32px;text-align:center;background-color:#6d28d9;">
                <h1 style="margin:0;font-size:30px;font-weight:800;color:#ffffff;letter-spacing:-1px;">Quick Status Update</h1>
                <p style="margin:12px 0 0 0;font-size:18px;color:#ddd6fe;font-weight:500;">How are things going?</p>
              </td>
            </tr>
            <!-- Content -->
            <tr>
              <td style="padding:40px 32px;">
                <p style="margin:0 0 20px 0;font-size:17px;color:#4b5563;line-height:1.6;">Hello from <strong>Cork City Partnership</strong>,</p>
                <p style="margin:0 0 20px 0;font-size:17px;color:#4b5563;line-height:1.6;">We hope you're doing well! As a recent participant in our programmes, we'd love to hear how things are going for you.</p>
                <p style="margin:0 0 32px 0;font-size:17px;color:#4b5563;line-height:1.6;">Could you take 30 seconds to let us know your current status? This helps us understand the impact of our courses and continue improving our offerings.</p>
                
                <!-- Action Button Container -->
                <table role="presentation" style="width:100%;border:none;border-spacing:0;margin-bottom:32px;">
                  <tr>
                    <td align="center" style="padding:32px 24px;background-color:#faf5ff;border-radius:16px;border:1px solid #f3e8ff;">
                      <p style="margin:0 0 20px 0;font-size:15px;color:#7c3aed;font-weight:700;text-transform:uppercase;letter-spacing:1px;">👇 Tap below to update 👇</p>
                      {statusButton}
                    </td>
                  </tr>
                </table>
                
                <p style="margin:0;font-size:14px;color:#94a3b8;line-height:1.6;text-align:center;">Your information is confidential and used only for internal statistics.</p>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="padding:32px;text-align:center;background-color:#faf5ff;border-top:1px solid #f3e8ff;">
                <p style="margin:0;font-size:13px;color:#6b7280;font-weight:600;letter-spacing:0.5px;">CORK CITY PARTNERSHIP CLG</p>
                <p style="margin:8px 0 0 0;font-size:13px;color:#9ca3af;">Education | Employment | Empowerment</p>
              </td>
            </tr>
          </table>
          <!--[if mso]>
          </td>
          </tr>
          </table>
          <![endif]-->
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`,
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
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const linkStr = confirmationLink || '#';
    const buttonHtml = confirmationLink
        ? `<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${linkStr}" style="height:56px;v-text-anchor:middle;width:280px;" arcsize="15%" stroke="f" fillcolor="#2563eb">
<w:anchorlock/>
<center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">Confirm My Place</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<a href="${linkStr}" target="_blank" style="display:inline-block;padding:16px 36px;background-color:#2563eb;color:#ffffff;font-size:18px;font-weight:700;text-decoration:none;border-radius:12px;box-shadow:0 4px 6px -1px rgba(37,99,235,0.2), 0 2px 4px -1px rgba(37,99,235,0.1);letter-spacing:0.5px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">Confirm My Place</a>
<!--<![endif]-->`
        : '';
        
    return config.htmlEmailTemplate
        .replace(/\{origin\}/g, origin)
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
export function buildStatusEmailBodyHtml(statusLink: string): string {
    const config = getConfig();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const buttonHtml = `<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${statusLink}" style="height:56px;v-text-anchor:middle;width:280px;" arcsize="15%" stroke="f" fillcolor="#7c3aed">
<w:anchorlock/>
<center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">Update My Status</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<a href="${statusLink}" target="_blank" style="display:inline-block;padding:16px 36px;background-color:#7c3aed;color:#ffffff;font-size:18px;font-weight:700;text-decoration:none;border-radius:12px;box-shadow:0 4px 6px -1px rgba(124,58,237,0.2), 0 2px 4px -1px rgba(124,58,237,0.1);letter-spacing:0.5px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">Update My Status</a>
<!--<![endif]-->`;

    return config.statusEmailTemplate
        .replace(/\{origin\}/g, origin)
        .replace(/\{statusLink\}/g, statusLink)
        .replace(/\{statusButton\}/g, buttonHtml);
}

/** Build the status clarification email subject. */
export function buildStatusEmailSubject(): string {
    const config = getConfig();
    return config.statusEmailSubjectFormat;
}
