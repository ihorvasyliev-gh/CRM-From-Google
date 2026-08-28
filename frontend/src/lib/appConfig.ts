// ─── App Configuration (localStorage/Supabase-based) ───────────
// Centralized config for email templates, display preferences, etc.
import { supabase } from './supabase';

export interface ExcelColumn {
    /** Column header text shown in the Excel file */
    header: string;
    /** Placeholder key from the same set used by Word templates (e.g. 'firstName', 'email') */
    placeholder: string;
}

export interface AppConfig {
    /** HTML Email body template for courses requiring high English. Supports placeholders: {courseDetails}, {confirmationButton}, {confirmationLink}, {responseDays} */
    htmlEmailTemplate: string;
    /** HTML Email body template for standard courses. Supports placeholders: {courseDetails}, {confirmationButton}, {confirmationLink}, {responseDays} */
    htmlEmailTemplateStandard: string;
    /** Email subject format. Supports placeholders: {courseName}, {date} */
    emailSubjectFormat: string;
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
    htmlEmailTemplate: `<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:Arial,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Hello,</p>
<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:Arial,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">We are delighted to invite you to join our upcoming course. Please review the details below and confirm your suitability and attendance.</p>
<p style="margin:0 0 20px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:Arial,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Spaces are limited, so please confirm your suitability and attendance within <strong>{responseDays} days</strong> by clicking the button below or replying to this email.</p>
{courseDetails}
{englishWarning}
{confirmationButton}
<p style="margin:0 0 10px 0;font-size:15px;line-height:22px;color:#475569;font-family:Arial,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">If you have any questions, feel free to reply to this email. You can also let me know if:</p>
<ul style="margin:0 0 16px 0;padding-left:20px;font-size:14px;line-height:22px;color:#64748b;font-family:Arial,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <li style="margin-bottom:4px;">You've already taken this course elsewhere</li>
  <li style="margin-bottom:4px;">You're not interested</li>
  <li>You’d prefer not to receive future emails</li>
</ul>`,
    htmlEmailTemplateStandard: `<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:Arial,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Hello,</p>
<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:Arial,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">We are delighted to invite you to join our upcoming course. Please review the details below and confirm your attendance.</p>
<p style="margin:0 0 20px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:Arial,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Spaces are limited, so please confirm your attendance within <strong>{responseDays} days</strong> by clicking the button below or replying to this email.</p>
{courseDetails}
{confirmationButton}
<p style="margin:0 0 10px 0;font-size:15px;line-height:22px;color:#475569;font-family:Arial,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">If you have any questions, feel free to reply to this email. You can also let me know if:</p>
<ul style="margin:0 0 16px 0;padding-left:20px;font-size:14px;line-height:22px;color:#64748b;font-family:Arial,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <li style="margin-bottom:4px;">You've already taken this course elsewhere</li>
  <li style="margin-bottom:4px;">You're not interested</li>
  <li>You’d prefer not to receive future emails</li>
</ul>`,
    emailSubjectFormat: 'You are Invited to join our {courseName} course which will take place on {date}',
    excelColumns: DEFAULT_EXCEL_COLUMNS,
    statusEmailTemplate: `<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:Arial,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Hello from <strong>Cork City Partnership</strong>,</p>
<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:Arial,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">We hope you're doing well! As a recent participant in our programmes, we'd love to hear how things are going for you.</p>
<p style="margin:0 0 24px 0;font-size:16px;line-height:24px;color:#1e293b;font-family:Arial,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Could you take 30 seconds to let us know your current status? This helps us understand the impact of our courses and continue improving our offerings.</p>
{statusButton}
<p style="margin:0;font-size:13px;line-height:18px;color:#94a3b8;font-family:Arial,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Your information is confidential and used only for internal statistics.</p>`,
    statusEmailSubjectFormat: 'Quick Status Update — How are things going?',
    includeLogosInEmails: false,
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

        if (!saved.htmlEmailTemplateStandard || (!saved.htmlEmailTemplateStandard.includes('{confirmationButton}') && !saved.htmlEmailTemplateStandard.includes('{confirmationLink}'))) {
            saved.htmlEmailTemplateStandard = DEFAULT_CONFIG.htmlEmailTemplateStandard;
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
        if (!color) return match;
        
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

function getEmailWrapper(content: string, type: 'invite' | 'status', includeLogos: boolean) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    
    const isInvite = type === 'invite';
    const heroTitle = isInvite ? "You're Invited!" : "Quick Status Update";
    const heroSubtitle = isInvite ? "Cork City Partnership course invitation" : "How are things going?";
    const cacheBuster = Date.now();

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
    a { color: ${isInvite ? '#2563eb' : '#7c3aed'}; text-decoration: underline; }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif; font-size: 16px; line-height: 24px; color: #1e293b;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
    <tr>
      <td align="left" style="padding: 10px 0; font-family: Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif; font-size: 16px; line-height: 24px; color: #1e293b;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
          ${logoHtml}
          <!-- Hero -->
          <tr>
            <td align="left" style="padding: 8px 0 16px 0; font-family: Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif;">
              <div style="font-size: 22px; font-weight: bold; color: #0f172a; line-height: 28px; margin: 0 0 4px 0;">${heroTitle}</div>
              <div style="font-size: 15px; color: #64748b; line-height: 20px; margin: 0;">${heroSubtitle}</div>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td align="left" style="padding: 8px 0; font-family: Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif; font-size: 16px; line-height: 24px; color: #1e293b;">
              ${content}
            </td>
          </tr>
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

/** Build the email body HTML by replacing placeholders. */
export function buildEmailBodyHtml(
    courseTitle: string, 
    date: string, 
    confirmationLink?: string, 
    customConfig?: AppConfig, 
    responseDays?: number,
    requiresEnglish: boolean = false
): string {
    const config = customConfig || getConfig();
    const linkStr = confirmationLink || '#';
    const buttonText = requiresEnglish ? 'I Am Confident in English — Confirm My Place' : 'Confirm My Place';
    
    const courseDetailsHtml = `<!-- Course Details Card -->
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:600px;border-collapse:collapse;margin:20px 0;background-color:#f8fafc;border:1px solid #cbd5e1;border-left:5px solid #2563eb;border-radius:8px;">
  <tr>
    <td style="padding:18px 20px;font-family:Arial,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e293b;">
      <div style="margin:0 0 4px 0;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:bold;line-height:16px;">Course Title</div>
      <div style="margin:0 0 16px 0;font-size:18px;color:#0f172a;font-weight:bold;line-height:24px;">${courseTitle}</div>
      <div style="margin:0 0 4px 0;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:bold;line-height:16px;">Date &amp; Time</div>
      <div style="margin:0;font-size:16px;color:#334155;font-weight:bold;line-height:22px;">${date}</div>
    </td>
  </tr>
</table>`;

    const englishWarningHtml = `<!-- English Warning Card -->
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:600px;border-collapse:collapse;margin:20px 0;background-color:#fefce8;border:1px solid #fde047;border-left:5px solid #eab308;border-radius:8px;">
  <tr>
    <td style="padding:16px 20px;font-family:Arial,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#78350f;">
      <div style="margin:0 0 10px 0;font-size:15px;font-weight:bold;color:#854d0e;line-height:20px;">⚠️ Important note before you confirm:</div>
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;font-family:Arial,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:20px;color:#78350f;">
        <tr>
          <td style="padding:3px 8px 3px 0;vertical-align:top;font-size:14px;line-height:20px;color:#854d0e;width:12px;">&bull;</td>
          <td style="padding:3px 0;vertical-align:top;font-size:14px;line-height:20px;color:#78350f;">Please only accept this place if you feel confident with your English.</td>
        </tr>
        <tr>
          <td style="padding:3px 8px 3px 0;vertical-align:top;font-size:14px;line-height:20px;color:#854d0e;width:12px;">&bull;</td>
          <td style="padding:3px 0;vertical-align:top;font-size:14px;line-height:20px;color:#78350f;">The course and final test are all in English. You will need a good understanding of English to pass.</td>
        </tr>
        <tr>
          <td style="padding:3px 8px 3px 0;vertical-align:top;font-size:14px;line-height:20px;color:#854d0e;width:12px;">&bull;</td>
          <td style="padding:3px 0;vertical-align:top;font-size:14px;line-height:20px;color:#78350f;">We cannot offer a second chance or a retake if you don't pass.</td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

    const buttonHtml = confirmationLink
        ? `<!-- Action Button Container -->
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:24px 0;">
  <tr>
    <td align="left" style="padding:0;">
      <!-- Bulletproof Table Button -->
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:separate;">
        <tr>
          <td align="center" bgcolor="#2563eb" style="border-radius:8px;background-color:#2563eb;padding:14px 28px;">
            <a href="${linkStr}" target="_blank" style="font-family:Arial,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;display:inline-block;line-height:20px;">${buttonText}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
        : '';
        
    let body = requiresEnglish
        ? (config.htmlEmailTemplate || DEFAULT_CONFIG.htmlEmailTemplate)
        : (config.htmlEmailTemplateStandard || DEFAULT_CONFIG.htmlEmailTemplateStandard);

    // Strip wrapping <p> tags ReactQuill might have added around placeholders
    body = body.replace(/<p>\s*\{courseDetails\}\s*<\/p>/g, '{courseDetails}');
    body = body.replace(/<p>\s*\{englishWarning\}\s*<\/p>/g, '{englishWarning}');
    body = body.replace(/<p>\s*\{confirmationButton\}\s*<\/p>/g, '{confirmationButton}');

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
        .replace(/\{confirmationButton\}/g, buttonHtml)
        .replace(/\{responseDays\}/g, String(responseDays ?? 7));

    return getEmailWrapper(body, 'invite', config.includeLogosInEmails ?? false);
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
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:24px 0;">
  <tr>
    <td align="center" bgcolor="#faf5ff" style="padding:24px 20px;background-color:#faf5ff;border-radius:12px;border:1px solid #f3e8ff;">
      <p style="margin:0 0 16px 0;font-size:14px;color:#7c3aed;font-weight:bold;text-transform:uppercase;letter-spacing:1px;font-family:Arial,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">👇 Tap below to update 👇</p>
      <!-- Bulletproof Table Button -->
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:separate;margin:0 auto;">
        <tr>
          <td align="center" bgcolor="#7c3aed" style="border-radius:8px;background-color:#7c3aed;padding:14px 28px;">
            <a href="${statusLink}" target="_blank" style="font-family:Arial,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;display:inline-block;line-height:20px;">Update My Status</a>
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

    return getEmailWrapper(body, 'status', config.includeLogosInEmails ?? false);
}

/** Build the status clarification email subject. */
export function buildStatusEmailSubject(customConfig?: AppConfig): string {
    const config = customConfig || getConfig();
    return config.statusEmailSubjectFormat;
}
