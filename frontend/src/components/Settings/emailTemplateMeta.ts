import { DEFAULT_CONFIG, hasConfirmationTag, type AppConfig } from '../../lib/appConfig';
import type { StatusEmailAudience } from '../../lib/emailTemplates';
import { hasStatusTag } from './types';

export type EmailTemplateGroupId = 'invitations' | 'reminders' | 'surveys';

export type EmailTemplateId =
    | 'high_english'
    | 'standard'
    | 'reminder'
    | 'reminder_tomorrow'
    | 'graduates'
    | 'outreach';

export type EmailTemplateBodyKey =
    | 'htmlEmailTemplate'
    | 'htmlEmailTemplateStandard'
    | 'reminderEmailTemplate'
    | 'reminderTomorrowEmailTemplate'
    | 'statusEmailTemplate'
    | 'outreachEmailTemplate';

export type EmailTemplateSubjectKey =
    | 'emailSubjectFormat'
    | 'reminderEmailSubjectFormat'
    | 'reminderTomorrowEmailSubjectFormat'
    | 'statusEmailSubjectFormat'
    | 'outreachEmailSubjectFormat';

export interface SubjectPlaceholder {
    tag: string;
    label: string;
}

export interface BodyPlaceholder {
    tag: string;
    label: string;
    description: string;
    /** Block placeholders render as cards or buttons and are inserted on their own line. */
    block?: boolean;
    /** At least one required placeholder must be present before saving. */
    required?: boolean;
}

export interface EmailTemplateGroup {
    id: EmailTemplateGroupId;
    label: string;
}

export interface EmailTemplateMeta {
    id: EmailTemplateId;
    group: EmailTemplateGroupId;
    label: string;
    shortDescription: string;
    whenUsed: string;
    bodyKey: EmailTemplateBodyKey;
    subjectKey: EmailTemplateSubjectKey;
    sharedSubjectWith?: string;
    kind: 'invite' | 'reminder' | 'reminder_tomorrow' | 'survey';
    requiresEnglish?: boolean;
    audience?: StatusEmailAudience;
    requiresTag: 'confirmation' | 'status' | 'none';
    subjectPlaceholderText: string;
    subjectPlaceholders: readonly SubjectPlaceholder[];
    bodyPlaceholders: readonly BodyPlaceholder[];
}

export const EMAIL_TEMPLATE_GROUPS: readonly EmailTemplateGroup[] = [
    { id: 'invitations', label: 'Invitations' },
    { id: 'reminders', label: 'Reminders' },
    { id: 'surveys', label: 'Outcomes Surveys' },
];

const COURSE_SUBJECT_PLACEHOLDERS: readonly SubjectPlaceholder[] = [
    { tag: '{courseName}', label: 'Course name' },
    { tag: '{date}', label: 'Course date' },
];

const INVITE_COMMON_BODY_PLACEHOLDERS: readonly BodyPlaceholder[] = [
    { tag: '{courseName}', label: 'Course name', description: 'Replaced with the course title.' },
    { tag: '{date}', label: 'Course date', description: 'Replaced with the scheduled course date (or list of dates).' },
    { tag: '{responseDays}', label: 'Response window', description: 'Number of days students have to confirm their place.' },
    {
        tag: '{courseDetails}',
        label: 'Course details card',
        description: 'Styled card displaying the course title, description, dates, time and venue.',
        block: true,
    },
];

const INVITE_ENGLISH_PLACEHOLDER: BodyPlaceholder = {
    tag: '{englishWarning}',
    label: 'English warning card',
    description: 'Amber notice reminding students that strong English proficiency is required.',
    block: true,
};

const INVITE_ACTION_BODY_PLACEHOLDERS: readonly BodyPlaceholder[] = [
    {
        tag: '{capacityNotice}',
        label: 'Limited places notice',
        description: 'Red notice explaining first-come places and the non-attendance policy.',
        block: true,
    },
    {
        tag: '{confirmationButton}',
        label: 'Confirm button',
        description: 'Primary button linking to the student confirmation page.',
        block: true,
        required: true,
    },
    {
        tag: '{confirmationLink}',
        label: 'Direct confirm URL',
        description: 'Plain confirmation link (can be used instead of or alongside the button).',
        required: true,
    },
];

const REMINDER_BODY_PLACEHOLDERS: readonly BodyPlaceholder[] = [
    { tag: '{courseName}', label: 'Course name', description: 'Replaced with the course title.' },
    { tag: '{date}', label: 'Course date', description: 'Replaced with the course date.' },
    {
        tag: '{courseDetails}',
        label: 'Course details card',
        description: 'Styled card displaying the course title, description, date, time and venue.',
        block: true,
    },
    {
        tag: '{attendanceNotice}',
        label: 'Attendance policy notice',
        description: 'Notice reminding confirmed students to reply early if they can no longer attend.',
        block: true,
    },
];

const SURVEY_BODY_PLACEHOLDERS: readonly BodyPlaceholder[] = [
    {
        tag: '{statusDetails}',
        label: 'Questions card',
        description: 'Card outlining the four quick employment update questions.',
        block: true,
    },
    {
        tag: '{statusButton}',
        label: 'Survey button',
        description: 'Primary button linking to the 1-minute employment survey.',
        block: true,
        required: true,
    },
    {
        tag: '{statusLink}',
        label: 'Direct survey URL',
        description: 'Plain survey link (can be used instead of or alongside the button).',
        required: true,
    },
];

export const EMAIL_TEMPLATES: readonly EmailTemplateMeta[] = [
    {
        id: 'high_english',
        group: 'invitations',
        label: 'High English',
        shortDescription: 'Courses requiring strong English proficiency',
        whenUsed: 'Sent when inviting students to courses marked as requiring strong English. Includes the language warning box and the English-confidence confirmation button.',
        bodyKey: 'htmlEmailTemplate',
        subjectKey: 'emailSubjectFormat',
        sharedSubjectWith: 'Standard',
        kind: 'invite',
        requiresEnglish: true,
        requiresTag: 'confirmation',
        subjectPlaceholderText: 'e.g. You are Invited to join our {courseName} course on {date}',
        subjectPlaceholders: COURSE_SUBJECT_PLACEHOLDERS,
        bodyPlaceholders: [
            ...INVITE_COMMON_BODY_PLACEHOLDERS,
            INVITE_ENGLISH_PLACEHOLDER,
            ...INVITE_ACTION_BODY_PLACEHOLDERS,
        ],
    },
    {
        id: 'standard',
        group: 'invitations',
        label: 'Standard',
        shortDescription: 'General courses without language warning',
        whenUsed: 'Sent when inviting students to general courses without an English proficiency warning. Uses the standard confirmation button.',
        bodyKey: 'htmlEmailTemplateStandard',
        subjectKey: 'emailSubjectFormat',
        sharedSubjectWith: 'High English',
        kind: 'invite',
        requiresEnglish: false,
        requiresTag: 'confirmation',
        subjectPlaceholderText: 'e.g. You are Invited to join our {courseName} course on {date}',
        subjectPlaceholders: COURSE_SUBJECT_PLACEHOLDERS,
        bodyPlaceholders: [
            ...INVITE_COMMON_BODY_PLACEHOLDERS,
            ...INVITE_ACTION_BODY_PLACEHOLDERS,
        ],
    },
    {
        id: 'reminder',
        group: 'reminders',
        label: 'General reminder',
        shortDescription: 'Sent to confirmed students ahead of a course',
        whenUsed: 'Sent from the board to confirmed students ahead of their course date. Automatically switches to the Day before template when the course takes place tomorrow.',
        bodyKey: 'reminderEmailTemplate',
        subjectKey: 'reminderEmailSubjectFormat',
        kind: 'reminder',
        requiresTag: 'none',
        subjectPlaceholderText: 'e.g. Reminder: your {courseName} course on {date}',
        subjectPlaceholders: COURSE_SUBJECT_PLACEHOLDERS,
        bodyPlaceholders: REMINDER_BODY_PLACEHOLDERS,
    },
    {
        id: 'reminder_tomorrow',
        group: 'reminders',
        label: 'Day before',
        shortDescription: 'Used automatically when the course is tomorrow',
        whenUsed: 'Selected automatically instead of the general reminder whenever a course takes place tomorrow. Pulls the same course details card and attendance notice.',
        bodyKey: 'reminderTomorrowEmailTemplate',
        subjectKey: 'reminderTomorrowEmailSubjectFormat',
        kind: 'reminder_tomorrow',
        requiresTag: 'none',
        subjectPlaceholderText: 'e.g. Reminder: your {courseName} course is tomorrow ({date})',
        subjectPlaceholders: COURSE_SUBJECT_PLACEHOLDERS,
        bodyPlaceholders: REMINDER_BODY_PLACEHOLDERS,
    },
    {
        id: 'graduates',
        group: 'surveys',
        label: 'CRM graduates',
        shortDescription: 'Follow-up employment survey for course graduates',
        whenUsed: 'Sent from the Outcomes tab to students who completed a CRM course, inviting them to share a quick 1-minute employment update.',
        bodyKey: 'statusEmailTemplate',
        subjectKey: 'statusEmailSubjectFormat',
        kind: 'survey',
        audience: 'graduates',
        requiresTag: 'status',
        subjectPlaceholderText: 'e.g. How are things going since your course? (1-minute update)',
        subjectPlaceholders: [],
        bodyPlaceholders: SURVEY_BODY_PLACEHOLDERS,
    },
    {
        id: 'outreach',
        group: 'surveys',
        label: 'External lists',
        shortDescription: 'Follow-up survey for external lists (e.g. Action 11)',
        whenUsed: 'Sent from Outreach Lists to external contacts (such as Action 11 lists from IRIS) to collect quick 1-minute employment updates.',
        bodyKey: 'outreachEmailTemplate',
        subjectKey: 'outreachEmailSubjectFormat',
        kind: 'survey',
        audience: 'outreach',
        requiresTag: 'status',
        subjectPlaceholderText: 'e.g. How are things going? (1-minute update from Cork City Partnership)',
        subjectPlaceholders: [],
        bodyPlaceholders: SURVEY_BODY_PLACEHOLDERS,
    },
];

export const EMAIL_TEMPLATES_BY_ID: Record<EmailTemplateId, EmailTemplateMeta> = EMAIL_TEMPLATES.reduce(
    (acc, tpl) => {
        acc[tpl.id] = tpl;
        return acc;
    },
    {} as Record<EmailTemplateId, EmailTemplateMeta>,
);

/** Returns whether the template contains its required action tag (reminders require none). */
export function isTemplateValid(meta: EmailTemplateMeta, config: AppConfig): boolean {
    if (meta.requiresTag === 'confirmation') {
        return hasConfirmationTag(config[meta.bodyKey] || '');
    }
    if (meta.requiresTag === 'status') {
        return hasStatusTag(config[meta.bodyKey]);
    }
    return true;
}

/** Returns true if either the body or subject differs from `otherConfig`. */
export function isTemplateModifiedFrom(meta: EmailTemplateMeta, config: AppConfig, otherConfig: AppConfig): boolean {
    return (
        (config[meta.bodyKey] ?? '') !== (otherConfig[meta.bodyKey] ?? '') ||
        (config[meta.subjectKey] ?? '') !== (otherConfig[meta.subjectKey] ?? '')
    );
}

/** Returns true when both body and subject match `DEFAULT_CONFIG`. */
export function isTemplateDefault(meta: EmailTemplateMeta, config: AppConfig): boolean {
    return !isTemplateModifiedFrom(meta, config, DEFAULT_CONFIG);
}

/**
 * Restores a single template's body and subject back to `DEFAULT_CONFIG`.
 * Note: For invitation templates sharing `emailSubjectFormat`, callers should inform the user
 * that resetting also restores the shared invitation subject.
 */
export function resetSingleTemplate(meta: EmailTemplateMeta, config: AppConfig): AppConfig {
    return {
        ...config,
        [meta.bodyKey]: DEFAULT_CONFIG[meta.bodyKey],
        [meta.subjectKey]: DEFAULT_CONFIG[meta.subjectKey],
    };
}
