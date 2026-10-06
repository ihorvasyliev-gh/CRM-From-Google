// ─── Email HTML (invitations, reminders, status requests) ──────
// Builds the email bodies and subjects from the templates in the app config, in the
// Outlook-safe form they are pasted as (inline styles, hex colours, <font> tags).
import { DEFAULT_CONFIG, getConfig, type AppConfig, type InviteEmailKind } from './appConfig';
import type { CourseEmailInfo } from './types';
import { dayTime, formatTimeRange, hasDayOverrides, isMultiDay, sessionDays, weeklySummary, type CourseSession } from './courseSessions';
import { formatDateLongWithWeekday } from './dateUtils';
import { BASE_EMAIL_FONT, inlineEmailStyles, isLegacyDefaultFont, lineHeightPx, normalizeEmailStyle, QUILL_FONTS, QUILL_SIZES, quillColor, type EmailTextStyle } from './emailFormat';

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
    return html.replace(/<([a-z0-9]+)(\s+[^>]*)>/gi, (tagMatch, tagName, attrs) => {
        const classMatch = attrs.match(/class=["']([^"']+)["']/i);
        if (!classMatch) return tagMatch;

        const classList = classMatch[1].split(/\s+/);
        const stylesToAdd: string[] = [];
        const remainingClasses: string[] = [];

        for (const cls of classList) {
            let processed = false;

            if (cls.startsWith('ql-color-')) {
                const color = quillColor(cls.substring(9));
                if (color) {
                    stylesToAdd.push(`color: ${color};`);
                    processed = true;
                }
            } else if (cls.startsWith('ql-bg-')) {
                const color = quillColor(cls.substring(6));
                if (color) {
                    stylesToAdd.push(`background-color: ${color};`);
                    processed = true;
                }
            } else if (cls.startsWith('ql-font-')) {
                const font = QUILL_FONTS[cls.substring(8)];
                if (font) {
                    stylesToAdd.push(`font-family: ${font};`);
                    processed = true;
                }
            } else if (cls.startsWith('ql-size-')) {
                const size = QUILL_SIZES[cls.substring(8)];
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
        
        // Keep the span's other styles (size, font, background) on the font tag
        const styleAttr = attrs.match(/style\s*=\s*(["'])([\s\S]*?)\1/i);
        const rest = (styleAttr?.[2] || '').split(';').map((d: string) => d.trim()).filter((d: string) => d && !/^color\s*:/i.test(d));
        return rest.length
            ? `<font color="${color}" style="${rest.join('; ')};">${content}</font>`
            : `<font color="${color}">${content}</font>`;
    });
}

/** Matches wording that already tells the reader how to stop receiving emails. */
const UNSUBSCRIBE_TEXT_RE = /prefer not to receive|unsubscribe|opt[\s-]?out|stop receiving|(?:don['’]t|do not) (?:want|wish) to receive/i;

export const UNSUBSCRIBE_FOOTER_TEXT = "If you don't want to receive emails from us, just let us know by replying to this email and we will remove you from our mailing list.";

/** Every email must say how to stop receiving them — unless the template already does. */
export function hasUnsubscribeText(html: string): boolean {
    return UNSUBSCRIBE_TEXT_RE.test(html.replace(/<[^>]+>/g, ' ').replace(/&rsquo;|&#8217;|&#39;|&apos;/g, "'"));
}

function getEmailWrapper(content: string, type: InviteEmailKind | 'status', includeLogos: boolean, style: EmailTextStyle, safeCourseTitle = '') {
    const origin = window.location.origin;
    const font = style.fontFamily;
    const textCss = `font-family: ${font}; font-size: ${style.fontSize}px; line-height: ${lineHeightPx(style)}px; color: ${style.textColor};`;
    
    const [heroTitle, heroSubtitle] = {
        invite: ["You're Invited!", 'Cork City Partnership course invitation'],
        reminder: ['See You Soon!', safeCourseTitle ? `Reminder about your ${safeCourseTitle} course` : 'Reminder about your Cork City Partnership course'],
        reminder_tomorrow: ['See You Tomorrow!', safeCourseTitle ? `Your ${safeCourseTitle} course is tomorrow` : 'Your Cork City Partnership course is tomorrow'],
        status: ['How Are Things Going?', 'Cork City Partnership participant update'],
    }[type];
    const cacheBuster = Date.now();

    const unsubscribeHtml = hasUnsubscribeText(content) ? '' : `
          <!-- Unsubscribe -->
          <tr>
            <td align="left" style="padding: 14px 0 6px 0; border-top: 1px solid #e2e8f0; font-family: ${font}; font-size: 12px; line-height: 18px; color: #64748b;">
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
<body style="margin: 0; padding: 0; background-color: #ffffff; ${textCss}">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
    <tr>
      <td align="left" style="padding: 10px 0; ${textCss}">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
          ${logoHtml}
          <!-- Hero -->
          <tr>
            <td align="left" style="padding: 8px 0 16px 0; font-family: ${font};">
              <div style="font-size: 22px; font-weight: bold; color: #0f172a; line-height: 28px; margin: 0 0 4px 0;">${heroTitle}</div>
              <div style="font-size: 14px; color: #64748b; line-height: 20px; margin: 0;">${heroSubtitle}</div>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td align="left" style="padding: 6px 0; ${textCss}">
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
function escapeHtml(str: string): string {
    return (str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/** Font stack for the cards and buttons: the chosen email font (the original stack by default). */
function emailFont(style: EmailTextStyle): string {
    return isLegacyDefaultFont(style.fontFamily) ? BASE_EMAIL_FONT : style.fontFamily;
}

/** Course's own rich text (editor HTML) inside the course card, with email-safe spacing. */
function cardText(html: string | null | undefined, style: EmailTextStyle): string {
    if (!html || !html.replace(/<[^>]+>|&nbsp;/g, '').trim()) return '';
    const font = emailFont(style);
    const styled = inlineEmailStyles(html, style)
        .replace(/<p>/g, '<p style="margin:0 0 4px 0;">')
        .replace(/<(ul|ol)>/g, '<$1 style="margin:4px 0;padding-left:20px;">');
    return `<div style="font-size:14px;line-height:21px;color:#334155;margin-top:6px;font-family:${font};">${styled}</div>`;
}

const LABEL_CSS = 'font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:bold;line-height:16px;';
const FIRST_DAY_CSS = 'font-size:15px;color:#0369a1;font-weight:bold;line-height:22px;';
const NEXT_DAY_CSS = 'font-size:14px;color:#0f172a;line-height:21px;';

/** 🕙 time and 📍 place lines (empty parts left out). */
function timePlaceHtml(time: string, location: string | null, font: string): string {
    return [
        time && `<div style="font-size:14px;color:#0f172a;line-height:21px;margin-top:4px;font-family:${font};">🕙 ${escapeHtml(time)}</div>`,
        location && `<div style="font-size:14px;color:#0f172a;line-height:21px;margin-top:2px;font-family:${font};">📍 ${escapeHtml(location)}</div>`,
    ].filter(Boolean).join('\n');
}

/** The days of one course date: Day 1 highlighted, the rest listed (or summed up for a long weekly course). */
function sessionDaysHtml(s: CourseSession, font: string): string {
    const days = sessionDays(s);
    if (days.length === 1) {
        return `<div style="${FIRST_DAY_CSS}margin-top:2px;font-family:${font};">🗓️ ${escapeHtml(formatDateLongWithWeekday(s.date))}</div>`;
    }
    const weekly = weeklySummary(s);
    if (weekly) {
        return `<div style="${FIRST_DAY_CSS}margin-top:2px;font-family:${font};">🗓️ Starts ${escapeHtml(formatDateLongWithWeekday(weekly.first))}</div>
            <div style="${NEXT_DAY_CSS}margin-top:2px;font-family:${font};">Every ${escapeHtml(weekly.weekday)} for ${weekly.weeks} weeks, until ${escapeHtml(formatDateLongWithWeekday(weekly.last))}</div>`;
    }
    const ownTimes = hasDayOverrides(s);
    const rows = days.map((d, i) => {
        const css = i === 0 ? FIRST_DAY_CSS : NEXT_DAY_CSS;
        const t = dayTime(s, d);
        const time = ownTimes ? formatTimeRange(t.start, t.end) : '';
        return `<tr>
              <td style="padding:2px 12px 2px 0;vertical-align:top;white-space:nowrap;font-size:12px;line-height:21px;color:#64748b;font-weight:bold;font-family:${font};">Day ${i + 1}</td>
              <td style="padding:2px 12px 2px 0;vertical-align:top;${css}font-family:${font};">${escapeHtml(formatDateLongWithWeekday(d.date))}</td>
              <td style="padding:2px 0;vertical-align:top;font-size:13px;line-height:21px;color:#334155;white-space:nowrap;font-family:${font};">${escapeHtml(time)}</td>
            </tr>`;
    }).join('\n');
    return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:4px;">
            ${rows}
            </table>`;
}

/** "Attendance on all days is required" under a multi-day course. */
function allDaysNoticeHtml(text: string, font: string): string {
    return `<div style="font-size:13px;color:#b45309;font-weight:bold;line-height:19px;margin-top:8px;font-family:${font};">⚠️ ${escapeHtml(text)}</div>`;
}

/** Time and place of one course date, unless every day has its own time (then it is in the day list). */
function sessionTimePlaceHtml(s: CourseSession, font: string, withTime = true, withPlace = true): string {
    const time = withTime && !(isMultiDay(s) && hasDayOverrides(s)) ? formatTimeRange(s.start_time, s.end_time) : '';
    return timePlaceHtml(time, withPlace ? s.location : null, font);
}

/**
 * Date row of the course card from the course dates' schedules: one course date, or several to
 * choose from (each may run over several days). Time and place shared by every option are
 * written once below them.
 */
function sessionsDateRowHtml(sessions: CourseSession[], font: string): string {
    if (sessions.length === 1) {
        const s = sessions[0];
        const days = sessionDays(s).length;
        return `<div style="${LABEL_CSS}">Date &amp; Time</div>
            ${sessionDaysHtml(s, font)}
            ${sessionTimePlaceHtml(s, font)}
            ${days > 1 ? allDaysNoticeHtml(`Attendance on all ${days} days is required.`, font) : ''}`;
    }

    const anyMultiDay = sessions.some(isMultiDay);
    const listsOwnTimes = sessions.some(s => isMultiDay(s) && hasDayOverrides(s));
    const sameTime = !listsOwnTimes && new Set(sessions.map(s => formatTimeRange(s.start_time, s.end_time))).size === 1;
    const samePlace = new Set(sessions.map(s => s.location ?? '')).size === 1;
    const shared = sessionTimePlaceHtml(sessions[0], font, sameTime, samePlace);

    const options = sessions.map((s, i) => {
        const own = sessionTimePlaceHtml(s, font, !sameTime, !samePlace);
        return anyMultiDay
            ? `<div style="font-size:13px;color:#0f172a;font-weight:bold;line-height:20px;margin-top:${i === 0 ? 6 : 12}px;font-family:${font};">Option ${i + 1}</div>
            ${sessionDaysHtml(s, font)}
            ${own}`
            : `${sessionDaysHtml(s, font)}
            ${own}`;
    }).join('\n');

    return `<div style="${LABEL_CSS}">${anyMultiDay ? 'Choose one of the options' : 'Choose one of the dates'}</div>
            ${options}
            ${shared ? `<div style="margin-top:6px;">${shared}</div>` : ''}
            <div style="font-size:12px;color:#64748b;line-height:18px;margin-top:6px;">You will pick your preferred ${anyMultiDay ? 'option' : 'date'} on the confirmation page.</div>
            ${anyMultiDay ? allDaysNoticeHtml('Attendance on all days of the option you choose is required.', font) : ''}`;
}

/** `<p …>{tag}</p>` → `{tag}`, so card/button tables aren't nested inside a paragraph. */
function unwrapBlockPlaceholders(html: string, tags: string[]): string {
    return tags.reduce((out, tag) => out.replace(new RegExp(`<p(?:\\s[^>]*)?>\\s*\\{${tag}\\}\\s*</p>`, 'g'), `{${tag}}`), html);
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
    courseInfo?: CourseEmailInfo | null,
    /** Time, place and days of the course date(s); when given they replace the plain `date` row */
    sessions?: CourseSession[] | null
): string {
    const config = customConfig || getConfig();
    const emailStyle = normalizeEmailStyle(config.emailStyle);
    const font = emailFont(emailStyle);
    const linkStr = confirmationLink || '#';
    const dateList = Array.isArray(date) ? date.filter(Boolean) : [date];
    const isMultiDate = sessions && sessions.length > 0 ? sessions.length > 1 : dateList.length > 1;
    const safeCourseTitle = escapeHtml(courseTitle);
    const buttonText = isMultiDate
        ? (requiresEnglish ? 'I Am Confident in English — Choose My Date' : 'Choose My Date &amp; Confirm')
        : (requiresEnglish ? 'I Am Confident in English — Confirm My Place' : 'Confirm My Place');
    const dateRowHtml = sessions && sessions.length > 0
        ? sessionsDateRowHtml(sessions, font)
        : isMultiDate
        ? `<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:bold;line-height:16px;">Choose one of the dates</div>
${dateList.map(d => `            <div style="font-size:15px;color:#0369a1;font-weight:bold;line-height:22px;margin-top:4px;">🗓️ ${escapeHtml(d)}</div>`).join('\n')}
            <div style="font-size:12px;color:#64748b;line-height:18px;margin-top:6px;">You will pick your preferred date on the confirmation page.</div>`
        : `<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:bold;line-height:16px;">Date &amp; Time</div>
            <div style="font-size:15px;color:#0369a1;font-weight:bold;line-height:22px;margin-top:2px;">🗓️ ${escapeHtml(dateList[0] ?? '')}</div>`;
    
    const courseDetailsHtml = `<!-- Course Details Card -->
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:600px;border-collapse:collapse;margin:18px 0;background-color:#f8fafc;border:1px solid #e2e8f0;border-left:5px solid #0284c7;border-radius:8px;">
  <tr>
    <td style="padding:16px 20px;font-family:${font};">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
        <tr>
          <td style="padding-bottom:10px;font-family:${font};">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:bold;line-height:16px;">Course Title</div>
            <div style="font-size:17px;color:#0f172a;font-weight:bold;line-height:24px;margin-top:2px;">${safeCourseTitle}</div>
            ${cardText(courseInfo?.description, emailStyle)}
          </td>
        </tr>
        <tr>
          <td style="font-family:${font};">
            ${dateRowHtml}
            ${cardText(courseInfo?.details, emailStyle)}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

    const englishWarningHtml = `<!-- English Warning Card -->
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:600px;border-collapse:collapse;margin:18px 0;background-color:#fffbeb;border:1px solid #fef08a;border-left:5px solid #f59e0b;border-radius:8px;">
  <tr>
    <td style="padding:15px 20px;font-family:${font};">
      <div style="font-size:13px;font-weight:bold;color:#b45309;line-height:20px;margin-bottom:8px;">⚠️ Important note before you confirm:</div>
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;font-family:${font};font-size:13px;line-height:19px;color:#92400e;">
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
    <td style="padding:15px 20px;font-family:${font};">
      <div style="font-size:13px;font-weight:bold;color:#b91c1c;line-height:20px;margin-bottom:6px;">⏳ Limited places — please read before you confirm</div>
      <div style="font-size:13px;line-height:19px;color:#7f1d1d;">Places on this course are allocated on a first-come, first-served basis. Once all places are taken, confirmation for ${isMultiDate ? "that date" : "this date"} will close — even if your ${days}-day response window has not yet expired.</div>
      <div style="font-size:13px;line-height:19px;color:#7f1d1d;margin-top:8px;"><strong>Please only confirm if you are sure you can attend.</strong> If you confirm but don't attend without letting us know in advance, <strong>you may not be offered a place on this course again</strong>. If you can no longer attend, simply reply to this email as early as possible so we can offer your place to someone else.</div>
    </td>
  </tr>
</table>`;

    const attendanceNoticeHtml = `<!-- Attendance Notice -->
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:600px;border-collapse:collapse;margin:18px 0;background-color:#fef2f2;border:1px solid #fecaca;border-left:5px solid #dc2626;border-radius:8px;">
  <tr>
    <td style="padding:15px 20px;font-family:${font};">
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
            <a href="${linkStr}" target="_blank" style="font-family:${font};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;display:inline-block;line-height:20px;">${buttonText} &rarr;</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
        : '';
        
    let body = kind === 'reminder_tomorrow'
        ? (config.reminderTomorrowEmailTemplate || DEFAULT_CONFIG.reminderTomorrowEmailTemplate)
        : kind === 'reminder'
        ? (config.reminderEmailTemplate || DEFAULT_CONFIG.reminderEmailTemplate)
        : requiresEnglish
        ? (config.htmlEmailTemplate || DEFAULT_CONFIG.htmlEmailTemplate)
        : (config.htmlEmailTemplateStandard || DEFAULT_CONFIG.htmlEmailTemplateStandard);

    body = inlineEmailStyles(body, emailStyle);
    // Block placeholders stand on a line of their own, which the editor wraps in a <p>
    body = unwrapBlockPlaceholders(body, ['courseDetails', 'englishWarning', 'confirmationButton', 'capacityNotice', 'attendanceNotice']);

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

    return getEmailWrapper(body, kind, config.includeLogosInEmails ?? false, emailStyle, safeCourseTitle);
}

/** Build the email subject by replacing placeholders. */
export function buildEmailSubject(courseName: string, date: string, customConfig?: AppConfig, kind: InviteEmailKind = 'invite'): string {
    const config = customConfig || getConfig();
    const format = kind === 'reminder_tomorrow'
        ? config.reminderTomorrowEmailSubjectFormat || DEFAULT_CONFIG.reminderTomorrowEmailSubjectFormat
        : kind === 'reminder'
        ? config.reminderEmailSubjectFormat || DEFAULT_CONFIG.reminderEmailSubjectFormat
        : config.emailSubjectFormat;
    return format
        .replace(/\{courseName\}/g, courseName)
        .replace(/\{date\}/g, date);
}

/** Who a status survey email goes to: CRM graduates or an external outreach list (e.g. Action 11). */
export type StatusEmailAudience = 'graduates' | 'outreach';

/** Build the status clarification email body HTML. */
export function buildStatusEmailBodyHtml(statusLink: string, customConfig?: AppConfig, audience: StatusEmailAudience = 'graduates'): string {
    const config = customConfig || getConfig();
    const emailStyle = normalizeEmailStyle(config.emailStyle);
    const font = emailFont(emailStyle);

    // Same card / button markup as the course invitation so both emails look alike
    // and survive copy-paste into Outlook and Gmail.
    const detailsHtml = `<!-- Status Questions Card -->
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:600px;border-collapse:collapse;margin:18px 0;background-color:#f8fafc;border:1px solid #e2e8f0;border-left:5px solid #0284c7;border-radius:8px;">
  <tr>
    <td style="padding:16px 20px;font-family:${font};">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:bold;line-height:16px;margin-bottom:6px;">What we will ask</div>
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
        <tr>
          <td style="padding:3px 10px 3px 0;vertical-align:top;font-size:14px;line-height:21px;color:#0284c7;width:14px;font-weight:bold;font-family:${font};">&bull;</td>
          <td style="padding:3px 0;vertical-align:top;font-size:14px;line-height:21px;color:#0f172a;font-family:${font};">Are you working at the moment?</td>
        </tr>
        <tr>
          <td style="padding:3px 10px 3px 0;vertical-align:top;font-size:14px;line-height:21px;color:#0284c7;width:14px;font-weight:bold;font-family:${font};">&bull;</td>
          <td style="padding:3px 0;vertical-align:top;font-size:14px;line-height:21px;color:#0f172a;font-family:${font};">If yes — when did you start?</td>
        </tr>
        <tr>
          <td style="padding:3px 10px 3px 0;vertical-align:top;font-size:14px;line-height:21px;color:#0284c7;width:14px;font-weight:bold;font-family:${font};">&bull;</td>
          <td style="padding:3px 0;vertical-align:top;font-size:14px;line-height:21px;color:#0f172a;font-family:${font};">Where do you work (company or sector)?</td>
        </tr>
        <tr>
          <td style="padding:3px 10px 3px 0;vertical-align:top;font-size:14px;line-height:21px;color:#0284c7;width:14px;font-weight:bold;font-family:${font};">&bull;</td>
          <td style="padding:3px 0;vertical-align:top;font-size:14px;line-height:21px;color:#0f172a;font-family:${font};">Is it full-time or part-time?</td>
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
            <a href="${statusLink}" target="_blank" style="font-family:${font};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;display:inline-block;line-height:20px;">Share My Update &rarr;</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

    let body = audience === 'outreach'
        ? config.outreachEmailTemplate || DEFAULT_CONFIG.outreachEmailTemplate
        : config.statusEmailTemplate || DEFAULT_CONFIG.statusEmailTemplate;
    body = inlineEmailStyles(body, emailStyle);
    // Block placeholders stand on a line of their own, which the editor wraps in a <p>
    body = unwrapBlockPlaceholders(body, ['statusButton', 'statusDetails']);

    // The email goes out as one BCC message, so it can't be personalised
    body = body.replace(/\s*\{studentName\}/g, '');

    body = body
        .replace(/\{statusDetails\}/g, detailsHtml)
        .replace(/\{statusButton\}/g, buttonHtml)
        .replace(/\{statusLink\}/g, statusLink);

    return getEmailWrapper(body, 'status', config.includeLogosInEmails ?? false, emailStyle);
}

/** Build the status clarification email subject. */
export function buildStatusEmailSubject(customConfig?: AppConfig, audience: StatusEmailAudience = 'graduates'): string {
    const config = customConfig || getConfig();
    return audience === 'outreach'
        ? config.outreachEmailSubjectFormat || DEFAULT_CONFIG.outreachEmailSubjectFormat
        : config.statusEmailSubjectFormat;
}
