import { useCallback, useId, useMemo, useRef, useState } from 'react';
import {
    AlertCircle,
    AlertTriangle,
    BellRing,
    CalendarClock,
    Check,
    CheckCircle2,
    Eye,
    EyeOff,
    Globe,
    GraduationCap,
    Info,
    Languages,
    Link2,
    Loader2,
    Monitor,
    Plus,
    RefreshCw,
    RotateCcw,
    Save,
    Smartphone,
    Users,
    type LucideIcon,
} from 'lucide-react';
import {
    buildEmailBodyHtml,
    buildEmailSubject,
    buildStatusEmailBodyHtml,
    buildStatusEmailSubject,
} from '../../lib/emailTemplates';
import { formatDateChoiceList, formatDateLong, formatDateLongWithWeekday } from '../../lib/dateUtils';
import { shortcutLabel } from '../../lib/platform';
import ConfirmDialog from '../ConfirmDialog';
import EmailEditor, { type EmailEditorHandle } from '../EmailEditor/EmailEditor';
import Badge from '../ui/Badge';
import { Button } from '../ui/Button';
import { CustomTooltip } from '../ui/Tooltip';
import { calloutCls, eyebrowCls, inputCls, labelCls, panelCls } from '../ui/styles';
import EmailStyleBar from './EmailStyleBar';
import {
    EMAIL_TEMPLATES,
    EMAIL_TEMPLATES_BY_ID,
    EMAIL_TEMPLATE_GROUPS,
    isTemplateDefault,
    isTemplateModifiedFrom,
    isTemplateValid,
    resetSingleTemplate,
    type EmailTemplateId,
} from './emailTemplateMeta';
import { validateEmailConfig, type EmailsTabProps } from './types';

type PreviewViewport = 'desktop' | 'mobile';

const TEMPLATE_ICONS: Record<EmailTemplateId, LucideIcon> = {
    high_english: Languages,
    standard: Globe,
    reminder: BellRing,
    reminder_tomorrow: CalendarClock,
    graduates: GraduationCap,
    outreach: Users,
};

/** Sample of per-course rich text (Courses → edit course) so the preview renders the full card. */
const PREVIEW_COURSE_INFO = {
    description: '<p><strong>Overview:</strong> Course description written for this course.</p>',
    details: '<ul><li><strong>Time:</strong> 10:00 AM – 2:00 PM</li><li><strong>Address:</strong> Course venue address</li></ul>',
};

function addDaysIso(base: Date, days: number): string {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export default function EmailsTab({
    config,
    savedConfig,
    hasChanges,
    saving,
    saveStatus,
    saveError,
    onChangeConfig,
    onSave,
    onDiscard,
    onResetAll,
}: EmailsTabProps) {
    const [activeTemplateId, setActiveTemplateId] = useState<EmailTemplateId>('high_english');
    const [showPreview, setShowPreview] = useState(true);
    const [previewViewport, setPreviewViewport] = useState<PreviewViewport>('desktop');
    const [previewMultiDate, setPreviewMultiDate] = useState(false);
    const [confirmResetTemplate, setConfirmResetTemplate] = useState(false);
    const [confirmResetAll, setConfirmResetAll] = useState(false);

    const subjectInputId = useId();
    const subjectInputRef = useRef<HTMLInputElement>(null);
    const editorRef = useRef<EmailEditorHandle>(null);
    const tablistRef = useRef<HTMLDivElement>(null);

    const activeMeta = EMAIL_TEMPLATES_BY_ID[activeTemplateId];
    const currentSubject = config[activeMeta.subjectKey] ?? '';
    const currentBody = config[activeMeta.bodyKey] ?? '';
    const isActiveValid = isTemplateValid(activeMeta, config);
    const isActiveDefault = isTemplateDefault(activeMeta, config);

    const validation = useMemo(() => validateEmailConfig(config), [config]);
    const invalidTemplates = useMemo(
        () => EMAIL_TEMPLATES.filter(tpl => !isTemplateValid(tpl, config)),
        [config],
    );

    const sampleDates = useMemo(() => {
        const base = new Date();
        base.setHours(12, 0, 0, 0);
        const tomorrowIso = addDaysIso(base, 1);
        const singleIso = addDaysIso(base, 14);
        const multiIsos = [singleIso, addDaysIso(base, 15), addDaysIso(base, 16)];
        return {
            singleIso,
            singleLong: formatDateLong(singleIso),
            singleWeekday: formatDateLongWithWeekday(singleIso),
            tomorrowLong: formatDateLong(tomorrowIso),
            tomorrowWeekday: formatDateLongWithWeekday(tomorrowIso),
            multiBodyDates: multiIsos.map(formatDateLongWithWeekday),
            multiSubjectDates: formatDateChoiceList(multiIsos),
            confirmLink: `https://example.com/confirm?course_id=sample&date=${singleIso}`,
        };
    }, []);

    const { previewSubject, previewHtml } = useMemo(() => {
        if (activeMeta.kind === 'survey') {
            const audience = activeMeta.audience ?? 'graduates';
            const origin = typeof window !== 'undefined' ? window.location.origin : 'https://example.com';
            const statusLink = `${origin}/status${audience === 'outreach' ? '?list=example' : ''}`;
            return {
                previewSubject: buildStatusEmailSubject(config, audience),
                previewHtml: buildStatusEmailBodyHtml(statusLink, config, audience),
            };
        }

        const courseName = activeMeta.requiresEnglish
            ? 'Security Guarding (PSA)'
            : 'Introduction to Digital Skills';

        if (activeMeta.kind === 'reminder_tomorrow') {
            return {
                previewSubject: buildEmailSubject(courseName, sampleDates.tomorrowLong, config, 'reminder_tomorrow'),
                previewHtml: buildEmailBodyHtml(
                    courseName,
                    sampleDates.tomorrowWeekday,
                    undefined,
                    config,
                    undefined,
                    false,
                    'reminder_tomorrow',
                    PREVIEW_COURSE_INFO,
                ),
            };
        }

        if (activeMeta.kind === 'reminder') {
            return {
                previewSubject: buildEmailSubject(courseName, sampleDates.singleLong, config, 'reminder'),
                previewHtml: buildEmailBodyHtml(
                    courseName,
                    sampleDates.singleWeekday,
                    undefined,
                    config,
                    undefined,
                    false,
                    'reminder',
                    PREVIEW_COURSE_INFO,
                ),
            };
        }

        const bodyDate = previewMultiDate ? sampleDates.multiBodyDates : sampleDates.singleLong;
        const subjectDate = previewMultiDate ? sampleDates.multiSubjectDates : sampleDates.singleLong;
        return {
            previewSubject: buildEmailSubject(courseName, subjectDate, config, 'invite'),
            previewHtml: buildEmailBodyHtml(
                courseName,
                bodyDate,
                sampleDates.confirmLink,
                config,
                7,
                !!activeMeta.requiresEnglish,
                'invite',
                PREVIEW_COURSE_INFO,
            ),
        };
    }, [activeMeta, config, previewMultiDate, sampleDates]);

    const handleTabKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
        let nextIndex: number | null = null;
        if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % EMAIL_TEMPLATES.length;
        else if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + EMAIL_TEMPLATES.length) % EMAIL_TEMPLATES.length;
        else if (e.key === 'Home') nextIndex = 0;
        else if (e.key === 'End') nextIndex = EMAIL_TEMPLATES.length - 1;
        if (nextIndex === null) return;

        e.preventDefault();
        const nextTpl = EMAIL_TEMPLATES[nextIndex];
        setActiveTemplateId(nextTpl.id);
        const tabs = tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        tabs?.[nextIndex]?.focus();
    }, []);

    const insertSubjectPlaceholder = useCallback((tag: string) => {
        const input = subjectInputRef.current;
        onChangeConfig(prev => {
            const current = prev[activeMeta.subjectKey] ?? '';
            if (
                input &&
                document.activeElement === input &&
                typeof input.selectionStart === 'number' &&
                typeof input.selectionEnd === 'number'
            ) {
                const start = input.selectionStart;
                const end = input.selectionEnd;
                const next = `${current.slice(0, start)}${tag}${current.slice(end)}`;
                requestAnimationFrame(() => {
                    input.setSelectionRange(start + tag.length, start + tag.length);
                });
                return { ...prev, [activeMeta.subjectKey]: next };
            }
            const trimmedEnd = current.trimEnd();
            const next = trimmedEnd ? `${trimmedEnd} ${tag}` : tag;
            return { ...prev, [activeMeta.subjectKey]: next };
        });
    }, [activeMeta.subjectKey, onChangeConfig]);

    const insertBodyPlaceholder = useCallback((tag: string, block?: boolean) => {
        editorRef.current?.insertTag(tag, { block });
    }, []);

    const isRetrySync = saveStatus === 'error';
    const canSave = (hasChanges || isRetrySync) && validation.allValid && !saving;
    const showSaveBar = hasChanges || saving || saveStatus === 'saved' || saveStatus === 'error';

    return (
        <div className="space-y-5">
            {/* 1. Collapsible Style & Branding Bar */}
            <EmailStyleBar
                style={config.emailStyle}
                includeLogos={config.includeLogosInEmails ?? false}
                onStyleChange={emailStyle => onChangeConfig(prev => ({ ...prev, emailStyle }))}
                onIncludeLogosChange={includeLogosInEmails => onChangeConfig(prev => ({ ...prev, includeLogosInEmails }))}
            />

            {/* 2. Unified Template Workspace Card */}
            <section
                aria-label="Email templates"
                className="rounded-2xl bg-surface border border-border-subtle shadow-card overflow-hidden"
            >
                {/* Template Picker Header */}
                <header className="border-b border-border-subtle bg-surface-elevated/35 px-4 sm:px-5 py-3.5">
                    <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-3.5">
                        <div
                            ref={tablistRef}
                            role="tablist"
                            aria-label="Email template selector"
                            className="flex items-end gap-3 overflow-x-auto scrollbar-none pb-0.5 -mx-1 px-1"
                        >
                            {EMAIL_TEMPLATE_GROUPS.map((group, groupIndex) => {
                                const groupTemplates = EMAIL_TEMPLATES.filter(t => t.group === group.id);
                                return (
                                    <div key={group.id} role="presentation" className="flex items-end gap-3 shrink-0">
                                        {groupIndex > 0 && (
                                            <span
                                                aria-hidden="true"
                                                className="hidden sm:block w-px h-8 bg-border-subtle/80 mb-0.5 shrink-0"
                                            />
                                        )}
                                        <div role="presentation" className="flex flex-col gap-1.5 shrink-0">
                                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted/85 px-1">
                                                {group.label}
                                            </span>
                                            <div
                                                role="presentation"
                                                className="inline-flex items-center gap-1 p-1 rounded-xl bg-surface-elevated border border-border-subtle"
                                            >
                                                {groupTemplates.map(meta => {
                                                    const flatIndex = EMAIL_TEMPLATES.findIndex(t => t.id === meta.id);
                                                    const isActive = meta.id === activeTemplateId;
                                                    const valid = isTemplateValid(meta, config);
                                                    const modified = isTemplateModifiedFrom(meta, config, savedConfig);
                                                    const Icon = TEMPLATE_ICONS[meta.id];
                                                    return (
                                                        <button
                                                            key={meta.id}
                                                            id={`email-tab-${meta.id}`}
                                                            type="button"
                                                            role="tab"
                                                            aria-selected={isActive}
                                                            aria-controls={`email-panel-${meta.id}`}
                                                            tabIndex={isActive ? 0 : -1}
                                                            title={meta.shortDescription}
                                                            onClick={() => setActiveTemplateId(meta.id)}
                                                            onKeyDown={e => handleTabKeyDown(e, flatIndex)}
                                                            className={`shrink-0 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                                                                isActive
                                                                    ? 'bg-surface text-primary shadow-xs ring-1 ring-border-subtle'
                                                                    : 'text-muted hover:text-primary hover:bg-surface/60'
                                                            }`}
                                                        >
                                                            <Icon
                                                                size={13}
                                                                className={isActive ? 'text-brand-600 dark:text-brand-400 shrink-0' : 'shrink-0'}
                                                            />
                                                            <span>{meta.label}</span>
                                                            {!valid && (
                                                                <>
                                                                    <AlertCircle
                                                                        size={13}
                                                                        aria-hidden="true"
                                                                        className="text-status-rejected shrink-0"
                                                                    />
                                                                    <span className="sr-only"> (missing required tag)</span>
                                                                </>
                                                            )}
                                                            {modified && (
                                                                <>
                                                                    <span
                                                                        aria-hidden="true"
                                                                        className="w-1.5 h-1.5 rounded-full bg-warning shrink-0"
                                                                    />
                                                                    <span className="sr-only"> (unsaved changes)</span>
                                                                </>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Workspace actions */}
                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setShowPreview(prev => !prev)}
                                aria-pressed={showPreview}
                            >
                                {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                                {showPreview ? 'Hide preview' : 'Preview'}
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={isActiveDefault || saving}
                                onClick={() => setConfirmResetTemplate(true)}
                            >
                                <RotateCcw size={13} />
                                Reset template
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={saving}
                                onClick={() => setConfirmResetAll(true)}
                                className="hover:!text-status-rejected hover:!bg-danger/10"
                            >
                                <RotateCcw size={13} />
                                Reset all
                            </Button>
                        </div>
                    </div>
                </header>

                {/* Active template panel */}
                <div
                    role="tabpanel"
                    id={`email-panel-${activeTemplateId}`}
                    aria-labelledby={`email-tab-${activeTemplateId}`}
                >
                    {/* Contextual Banner */}
                    <div className="px-4 sm:px-5 pt-4">
                        <div className={`${calloutCls.info} px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs`}>
                            <div className="flex items-start sm:items-center gap-2 min-w-0 flex-1">
                                <Info size={14} className="text-status-invited shrink-0 mt-0.5 sm:mt-0" />
                                <p className="text-primary leading-relaxed">{activeMeta.whenUsed}</p>
                            </div>
                            {activeMeta.sharedSubjectWith && (
                                <Badge tone="info" shape="pill" icon={<Link2 size={11} />}>
                                    Shared subject with {activeMeta.sharedSubjectWith} invitations
                                </Badge>
                            )}
                        </div>
                    </div>

                    {/* 2-Column Studio Body */}
                    <div
                        className={`grid grid-cols-1 ${
                            showPreview ? 'xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] items-start' : ''
                        } gap-6 p-4 sm:p-5`}
                    >
                        {/* Left Column — Editor */}
                        <div className="space-y-5 min-w-0">
                            {/* Email Subject */}
                            <div>
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                                    <label htmlFor={subjectInputId} className={`${labelCls} mb-0!`}>
                                        Email subject
                                    </label>
                                    {activeMeta.subjectPlaceholders.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {activeMeta.subjectPlaceholders.map(item => (
                                                <button
                                                    key={item.tag}
                                                    type="button"
                                                    onMouseDown={e => e.preventDefault()}
                                                    onClick={() => insertSubjectPlaceholder(item.tag)}
                                                    className="inline-flex items-center gap-1 h-6 px-2 rounded-lg text-xs font-medium bg-surface-elevated text-primary border border-border-subtle hover:border-brand-500/50 hover:text-brand-600 dark:hover:text-brand-400 transition-colors active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40"
                                                >
                                                    <Plus size={11} className="text-muted shrink-0" />
                                                    <span>{item.label}</span>
                                                    <code className="font-mono text-[11px] opacity-65">{item.tag}</code>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <input
                                    id={subjectInputId}
                                    ref={subjectInputRef}
                                    type="text"
                                    value={currentSubject}
                                    onChange={e =>
                                        onChangeConfig(prev => ({
                                            ...prev,
                                            [activeMeta.subjectKey]: e.target.value,
                                        }))
                                    }
                                    className={`${inputCls} h-10`}
                                    placeholder={activeMeta.subjectPlaceholderText}
                                />
                                {!currentSubject.trim() && (
                                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-status-requested">
                                        <AlertCircle size={13} className="shrink-0" />
                                        <span>Blank subject falls back to the default subject when sending.</span>
                                    </p>
                                )}
                            </div>

                            {/* Email Body */}
                            <div>
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                    <span className={`${labelCls} mb-0!`}>Email body</span>
                                    <span className="text-xs text-muted">Click a block or tag to insert at cursor</span>
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                                    {activeMeta.bodyPlaceholders.map(item => {
                                        const isPresent = currentBody.includes(item.tag);
                                        const showRequiredCue = Boolean(item.required && !isActiveValid);
                                        return (
                                            <CustomTooltip key={item.tag} content={item.description}>
                                                <button
                                                    type="button"
                                                    onClick={() => insertBodyPlaceholder(item.tag, item.block)}
                                                    className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs border transition-all active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                                                        isPresent
                                                            ? 'bg-success/10 text-status-confirmed border-success/25 hover:bg-success/15'
                                                            : showRequiredCue
                                                                ? 'bg-danger/[0.06] text-primary border-danger/35 hover:border-danger/60 hover:bg-danger/10'
                                                                : 'bg-surface text-primary border-border-subtle hover:border-brand-500/50 hover:text-brand-600 dark:hover:text-brand-400'
                                                    }`}
                                                >
                                                    {isPresent ? (
                                                        <Check size={12} className="shrink-0" />
                                                    ) : (
                                                        <Plus size={12} className={showRequiredCue ? 'text-status-rejected shrink-0' : 'text-muted shrink-0'} />
                                                    )}
                                                    <span className="font-medium">{item.label}</span>
                                                    <code className="font-mono text-[11px] opacity-65">{item.tag}</code>
                                                    {showRequiredCue && (
                                                        <span className="px-1.5 py-0.5 rounded-full bg-danger/15 text-status-rejected text-[10px] font-semibold leading-none">
                                                            Required
                                                        </span>
                                                    )}
                                                </button>
                                            </CustomTooltip>
                                        );
                                    })}
                                </div>

                                <EmailEditor
                                    key={activeTemplateId}
                                    ref={editorRef}
                                    value={currentBody}
                                    onChange={html =>
                                        onChangeConfig(prev => ({
                                            ...prev,
                                            [activeMeta.bodyKey]: html,
                                        }))
                                    }
                                    textStyle={config.emailStyle}
                                    minHeight={280}
                                    maxHeight={540}
                                    ariaLabel={`${activeMeta.label} email body`}
                                />
                            </div>

                            {/* Accurate Validation Callout */}
                            {activeMeta.requiresTag === 'confirmation' && (
                                isActiveValid ? (
                                    <div className={`${calloutCls.success} flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium`}>
                                        <CheckCircle2 size={15} className="shrink-0 text-status-confirmed" />
                                        <span>Ready to send — confirmation action is included.</span>
                                    </div>
                                ) : (
                                    <div
                                        role="alert"
                                        className={`${calloutCls.danger} flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 text-xs font-medium animate-fadeIn`}
                                    >
                                        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                                            <AlertTriangle size={15} className="shrink-0 text-status-rejected mt-0.5 sm:mt-0" />
                                            <span>
                                                Missing confirmation action — add{' '}
                                                <code className="font-mono font-semibold">{'{confirmationButton}'}</code> or{' '}
                                                <code className="font-mono font-semibold">{'{confirmationLink}'}</code> before saving.
                                            </span>
                                        </div>
                                        <Button
                                            variant="danger-soft"
                                            size="xs"
                                            onClick={() => insertBodyPlaceholder('{confirmationButton}', true)}
                                        >
                                            <Plus size={12} />
                                            Add button
                                        </Button>
                                    </div>
                                )
                            )}

                            {activeMeta.requiresTag === 'status' && (
                                isActiveValid ? (
                                    <div className={`${calloutCls.success} flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium`}>
                                        <CheckCircle2 size={15} className="shrink-0 text-status-confirmed" />
                                        <span>Ready to send — survey link/button is included.</span>
                                    </div>
                                ) : (
                                    <div
                                        role="alert"
                                        className={`${calloutCls.danger} flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 text-xs font-medium animate-fadeIn`}
                                    >
                                        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                                            <AlertTriangle size={15} className="shrink-0 text-status-rejected mt-0.5 sm:mt-0" />
                                            <span>
                                                Missing survey action — add{' '}
                                                <code className="font-mono font-semibold">{'{statusButton}'}</code> or{' '}
                                                <code className="font-mono font-semibold">{'{statusLink}'}</code> before saving.
                                            </span>
                                        </div>
                                        <Button
                                            variant="danger-soft"
                                            size="xs"
                                            onClick={() => insertBodyPlaceholder('{statusButton}', true)}
                                        >
                                            <Plus size={12} />
                                            Add button
                                        </Button>
                                    </div>
                                )
                            )}

                            {activeMeta.requiresTag === 'none' && (
                                <div className={`${calloutCls.info} flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium`}>
                                    <Info size={15} className="shrink-0 text-status-invited" />
                                    <span>Reminders go to students who have already confirmed — no confirmation button is needed.</span>
                                </div>
                            )}
                        </div>

                        {/* Right Column — Sticky Live Preview */}
                        {showPreview && (
                            <div className="xl:sticky xl:top-5 space-y-3 flex flex-col min-w-0 animate-fadeIn">
                                {/* Preview Toolbar */}
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className={eyebrowCls}>Live preview</span>
                                        <Badge tone="neutral" shape="pill">{activeMeta.label}</Badge>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        {activeMeta.kind === 'invite' && (
                                            <label className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary cursor-pointer select-none transition-colors">
                                                <input
                                                    type="checkbox"
                                                    checked={previewMultiDate}
                                                    onChange={e => setPreviewMultiDate(e.target.checked)}
                                                    className="rounded-sm border-border-strong accent-brand-500"
                                                />
                                                <span>Multi-date</span>
                                            </label>
                                        )}

                                        <div
                                            role="group"
                                            aria-label="Preview viewport"
                                            className="inline-flex items-center gap-0.5 p-0.5 rounded-xl bg-surface-elevated border border-border-subtle"
                                        >
                                            <button
                                                type="button"
                                                aria-pressed={previewViewport === 'desktop'}
                                                onClick={() => setPreviewViewport('desktop')}
                                                className={`inline-flex items-center gap-1 h-6 px-2 rounded-lg text-xs font-semibold transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                                                    previewViewport === 'desktop'
                                                        ? 'bg-surface text-primary shadow-xs ring-1 ring-border-subtle'
                                                        : 'text-muted hover:text-primary'
                                                }`}
                                            >
                                                <Monitor size={12} />
                                                <span>Desktop</span>
                                            </button>
                                            <button
                                                type="button"
                                                aria-pressed={previewViewport === 'mobile'}
                                                onClick={() => setPreviewViewport('mobile')}
                                                className={`inline-flex items-center gap-1 h-6 px-2 rounded-lg text-xs font-semibold transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                                                    previewViewport === 'mobile'
                                                        ? 'bg-surface text-primary shadow-xs ring-1 ring-border-subtle'
                                                        : 'text-muted hover:text-primary'
                                                }`}
                                            >
                                                <Smartphone size={12} />
                                                <span>Mobile</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Email Client Frame */}
                                <div className={`${panelCls} overflow-hidden flex flex-col`}>
                                    {/* Mock Inbox Envelope Header */}
                                    <div className="px-3.5 py-3 border-b border-border-subtle bg-surface/85 space-y-1 text-xs">
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-muted font-medium w-14 shrink-0">From:</span>
                                            <span className="text-primary font-medium truncate">Cork City Partnership</span>
                                        </div>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-muted font-medium w-14 shrink-0">To:</span>
                                            <span className="text-muted font-mono text-[11px] truncate">student@example.com</span>
                                        </div>
                                        <div className="flex items-baseline gap-2 pt-0.5">
                                            <span className="text-muted font-medium w-14 shrink-0">Subject:</span>
                                            <span className="text-primary font-semibold break-words min-w-0">
                                                {previewSubject}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Preview Canvas */}
                                    <div className="p-3 bg-surface-elevated/45 flex flex-col items-center">
                                        <div
                                            className={`overflow-hidden border border-border-subtle bg-white transition-[width] duration-300 ${
                                                previewViewport === 'mobile'
                                                    ? 'w-[375px] max-w-full mx-auto shadow-card rounded-xl'
                                                    : 'w-full rounded-lg'
                                            }`}
                                        >
                                            {previewViewport === 'mobile' && (
                                                <div className="flex items-center justify-between px-3 py-1.5 bg-surface-elevated/90 border-b border-border-subtle text-[11px] text-muted">
                                                    <span className="font-medium">Mobile inbox</span>
                                                    <span className="font-mono tabular-nums">375px</span>
                                                </div>
                                            )}
                                            <iframe
                                                srcDoc={previewHtml}
                                                title="Email preview"
                                                sandbox="allow-popups"
                                                className="block w-full h-[520px] border-0 bg-white"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* 3. Sticky Floating Save Bar */}
            {showSaveBar && (
                <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+5rem)] lg:bottom-5 z-20 animate-slideUp">
                    <div
                        role="status"
                        aria-live="polite"
                        className={`flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-surface/95 backdrop-blur-md border shadow-float ${
                            saveStatus === 'error' || !validation.allValid
                                ? 'border-danger/35'
                                : saveStatus === 'saved' && !hasChanges
                                    ? 'border-success/35'
                                    : 'border-border-subtle'
                        }`}
                    >
                        <div className="flex items-center gap-2.5 text-[13px] min-w-0 flex-1">
                            {saving ? (
                                <>
                                    <Loader2 size={15} className="animate-spin text-brand-500 shrink-0" />
                                    <span className="font-semibold text-primary">Saving to your account…</span>
                                </>
                            ) : saveStatus === 'error' ? (
                                <>
                                    <AlertTriangle size={15} className="text-status-rejected shrink-0" />
                                    <div className="min-w-0">
                                        <span className="font-semibold text-status-rejected">
                                            {saveError || 'Saved locally, but cloud sync failed'}
                                        </span>
                                        <span className="hidden md:inline text-xs text-muted">
                                            {' '}· Retry to sync to your account
                                        </span>
                                    </div>
                                </>
                            ) : saveStatus === 'saved' && !hasChanges ? (
                                <>
                                    <CheckCircle2 size={16} className="text-status-confirmed shrink-0" />
                                    <span className="font-semibold text-primary">Saved &amp; synced to your account</span>
                                </>
                            ) : !validation.allValid ? (
                                <>
                                    <span className="w-2 h-2 rounded-full bg-danger shrink-0" aria-hidden="true" />
                                    <div className="min-w-0 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                                        <span className="font-semibold text-primary">Fix template warnings to save</span>
                                        {invalidTemplates.length > 0 && (
                                            <span className="text-xs text-muted">
                                                · Missing required tag in{' '}
                                                {invalidTemplates.map((tpl, index) => (
                                                    <span key={tpl.id}>
                                                        {index > 0 && ', '}
                                                        <button
                                                            type="button"
                                                            onClick={() => setActiveTemplateId(tpl.id)}
                                                            className="font-semibold text-status-rejected underline decoration-status-rejected/40 underline-offset-2 hover:decoration-status-rejected transition-colors"
                                                        >
                                                            {tpl.label}
                                                        </button>
                                                    </span>
                                                ))}
                                            </span>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <span className="w-2 h-2 rounded-full bg-warning shrink-0" aria-hidden="true" />
                                    <span className="font-semibold text-primary">Unsaved email changes</span>
                                    <span className="hidden sm:inline text-xs text-muted truncate">
                                        · {shortcutLabel('Mod', 'S')} to save
                                    </span>
                                </>
                            )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0 ml-auto">
                            {hasChanges && (
                                <Button variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>
                                    Discard
                                </Button>
                            )}
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={() => void onSave()}
                                disabled={!canSave}
                                loading={saving}
                            >
                                {!saving && (isRetrySync ? <RefreshCw size={13} /> : <Save size={13} />)}
                                {isRetrySync ? 'Retry sync' : 'Save changes'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reset single template dialog */}
            <ConfirmDialog
                open={confirmResetTemplate}
                title={`Reset "${activeMeta.label}" template?`}
                message={
                    activeMeta.sharedSubjectWith
                        ? `This restores the ${activeMeta.label} email body and the shared invitation subject (also used by ${activeMeta.sharedSubjectWith} invitations) to their default wording. Your changes won't be saved until you click Save changes.`
                        : `This restores the ${activeMeta.label} subject and body to their default wording. Your changes won't be saved until you click Save changes.`
                }
                confirmLabel="Reset template"
                variant="warning"
                onConfirm={() => {
                    onChangeConfig(prev => resetSingleTemplate(activeMeta, prev));
                    setConfirmResetTemplate(false);
                }}
                onCancel={() => setConfirmResetTemplate(false)}
            />

            {/* Reset all email settings dialog */}
            <ConfirmDialog
                open={confirmResetAll}
                title="Reset all email settings?"
                message="All 6 email templates, typography settings and logo branding will be restored to their defaults. Your Documents and Excel settings will not be affected."
                confirmLabel="Reset all"
                variant="danger"
                onConfirm={async () => {
                    try {
                        await onResetAll();
                    } finally {
                        setConfirmResetAll(false);
                    }
                }}
                onCancel={() => setConfirmResetAll(false)}
            />
        </div>
    );
}
