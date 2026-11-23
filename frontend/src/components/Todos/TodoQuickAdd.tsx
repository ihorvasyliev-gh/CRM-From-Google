import { useEffect, useRef, useState } from 'react';
import {
    BookOpen,
    Calendar,
    ChevronDown,
    Flame,
    ListChecks,
    Pin,
    Plus,
    Sparkles,
    UserCheck,
    X,
} from 'lucide-react';
import type { Course } from '../../lib/types';
import {
    addDaysISO,
    adminDisplayName,
    createChecklistItem,
    TODO_CATEGORIES,
    TODO_PRIORITIES,
    TODO_TEMPLATES,
    type AdminProfile,
    type TodoCategory,
    type TodoChecklistItem,
    type TodoLinkedStudent,
    type TodoPriority,
    type TodoTemplate,
} from '../../lib/todos';
import { todayISO } from '../../lib/dateUtils';
import type { CreateTodoInput } from '../../hooks/useTodos';
import { Button } from '../ui/Button';
import { DateInput } from '../ui/DatePicker';
import { CATEGORY_META, PRIORITY_META } from './todoMeta';
import TodoStudentPicker from './TodoStudentPicker';

export interface TodoDraftSeed {
    key: number;
    focus?: boolean;
    category?: TodoCategory;
    student?: TodoLinkedStudent | null;
    courseId?: string | null;
    courseDate?: string | null;
}

export interface TodoQuickAddProps {
    courses: readonly Course[];
    profiles: readonly AdminProfile[];
    currentUserId?: string;
    disabled?: boolean;
    submitting?: boolean;
    seed?: TodoDraftSeed | null;
    onSubmit: (input: CreateTodoInput) => Promise<void> | void;
}

export default function TodoQuickAdd({
    courses,
    profiles,
    currentUserId,
    disabled = false,
    submitting = false,
    seed,
    onSubmit,
}: TodoQuickAddProps) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState<TodoCategory>('general');
    const [priority, setPriority] = useState<TodoPriority>('normal');
    const [isPinned, setIsPinned] = useState(false);
    const [dueDate, setDueDate] = useState('');
    const [assigneeId, setAssigneeId] = useState('');
    const [courseId, setCourseId] = useState('');
    const [courseDate, setCourseDate] = useState('');
    const [student, setStudent] = useState<TodoLinkedStudent | null>(null);
    const [checklist, setChecklist] = useState<TodoChecklistItem[]>([]);
    const [expanded, setExpanded] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const [templatesOpen, setTemplatesOpen] = useState(false);

    const inputRef = useRef<HTMLInputElement>(null);
    const templateWrapRef = useRef<HTMLDivElement>(null);

    // Apply incoming seed (from StudentDetail "Add To-Do", Dashboard "+ Add", or Command Palette)
    useEffect(() => {
        if (!seed) return;
        setExpanded(true);
        if (seed.category) setCategory(seed.category);
        if (seed.student !== undefined) setStudent(seed.student);
        if (seed.courseId !== undefined) setCourseId(seed.courseId ?? '');
        if (seed.courseDate !== undefined) setCourseDate(seed.courseDate ?? '');
        if (seed.focus) {
            setTimeout(() => inputRef.current?.focus(), 40);
        }
    }, [seed]);

    useEffect(() => {
        if (!templatesOpen) return;
        const onDown = (e: MouseEvent) => {
            if (!templateWrapRef.current?.contains(e.target as Node)) setTemplatesOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setTemplatesOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [templatesOpen]);

    const applyTemplate = (tpl: TodoTemplate) => {
        setTitle(tpl.defaultTitle);
        setCategory(tpl.category);
        setPriority(tpl.priority);
        setChecklist(tpl.checklist.map(text => createChecklistItem(text)));
        setExpanded(true);
        setShowDetails(true);
        setTemplatesOpen(false);
        setTimeout(() => {
            const el = inputRef.current;
            if (el) {
                el.focus();
                el.setSelectionRange(el.value.length, el.value.length);
            }
        }, 20);
    };

    const reset = () => {
        setTitle('');
        setDescription('');
        setCategory('general');
        setPriority('normal');
        setIsPinned(false);
        setDueDate('');
        setAssigneeId('');
        setCourseId('');
        setCourseDate('');
        setStudent(null);
        setChecklist([]);
        setShowDetails(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (disabled || submitting) return;
        const trimmed = title.trim();
        if (!trimmed) {
            inputRef.current?.focus();
            return;
        }
        await onSubmit({
            title: trimmed,
            description,
            category,
            priority,
            is_pinned: isPinned,
            due_date: dueDate || null,
            assignee_id: assigneeId || null,
            course_id: courseId || null,
            course_date: courseId ? (courseDate || null) : null,
            student_id: student?.id ?? null,
            checklist,
        });
        reset();
    };

    const today = todayISO();
    const tomorrow = addDaysISO(today, 1);

    return (
        <form
            onSubmit={handleSubmit}
            className="rounded-2xl bg-surface border border-border-subtle shadow-card transition-colors focus-within:border-brand-500/50"
        >
            {/* Primary Quick-Add Row */}
            <div className="flex items-center gap-2 p-3 sm:px-4">
                <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 shrink-0">
                    <Plus size={16} />
                </span>
                <input
                    ref={inputRef}
                    type="text"
                    value={title}
                    disabled={disabled}
                    onFocus={() => setExpanded(true)}
                    onChange={e => {
                        setTitle(e.target.value);
                        if (!expanded) setExpanded(true);
                    }}
                    placeholder="Add a task, booking or team note… (Enter to save)"
                    maxLength={300}
                    aria-label="New to-do title"
                    className="flex-1 min-w-0 h-9 bg-transparent text-sm font-medium text-primary placeholder:text-muted/70 focus:outline-hidden disabled:opacity-50"
                />

                {/* Templates Dropdown */}
                <div ref={templateWrapRef} className="relative shrink-0">
                    <button
                        type="button"
                        disabled={disabled}
                        onClick={() => setTemplatesOpen(o => !o)}
                        aria-haspopup="menu"
                        aria-expanded={templatesOpen}
                        className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl bg-surface-elevated hover:bg-surface-elevated/80 border border-border-subtle text-xs font-semibold text-muted hover:text-primary transition-colors cursor-pointer disabled:opacity-50"
                        title="Start from a checklist template"
                    >
                        <Sparkles size={13} className="text-brand-500" />
                        <span className="hidden sm:inline">Templates</span>
                        <ChevronDown size={12} />
                    </button>

                    {templatesOpen && (
                        <div
                            role="menu"
                            className="absolute right-0 top-full mt-1.5 z-60 w-72 rounded-xl bg-surface border border-border-subtle shadow-float p-1.5 space-y-0.5 animate-scaleIn"
                        >
                            <p className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
                                Quick templates
                            </p>
                            {TODO_TEMPLATES.map(tpl => {
                                const cat = CATEGORY_META[tpl.category];
                                const CatIcon = cat.icon;
                                return (
                                    <button
                                        key={tpl.id}
                                        type="button"
                                        role="menuitem"
                                        onClick={() => applyTemplate(tpl)}
                                        className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-surface-elevated transition-colors cursor-pointer flex items-start gap-2.5"
                                    >
                                        <span className={`mt-0.5 flex items-center justify-center w-6 h-6 rounded-lg border shrink-0 ${cat.pillCls}`}>
                                            <CatIcon size={13} />
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold text-primary">{tpl.label}</p>
                                            <p className="text-[11px] text-muted leading-snug">{tpl.description}</p>
                                            <p className="text-[10px] text-brand-600 dark:text-brand-400 font-medium mt-0.5">
                                                {tpl.checklist.length} checklist steps
                                            </p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={disabled || !title.trim()}
                    loading={submitting}
                >
                    Add
                </Button>
            </div>

            {/* Secondary Chips & Options Bar */}
            {expanded && (
                <div className="px-3 sm:px-4 pb-3 pt-2 border-t border-border-subtle/70 space-y-2.5 bg-surface-elevated/25 rounded-b-2xl">
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Category */}
                        <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Category">
                            {TODO_CATEGORIES.map(catKey => {
                                const meta = CATEGORY_META[catKey];
                                const Icon = meta.icon;
                                const active = category === catKey;
                                return (
                                    <button
                                        key={catKey}
                                        type="button"
                                        onClick={() => setCategory(catKey)}
                                        aria-pressed={active}
                                        className={`inline-flex items-center gap-1 h-7 px-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                                            active
                                                ? meta.pillCls
                                                : 'bg-surface text-muted border-border-subtle hover:text-primary hover:bg-surface-elevated'
                                        }`}
                                    >
                                        <Icon size={12} />
                                        <span>{meta.shortLabel}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <span className="hidden sm:inline-block w-px h-5 bg-border-subtle" aria-hidden />

                        {/* Priority */}
                        <div className="inline-flex items-center gap-1" role="group" aria-label="Priority">
                            {TODO_PRIORITIES.map(pKey => {
                                const meta = PRIORITY_META[pKey];
                                const active = priority === pKey;
                                return (
                                    <button
                                        key={pKey}
                                        type="button"
                                        onClick={() => setPriority(pKey)}
                                        aria-pressed={active}
                                        className={`inline-flex items-center gap-1 h-7 px-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                                            active
                                                ? meta.pillCls
                                                : 'bg-surface text-muted border-border-subtle hover:text-primary hover:bg-surface-elevated'
                                        }`}
                                    >
                                        {pKey === 'urgent' && <Flame size={11} />}
                                        <span>{meta.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Pin toggle */}
                        <button
                            type="button"
                            onClick={() => setIsPinned(p => !p)}
                            aria-pressed={isPinned}
                            className={`inline-flex items-center gap-1 h-7 px-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                                isPinned
                                    ? 'bg-amber-500/15 text-status-requested border-amber-500/30'
                                    : 'bg-surface text-muted border-border-subtle hover:text-primary hover:bg-surface-elevated'
                            }`}
                            title="Pin to top"
                        >
                            <Pin size={12} />
                            <span>{isPinned ? 'Pinned' : 'Pin'}</span>
                        </button>
                    </div>

                    {/* Row 2: Due date, Assignee, CRM Links */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Due date + shortcuts */}
                        <div className="inline-flex items-center gap-1">
                            <DateInput
                                value={dueDate}
                                onChange={setDueDate}
                                placeholder="Due date"
                                className="h-8 px-2.5 rounded-xl bg-surface border border-border-subtle text-xs font-medium min-w-[132px] hover:bg-surface-elevated transition-colors"
                            />
                            {!dueDate ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => setDueDate(today)}
                                        className="h-8 px-2 rounded-xl bg-surface hover:bg-surface-elevated border border-border-subtle text-xs font-medium text-muted hover:text-primary transition-colors cursor-pointer"
                                    >
                                        Today
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDueDate(tomorrow)}
                                        className="h-8 px-2 rounded-xl bg-surface hover:bg-surface-elevated border border-border-subtle text-xs font-medium text-muted hover:text-primary transition-colors cursor-pointer hidden sm:inline-flex items-center"
                                    >
                                        Tomorrow
                                    </button>
                                </>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setDueDate('')}
                                    aria-label="Clear due date"
                                    className="h-8 w-8 inline-flex items-center justify-center rounded-xl bg-surface hover:bg-surface-elevated border border-border-subtle text-muted hover:text-primary cursor-pointer"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>

                        {/* Assignee */}
                        <label className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl bg-surface border border-border-subtle text-xs text-muted hover:border-border-strong transition-colors">
                            <UserCheck size={13} className="shrink-0" />
                            <select
                                aria-label="Assign to admin"
                                value={assigneeId}
                                onChange={e => setAssigneeId(e.target.value)}
                                className="bg-transparent text-xs font-medium text-primary focus:outline-hidden cursor-pointer max-w-[140px]"
                            >
                                <option value="">Anyone</option>
                                {profiles.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {adminDisplayName(p)}{p.id === currentUserId ? ' (me)' : ''}
                                    </option>
                                ))}
                            </select>
                        </label>

                        {/* Course link */}
                        <label className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl bg-surface border border-border-subtle text-xs text-muted hover:border-border-strong transition-colors">
                            <BookOpen size={13} className="shrink-0" />
                            <select
                                aria-label="Link course"
                                value={courseId}
                                onChange={e => {
                                    setCourseId(e.target.value);
                                    if (!e.target.value) setCourseDate('');
                                }}
                                className="bg-transparent text-xs font-medium text-primary focus:outline-hidden cursor-pointer max-w-[160px]"
                            >
                                <option value="">Link course…</option>
                                {courses.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </label>

                        {/* Optional course session date when a course is selected */}
                        {courseId && (
                            <div className="inline-flex items-center gap-1">
                                <DateInput
                                    value={courseDate}
                                    onChange={setCourseDate}
                                    placeholder="Session date"
                                    className="h-8 px-2.5 rounded-xl bg-brand-500/5 border border-brand-500/25 text-xs font-medium min-w-[132px] hover:bg-brand-500/10 transition-colors"
                                />
                                {courseDate && (
                                    <button
                                        type="button"
                                        onClick={() => setCourseDate('')}
                                        aria-label="Clear session date"
                                        className="h-8 w-8 inline-flex items-center justify-center rounded-xl bg-surface hover:bg-surface-elevated border border-border-subtle text-muted hover:text-primary cursor-pointer"
                                    >
                                        <X size={13} />
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Student link */}
                        <TodoStudentPicker value={student} onChange={setStudent} compact />

                        {/* Toggle notes / checklist */}
                        <button
                            type="button"
                            onClick={() => setShowDetails(s => !s)}
                            className="ml-auto inline-flex items-center gap-1 h-8 px-2.5 rounded-xl text-xs font-medium text-muted hover:text-primary hover:bg-surface transition-colors cursor-pointer"
                        >
                            <ListChecks size={13} />
                            <span>{showDetails ? 'Hide details' : 'Notes / Checklist'}</span>
                            {checklist.length > 0 && (
                                <span className="px-1.5 rounded-full bg-brand-500/15 text-brand-600 dark:text-brand-400 font-bold text-[11px]">
                                    {checklist.length}
                                </span>
                            )}
                        </button>
                    </div>

                    {/* Optional Description + Template Checklist Preview */}
                    {showDetails && (
                        <div className="space-y-2 pt-1">
                            <textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                rows={2}
                                maxLength={5000}
                                placeholder="Details, room address, trainer contact, booking ref, etc. (optional)"
                                className="w-full px-3 py-2 rounded-xl bg-surface border border-border-subtle text-xs text-primary placeholder:text-muted/70 focus:outline-hidden focus:border-brand-500 resize-y"
                            />

                            {checklist.length > 0 && (
                                <div className="rounded-xl bg-surface border border-border-subtle p-2.5 space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1">
                                            <Calendar size={11} />
                                            Pre-filled checklist ({checklist.length})
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setChecklist([])}
                                            className="text-[11px] font-semibold text-muted hover:text-status-rejected cursor-pointer"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                    <ul className="space-y-1">
                                        {checklist.map(item => (
                                            <li key={item.id} className="flex items-center justify-between gap-2 text-xs text-primary">
                                                <span className="truncate">• {item.text}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setChecklist(prev => prev.filter(c => c.id !== item.id))}
                                                    aria-label={`Remove ${item.text}`}
                                                    className="p-0.5 text-muted hover:text-status-rejected cursor-pointer shrink-0"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </form>
    );
}
