import { useState, useEffect } from 'react';
import { BookOpen, Users, Globe, Languages, Mail, BellRing } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { Course, CourseEmailInfo, DocumentTemplate } from '../lib/types';
import { buildEmailBodyHtml, type InviteEmailKind } from '../lib/appConfig';
import Modal, { FormError } from './ui/Modal';
import { Button } from './ui/Button';
import { Segmented } from './ui/Tabs';
import { fieldCls, labelCls, quillWrapCls } from './ui/styles';

interface Props {
    open: boolean;
    course: Course | null;
    /** Active document templates the course can pick from */
    templates: DocumentTemplate[];
    onSave: (data: { id?: string; name: string; requires_english?: boolean; max_capacity?: number | null; template_ids: string[]; email_templates: CourseEmailInfo }) => Promise<void>;
    onClose: () => void;
}

const quillModules = {
    toolbar: [
        ['bold', 'italic', 'underline'],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        ['link'],
        ['clean'],
    ]
};

/** Drop fields left empty (Quill leaves "<p><br></p>" behind). */
function compactInfo(t: CourseEmailInfo): CourseEmailInfo {
    return Object.fromEntries(Object.entries(t).filter(([, v]) => v && v.replace(/<[^>]+>|&nbsp;/g, '').trim())) as CourseEmailInfo;
}

export default function CourseModal({ open, course, templates, onSave, onClose }: Props) {
    const [name, setName] = useState('');
    const [requiresEnglish, setRequiresEnglish] = useState(false);
    const [maxCapacity, setMaxCapacity] = useState('');
    // Includes ids of switched-off templates too, so they come back if re-enabled
    const [templateIds, setTemplateIds] = useState<string[]>([]);
    const [courseInfo, setCourseInfo] = useState<CourseEmailInfo>({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

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
        if (dirty && !window.confirm('Discard unsaved changes?')) return;
        onClose();
    };

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (saving) return;
        if (!name.trim()) {
            setError('Course name is required');
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

    // Preview of the course card in the invitation / reminder email
    const [previewKind, setPreviewKind] = useState<InviteEmailKind | null>(null);
    const infoEditor = (key: keyof CourseEmailInfo, label: string, hint: string) => (
        <div>
            <span className={labelCls}>{label}</span>
            <div className={`${quillWrapCls} [&_.ql-editor]:min-h-[90px] [&_.ql-editor]:max-h-[240px]`}>
                <ReactQuill
                    theme="snow"
                    value={courseInfo[key] || ''}
                    onChange={(content, _delta, source) => {
                        // Quill normalises the HTML on mount; only keep real edits
                        if (source === 'user') setCourseInfo(prev => ({ ...prev, [key]: content }));
                    }}
                    modules={quillModules}
                    placeholder={hint}
                />
            </div>
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
                        {active && <span className="text-[10px] font-semibold text-brand-600 dark:text-brand-400">Selected</span>}
                    </span>
                    <span className="block text-[11px] text-muted mt-0.5">{desc}</span>
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
            <form id="course-form" onSubmit={handleSubmit} className="space-y-4">
                {error && <FormError>{error}</FormError>}

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
                    />
                </div>

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
                        />
                    </div>
                    <p className="text-[11px] text-muted mt-1.5">
                        Once this many people confirm for a date, the confirmation page closes and shows the course as fully booked. Leave empty for no limit.
                    </p>
                </div>

                <div>
                    <span className={labelCls}>Invitation email template</span>
                    <div className="grid grid-cols-1 gap-2">
                        {templateOption(false, Globe, 'Standard Course', 'Standard invitation letter with [Confirm My Place] button.')}
                        {templateOption(true, Languages, 'High English Required', 'Includes English warning notes & [I Am Confident in English — Confirm My Place] button.')}
                    </div>
                </div>

                <div>
                    <span className={labelCls}>Document templates</span>
                    {templates.length === 0 ? (
                        <p className="text-[11px] text-muted">No active templates — upload and switch them on in Documents.</p>
                    ) : (
                        <div className="rounded-xl border border-border-subtle divide-y divide-border-subtle max-h-56 overflow-y-auto">
                            {templates.map(t => (
                                <label key={t.id} className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-primary cursor-pointer hover:bg-surface-elevated/50">
                                    <input
                                        type="checkbox"
                                        className="accent-brand-500"
                                        checked={templateIds.includes(t.id)}
                                        onChange={() => setTemplateIds(prev => prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id])}
                                    />
                                    <span className="truncate" title={t.name}>{t.name}</span>
                                </label>
                            ))}
                        </div>
                    )}
                    <p className="text-[11px] text-muted mt-1.5">
                        Used when generating documents for this course. Pick none to use all active templates.
                    </p>
                </div>

                <div className="space-y-3">
                    <p className="text-[11px] text-muted">
                        Shown in the course card of the invitation and reminder emails. The course name and date are filled in automatically.
                    </p>
                    {infoEditor('description', 'Under the course title', 'e.g. Overview: what the course covers')}
                    {infoEditor('details', 'Under the date', 'e.g. Duration, time, address, what to bring')}
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted">Preview:</span>
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
                            srcDoc={buildEmailBodyHtml(name || 'Course', 'Wed, 7 Oct 2026', previewKind === 'invite' ? '#' : undefined, undefined, 7, requiresEnglish, previewKind, courseInfo)}
                            title="Course email preview"
                            sandbox=""
                            className="w-full h-[420px] border border-border-subtle rounded-lg bg-white"
                        />
                    )}
                </div>
            </form>
        </Modal>
    );
}
