import { useState, useEffect } from 'react';
import { ArrowDown, ArrowUp, BookOpen, Users, Globe, Languages, Mail, BellRing, AlertTriangle } from 'lucide-react';
import { Course, CourseEmailInfo, DocumentTemplate, templateLabel } from '../lib/types';
import { getConfig, type InviteEmailKind } from '../lib/appConfig';
import { buildEmailBodyHtml } from '../lib/emailTemplates';
import { cardTextStyle } from '../lib/emailFormat';
import EmailEditor from './EmailEditor/EmailEditor';
import Modal, { FormError } from './ui/Modal';
import Badge from './ui/Badge';
import { Button, IconButton } from './ui/Button';
import { Segmented } from './ui/Tabs';
import { fieldCls, labelCls } from './ui/styles';
import FieldError from './ui/FieldError';
import ConfirmDialog from './ConfirmDialog';
import { useFieldErrors } from '../hooks/useFieldErrors';

interface Props {
    open: boolean;
    course: Course | null;
    /** Document templates (active templates, plus any switched-off ones already picked for this course) */
    templates: DocumentTemplate[];
    onSave: (data: { id?: string; name: string; requires_english?: boolean; max_capacity?: number | null; template_ids: string[]; email_templates: CourseEmailInfo }) => Promise<void>;
    onClose: () => void;
    /** Other courses, to catch a name that is already taken */
    existingCourses?: Pick<Course, 'id' | 'name'>[];
    /** People currently confirmed on this course (all dates), to warn when the limit is set below it */
    confirmedCount?: number;
}

/** A titled block of the form, with one line of help under the title */
function Section({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
    return (
        <section className="rounded-xl border border-border-subtle p-4 space-y-4">
            <div>
                <h3 className="text-sm font-semibold text-primary">{title}</h3>
                {help && <p className="text-xs text-muted mt-0.5">{help}</p>}
            </div>
            {children}
        </section>
    );
}

/** "Sat, 28 Nov 2026" style date one week from today, for the email preview */
function sampleDate(): string {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/** Drop fields left empty (the editor leaves "<p></p>" behind). */
function compactInfo(t: CourseEmailInfo): CourseEmailInfo {
    return Object.fromEntries(Object.entries(t).filter(([, v]) => v && v.replace(/<[^>]+>|&nbsp;/g, '').trim())) as CourseEmailInfo;
}

export default function CourseModal({ open, course, templates, onSave, onClose, existingCourses, confirmedCount = 0 }: Props) {
    const [name, setName] = useState('');
    const [requiresEnglish, setRequiresEnglish] = useState(false);
    const [maxCapacity, setMaxCapacity] = useState('');
    // Includes ids of switched-off templates too, so they come back if re-enabled
    const [templateIds, setTemplateIds] = useState<string[]>([]);
    const [courseInfo, setCourseInfo] = useState<CourseEmailInfo>({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const { errors, check, formProps, fieldProps } = useFieldErrors();
    const [confirmDiscard, setConfirmDiscard] = useState(false);

    useEffect(() => {
        if (open) {
            setName(course?.name || '');
            setRequiresEnglish(Boolean(course?.requires_english));
            setMaxCapacity(course?.max_capacity ? String(course.max_capacity) : '');
            setTemplateIds(course?.template_ids || []);
            setCourseInfo(course?.email_templates || {});
            setError('');
        }
    }, [open, course]);

    const requestClose = () => {
        if (saving) return;
        const dirty = name.trim() !== (course?.name || '').trim()
            || requiresEnglish !== Boolean(course?.requires_english)
            || maxCapacity.trim() !== (course?.max_capacity ? String(course.max_capacity) : '')
            || templateIds.join() !== (course?.template_ids || []).join()
            || JSON.stringify(compactInfo(courseInfo)) !== JSON.stringify(compactInfo(course?.email_templates || {}));
        if (dirty) {
            setConfirmDiscard(true);
            return;
        }
        onClose();
    };

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (saving || !check(e.currentTarget)) return;
        if (!name.trim()) {
            setError('Course name is required');
            return;
        }
        if (duplicateName) {
            setError(`A course called "${duplicateName}" already exists. Please choose a different name.`);
            return;
        }
        const capacityStr = maxCapacity.trim();
        const capacity = capacityStr === '' ? null : Number(capacityStr);
        if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) {
            setError('Max participants must be a whole number of at least 1 (or leave empty for unlimited)');
            return;
        }
        setSaving(true);
        setError('');
        try {
            await onSave({ id: course?.id, name: name.trim(), requires_english: requiresEnglish, max_capacity: capacity, template_ids: templateIds, email_templates: compactInfo(courseInfo) });
            onClose();
        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('Failed to save course');
            }
        } finally {
            setSaving(false);
        }
    }

    const isEditing = !!course?.id;
    // Same name as another course (ignoring case and extra spaces)
    const normName = name.trim().replace(/\s+/g, ' ').toLowerCase();
    const duplicateName = normName
        ? existingCourses?.find(c => c.id !== course?.id && c.name.trim().replace(/\s+/g, ' ').toLowerCase() === normName)?.name
        : undefined;
    const capacityNum = Number(maxCapacity);
    const capacityBelowConfirmed = maxCapacity.trim() !== '' && Number.isInteger(capacityNum) && capacityNum >= 1 && capacityNum < confirmedCount;
    const [previewDate] = useState(sampleDate);

    // Preview of the course card in the invitation / reminder email
    const [previewKind, setPreviewKind] = useState<InviteEmailKind | null>(null);
    // Same look as the course card in the email (Settings → Email text style sets the font)
    const [cardStyle] = useState(() => cardTextStyle(getConfig().emailStyle));
    const infoEditor = (key: keyof CourseEmailInfo, label: string, hint: string) => (
        <div>
            <span className={labelCls}>{label}</span>
            <EmailEditor
                // A different course (or reopening the modal) starts from its own text
                key={`${course?.id ?? 'new'}-${open}`}
                variant="card"
                value={courseInfo[key] || ''}
                onChange={html => setCourseInfo(prev => ({ ...prev, [key]: html }))}
                textStyle={cardStyle}
                placeholder={hint}
                minHeight={90}
                maxHeight={280}
                ariaLabel={label}
            />
        </div>
    );

    const templateOption = (value: boolean, Icon: typeof Globe, title: string, desc: string) => {
        const active = requiresEnglish === value;
        return (
            <button
                type="button"
                onClick={() => setRequiresEnglish(value)}
                aria-pressed={active}
                className={`p-3 rounded-xl border text-left transition-colors flex items-start gap-3 ${
                    active ? 'bg-brand-500/6 border-brand-500 ring-1 ring-brand-500' : 'bg-surface border-border-subtle hover:border-border-strong'
                }`}
            >
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${active ? 'bg-brand-500 text-white' : 'bg-surface-elevated text-muted'}`}>
                    <Icon size={16} />
                </span>
                <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                        {title}
                        {active && <span className="text-xs font-semibold text-brand-600 dark:text-brand-400">Selected</span>}
                    </span>
                    <span className="block text-xs text-muted mt-0.5">{desc}</span>
                </span>
            </button>
        );
    };

    return (
        <Modal
            open={open}
            onClose={requestClose}
            title={isEditing ? 'Edit Course' : 'Add Course'}
            icon={BookOpen}
            tone="completed"
            size="xl"
            labelId="course-modal-title"
            dismissible={!saving}
            footer={
                <>
                    <Button variant="ghost" onClick={requestClose}>Cancel</Button>
                    <Button variant="primary" type="submit" form="course-form" loading={saving}>
                        {saving ? 'Saving...' : isEditing ? 'Update Course' : 'Add Course'}
                    </Button>
                </>
            }
        >
            <form id="course-form" onSubmit={handleSubmit} {...formProps} className="space-y-4">
                {error && <FormError>{error}</FormError>}

                <Section title="Basics" help="What the course is called.">
                    <div>
                        <label htmlFor="course-name" className={labelCls}>Course name *</label>
                        <input
                            id="course-name"
                            type="text"
                            placeholder="e.g. Security, First Aid"
                            className={fieldCls}
                            value={name}
                            onChange={e => setName(e.target.value)}
                            autoFocus
                            required
                            {...fieldProps('course-name')}
                        />
                        <FieldError id="course-name" message={errors['course-name']} />
                        {duplicateName && (
                            <p className="text-xs text-status-requested mt-1.5 flex items-start gap-1.5" role="alert">
                                <AlertTriangle size={13} className="shrink-0 mt-px" />
                                A course called "{duplicateName}" already exists. Pick a different name so staff can tell them apart.
                            </p>
                        )}
                    </div>
                </Section>

                <Section title="Places" help="How many people can attend each date.">
                    <div>
                        <label htmlFor="course-max-capacity" className={labelCls}>Max participants per date</label>
                        <div className="relative">
                            <Users size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                            <input
                                id="course-max-capacity"
                                type="number"
                                inputMode="numeric"
                                min={1}
                                step={1}
                                placeholder="Unlimited"
                                className={`${fieldCls} pl-9`}
                                value={maxCapacity}
                                onChange={e => setMaxCapacity(e.target.value)}
                                {...fieldProps('course-max-capacity')}
                            />
                        </div>
                        <FieldError id="course-max-capacity" message={errors['course-max-capacity']} />
                        {capacityBelowConfirmed && (
                            <p className="text-xs text-status-requested mt-1.5 flex items-start gap-1.5" role="status">
                                <AlertTriangle size={13} className="shrink-0 mt-px" />
                                {confirmedCount} people are already confirmed on this course (all dates together). You can still save: nobody is removed, but a date with more than {capacityNum} confirmed will be over the limit.
                            </p>
                        )}
                        <p className="text-xs text-muted mt-1.5">
                            Once this many people confirm for a date, the confirmation page closes and shows the course as fully booked. Leave empty for no limit.
                        </p>
                    </div>
                </Section>

                <Section title="Invitation email" help="Which letter is sent, and the course details shown in it. The course name and date are filled in automatically.">
                    <div>
                        <span className={labelCls}>Which invitation letter</span>
                        <div className="grid grid-cols-1 gap-2">
                            {templateOption(false, Globe, 'Standard Course', 'Standard invitation letter with [Confirm My Place] button.')}
                            {templateOption(true, Languages, 'High English Required', 'Includes English warning notes & [I Am Confident in English — Confirm My Place] button.')}
                        </div>
                    </div>

                    <div className="space-y-3">
                        {infoEditor('description', 'Under the course title', 'e.g. Overview: what the course covers')}
                        {infoEditor('details', 'Under the date', 'e.g. Duration, time, address, what to bring')}
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted">Preview:</span>
                            <Segmented<InviteEmailKind | 'none'>
                                ariaLabel="Email preview"
                                size="sm"
                                value={previewKind ?? 'none'}
                                onChange={v => setPreviewKind(v === 'none' ? null : v)}
                                options={[
                                    { value: 'none', label: 'Off' },
                                    { value: 'invite', label: 'Invitation', icon: <Mail size={12} /> },
                                    { value: 'reminder', label: 'Reminder', icon: <BellRing size={12} /> },
                                ]}
                            />
                        </div>
                        {previewKind && (
                            <iframe
                                srcDoc={buildEmailBodyHtml(name || 'Course', previewDate, previewKind === 'invite' ? '#' : undefined, undefined, 7, requiresEnglish, previewKind, courseInfo)}
                                title="Course email preview"
                                sandbox=""
                                className="w-full h-[360px] sm:h-[420px] border border-border-subtle rounded-lg bg-white"
                            />
                        )}
                    </div>
                </Section>

                <Section title="Documents" help="The Word documents made for this course.">
                    <div>
                        <span className={labelCls}>Templates used for this course</span>
                        {(() => {
                            const visibleTemplates = templates.filter(t => t.is_active || templateIds.includes(t.id));
                            if (visibleTemplates.length === 0) {
                                return <p className="text-xs text-muted">No active templates — upload and switch them on in Documents.</p>;
                            }
                            const checkedVisibleIds = templateIds.filter(id => visibleTemplates.some(t => t.id === id));
                            const orderedTemplates = [
                                ...checkedVisibleIds.map(id => visibleTemplates.find(t => t.id === id)!),
                                ...visibleTemplates.filter(t => !templateIds.includes(t.id)),
                            ];
                            const moveTemplate = (id: string, delta: -1 | 1) => {
                                setTemplateIds(prev => {
                                    const visibleIds = prev.filter(pid => visibleTemplates.some(t => t.id === pid));
                                    const idx = visibleIds.indexOf(id);
                                    const targetIdx = idx + delta;
                                    if (idx < 0 || targetIdx < 0 || targetIdx >= visibleIds.length) return prev;
                                    const otherId = visibleIds[targetIdx];
                                    return prev.map(pid => pid === id ? otherId : pid === otherId ? id : pid);
                                });
                            };
                            return (
                                <div className="rounded-xl border border-border-subtle divide-y divide-border-subtle max-h-56 overflow-y-auto">
                                    {orderedTemplates.map(t => {
                                        const checkedIdx = checkedVisibleIds.indexOf(t.id);
                                        const checked = checkedIdx !== -1;
                                        const label = templateLabel(t);
                                        return (
                                            <div key={t.id} className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-primary hover:bg-surface-elevated/50">
                                                <label className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        className="accent-brand-500"
                                                        checked={checked}
                                                        onChange={() => setTemplateIds(prev => prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id])}
                                                    />
                                                    {checked && (
                                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 text-xs font-semibold tabular-nums shrink-0" title={`Document number ${checkedIdx + 1}`}>{checkedIdx + 1}</span>
                                                    )}
                                                    <span className={`truncate ${t.is_active ? '' : 'text-muted line-through'}`} title={label}>{label}</span>
                                                    {!t.is_active && (
                                                        <Badge tone="warning" shape="pill" className="shrink-0">Off</Badge>
                                                    )}
                                                </label>
                                                {checked && checkedVisibleIds.length > 1 && (
                                                    <span className="flex items-center shrink-0">
                                                        <IconButton
                                                            size="sm"
                                                            label={`Move ${label} up`}
                                                            title="Move up"
                                                            disabled={checkedIdx === 0}
                                                            onClick={() => moveTemplate(t.id, -1)}
                                                        >
                                                            <ArrowUp size={13} />
                                                        </IconButton>
                                                        <IconButton
                                                            size="sm"
                                                            label={`Move ${label} down`}
                                                            title="Move down"
                                                            disabled={checkedIdx === checkedVisibleIds.length - 1}
                                                            onClick={() => moveTemplate(t.id, 1)}
                                                        >
                                                            <ArrowDown size={13} />
                                                        </IconButton>
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })()}
                        <p className="text-xs text-muted mt-1.5">
                            Tick the Word documents to make for this course. The numbers show the order they are made in; use the arrows to change it. Pick none to use all active templates; if everything picked is switched off later, the course gets no Word documents until you switch one back on.
                        </p>
                    </div>
                </Section>
            </form>
            <ConfirmDialog
                open={confirmDiscard}
                title="Discard changes?"
                message="Your changes to this course will be lost."
                confirmLabel="Discard"
                variant="warning"
                onConfirm={() => { setConfirmDiscard(false); onClose(); }}
                onCancel={() => setConfirmDiscard(false)}
            />
        </Modal>
    );
}
