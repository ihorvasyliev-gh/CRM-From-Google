import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, FileText, Layers, RotateCcw, Save } from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { Button, IconButton } from '../ui/Button';
import SearchInput from '../ui/SearchInput';
import { EmptyState } from '../ui/States';
import { calloutCls } from '../ui/styles';
import { errorText, plural, type ShowToast } from './helpers';
import type { DocumentSetup } from './useDocumentSetup';
import { coursePreset } from '../../lib/documentUtils';
import { templateLabel, type Course, type DocumentTemplate } from '../../lib/types';

export interface CoursePresetsPanelProps {
    courses: Course[];
    setup: DocumentSetup;
    showToast: ShowToast;
    initialCourseId?: string;
}

export function CoursePresetsPanel({
    courses,
    setup,
    showToast,
    initialCourseId,
}: CoursePresetsPanelProps) {
    const { templates } = setup;
    const [query, setQuery] = useState('');
    const [selectedCourseId, setSelectedCourseId] = useState<string>(() => {
        if (initialCourseId && courses.some(c => c.id === initialCourseId)) return initialCourseId;
        return courses[0]?.id ?? '';
    });

    // Select initialCourseId when navigated here from Generate tab
    useEffect(() => {
        if (initialCourseId && courses.some(c => c.id === initialCourseId)) {
            setSelectedCourseId(initialCourseId);
            setQuery('');
        }
    }, [initialCourseId, courses]);

    // Ensure a valid course stays selected as courses load or change
    useEffect(() => {
        if (courses.length === 0) {
            setSelectedCourseId('');
            return;
        }
        if (!courses.some(c => c.id === selectedCourseId)) {
            const preferred = initialCourseId && courses.some(c => c.id === initialCourseId)
                ? initialCourseId
                : courses[0].id;
            setSelectedCourseId(preferred);
        }
    }, [courses, selectedCourseId, initialCourseId]);

    const selectedCourse = useMemo(
        () => courses.find(c => c.id === selectedCourseId) ?? null,
        [courses, selectedCourseId],
    );

    const existingIdSet = useMemo(() => new Set(templates.map(t => t.id)), [templates]);
    const activeTemplateCount = useMemo(() => templates.filter(t => t.is_active).length, [templates]);

    const savedIdsKey = (selectedCourse?.template_ids ?? [])
        .filter(id => existingIdSet.has(id))
        .join('\u001f');
    const savedIds = useMemo(
        () => (savedIdsKey ? savedIdsKey.split('\u001f') : []),
        [savedIdsKey],
    );

    const [draftIds, setDraftIds] = useState<string[]>(savedIds);

    useEffect(() => {
        setDraftIds(savedIds);
    }, [selectedCourse?.id, savedIds]);

    const isDirty = draftIds.length !== savedIds.length || draftIds.some((id, idx) => id !== savedIds[idx]);

    const filteredCourses = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? courses.filter(c => c.name.toLowerCase().includes(q)) : courses;
    }, [courses, query]);

    const customPresetCount = useMemo(
        () => courses.filter(c => coursePreset(templates, c.template_ids).state !== 'all').length,
        [courses, templates],
    );

    const draftPreset = useMemo(() => coursePreset(templates, draftIds), [templates, draftIds]);

    const orderedTemplates = useMemo(() => {
        const byId = new Map(templates.map(t => [t.id, t]));
        const picked = draftIds.map(id => byId.get(id)).filter((t): t is DocumentTemplate => !!t);
        const pickedSet = new Set(picked.map(t => t.id));
        const remaining = templates.filter(t => !pickedSet.has(t.id));
        return [...picked, ...remaining];
    }, [templates, draftIds]);

    const draftOffCount = useMemo(() => {
        const byId = new Map(templates.map(t => [t.id, t]));
        return draftIds.filter(id => {
            const tpl = byId.get(id);
            return tpl && !tpl.is_active;
        }).length;
    }, [templates, draftIds]);

    const saving = setup.saveCoursePreset.isPending;

    const toggleTemplate = (id: string) => {
        setDraftIds(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]));
    };

    const moveDraft = (fromIdx: number, delta: -1 | 1) => {
        const toIdx = fromIdx + delta;
        if (fromIdx < 0 || toIdx < 0 || toIdx >= draftIds.length) return;
        setDraftIds(prev => {
            const next = [...prev];
            const [moved] = next.splice(fromIdx, 1);
            next.splice(toIdx, 0, moved);
            return next;
        });
    };

    const handleSave = async () => {
        if (!selectedCourse || !isDirty) return;
        try {
            await setup.saveCoursePreset.mutateAsync({
                courseId: selectedCourse.id,
                templateIds: draftIds,
            });
            showToast(
                draftIds.length === 0
                    ? `"${selectedCourse.name}" now uses all active templates`
                    : `Preset saved for "${selectedCourse.name}" (${plural(draftIds.length, 'template')})`,
                'success',
            );
        } catch (err: unknown) {
            showToast(`Could not save preset: ${errorText(err)}`, 'error');
        }
    };

    return (
        <Card
            title="Course template presets"
            subtitle="Pick which Word templates (and in what order) each course uses by default"
            icon={Layers}
            tone="brand"
            divided
            action={
                courses.length > 0 ? (
                    <Badge
                        tone={customPresetCount > 0 ? 'brand' : 'neutral'}
                        shape="pill"
                        className="tabular-nums"
                    >
                        {customPresetCount} / {courses.length} customised
                    </Badge>
                ) : undefined
            }
        >
            {courses.length === 0 ? (
                <EmptyState
                    bare
                    icon={<Layers size={20} />}
                    title="No courses yet"
                    description="Create courses first to customise which Word templates each course uses by default."
                />
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] gap-4">
                    {/* Left column: filterable course list */}
                    <div className="flex flex-col gap-2.5 min-w-0">
                        <SearchInput
                            value={query}
                            onChange={setQuery}
                            placeholder="Filter courses…"
                            aria-label="Filter courses"
                        />

                        <div
                            role="listbox"
                            aria-label="Courses"
                            className="max-h-96 overflow-y-auto rounded-xl border border-border-subtle divide-y divide-border-subtle bg-surface"
                        >
                            {filteredCourses.length === 0 ? (
                                <p className="px-3 py-6 text-xs text-muted text-center">
                                    No matching courses
                                </p>
                            ) : (
                                filteredCourses.map(course => {
                                    const isSelected = course.id === selectedCourse?.id;
                                    const preset = coursePreset(templates, course.template_ids);
                                    const pickedCount = (course.template_ids ?? []).filter(id => existingIdSet.has(id)).length;
                                    return (
                                        <button
                                            key={course.id}
                                            type="button"
                                            role="option"
                                            aria-selected={isSelected}
                                            onClick={() => setSelectedCourseId(course.id)}
                                            className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/40 ${
                                                isSelected
                                                    ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400'
                                                    : 'text-primary hover:bg-surface-elevated/60'
                                            }`}
                                        >
                                            <span
                                                className={`text-[13px] truncate ${isSelected ? 'font-semibold' : 'font-medium'}`}
                                                title={course.name}
                                            >
                                                {course.name}
                                            </span>
                                            {preset.state === 'all' && (
                                                <Badge tone="neutral" shape="pill" className="shrink-0">
                                                    All active
                                                </Badge>
                                            )}
                                            {preset.state === 'preset' && (
                                                <Badge tone="brand" shape="pill" className="tabular-nums shrink-0">
                                                    {pickedCount} picked
                                                </Badge>
                                            )}
                                            {preset.state === 'preset-off' && (
                                                <Badge tone="warning" shape="pill" className="shrink-0">
                                                    All off!
                                                </Badge>
                                            )}
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Right column: selected course preset editor */}
                    <div className="rounded-xl border border-border-subtle bg-surface-elevated/25 flex flex-col min-w-0">
                        {selectedCourse ? (
                            <>
                                {/* Editor header */}
                                <div className="px-4 py-3.5 border-b border-border-subtle space-y-2">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <h4 className="text-sm font-semibold text-primary truncate">
                                            {selectedCourse.name}
                                        </h4>
                                        {isDirty && (
                                            <Badge tone="brand" shape="pill">
                                                Unsaved changes
                                            </Badge>
                                        )}
                                    </div>

                                    {draftPreset.state === 'all' ? (
                                        <p className="text-xs text-muted">
                                            Uses all active templates ({activeTemplateCount} currently active). Tick specific templates below to customise this course.
                                        </p>
                                    ) : draftPreset.state === 'preset' ? (
                                        <p className="text-xs text-muted">
                                            Uses {plural(draftIds.length, 'selected template')} in the order below
                                            {draftOffCount > 0 ? ` (${draftOffCount} currently switched off)` : ''}.
                                        </p>
                                    ) : (
                                        <div className={`${calloutCls.warning} flex items-start gap-2 px-3 py-2 text-xs font-medium`}>
                                            <AlertTriangle size={14} className="text-status-requested shrink-0 mt-px" aria-hidden="true" />
                                            <span>
                                                All {plural(draftIds.length, 'picked template')} for this course {draftIds.length === 1 ? 'is' : 'are'} currently switched off — no Word documents will be generated until you switch one on, pick an active template, or clear the preset.
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Template checklist */}
                                {templates.length === 0 ? (
                                    <EmptyState
                                        bare
                                        icon={<FileText size={18} />}
                                        title="No Word templates uploaded"
                                        description="Upload Word templates above before assigning course presets."
                                    />
                                ) : (
                                    <ul className="divide-y divide-border-subtle max-h-80 overflow-y-auto bg-surface">
                                        {orderedTemplates.map(tpl => {
                                            const pickedIdx = draftIds.indexOf(tpl.id);
                                            const isPicked = pickedIdx !== -1;
                                            const label = templateLabel(tpl);
                                            const rowBg = isPicked
                                                ? tpl.is_active
                                                    ? 'bg-brand-500/[0.04]'
                                                    : 'bg-warning/10'
                                                : tpl.is_active
                                                    ? 'hover:bg-surface-elevated/40'
                                                    : 'bg-surface-elevated/40';

                                            return (
                                                <li
                                                    key={tpl.id}
                                                    className={`flex items-center gap-2.5 px-4 py-2.5 transition-colors ${rowBg}`}
                                                >
                                                    <label className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer select-none">
                                                        <input
                                                            type="checkbox"
                                                            checked={isPicked}
                                                            disabled={saving}
                                                            onChange={() => toggleTemplate(tpl.id)}
                                                            className="w-4 h-4 rounded-sm accent-brand-500 shrink-0 cursor-pointer"
                                                        />
                                                        {isPicked && (
                                                            <span className="text-xs font-semibold tabular-nums text-brand-600 dark:text-brand-400 w-5 shrink-0">
                                                                {pickedIdx + 1}.
                                                            </span>
                                                        )}
                                                        <span className="min-w-0 flex-1">
                                                            <span className="flex items-center gap-2 min-w-0">
                                                                <span
                                                                    className={`text-[13px] truncate ${
                                                                        tpl.is_active
                                                                            ? isPicked ? 'font-semibold text-primary' : 'font-medium text-primary'
                                                                            : 'font-medium text-muted'
                                                                    }`}
                                                                    title={label}
                                                                >
                                                                    {label}
                                                                </span>
                                                                {!tpl.is_active && (
                                                                    <Badge tone="neutral" shape="pill" className="shrink-0">
                                                                        Off
                                                                    </Badge>
                                                                )}
                                                            </span>
                                                            {tpl.description?.trim() && (
                                                                <span className="block text-xs text-muted truncate">
                                                                    {tpl.description.trim()}
                                                                </span>
                                                            )}
                                                        </span>
                                                    </label>

                                                    {isPicked && (
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            <IconButton
                                                                size="sm"
                                                                label={`Move ${label} up in preset`}
                                                                title="Move up"
                                                                disabled={pickedIdx === 0 || saving}
                                                                onClick={() => moveDraft(pickedIdx, -1)}
                                                            >
                                                                <ArrowUp size={13} />
                                                            </IconButton>
                                                            <IconButton
                                                                size="sm"
                                                                label={`Move ${label} down in preset`}
                                                                title="Move down"
                                                                disabled={pickedIdx === draftIds.length - 1 || saving}
                                                                onClick={() => moveDraft(pickedIdx, 1)}
                                                            >
                                                                <ArrowDown size={13} />
                                                            </IconButton>
                                                        </div>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}

                                {/* Footer actions */}
                                <div className="px-4 py-3 border-t border-border-subtle flex flex-wrap items-center justify-between gap-2 mt-auto">
                                    <div>
                                        {draftIds.length > 0 && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                disabled={saving}
                                                onClick={() => setDraftIds([])}
                                            >
                                                <RotateCcw size={13} aria-hidden="true" />
                                                Use all active (clear preset)
                                            </Button>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 ml-auto">
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            disabled={!isDirty || saving}
                                            onClick={() => setDraftIds(savedIds)}
                                        >
                                            Discard
                                        </Button>
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            disabled={!isDirty || saving}
                                            loading={saving}
                                            onClick={() => void handleSave()}
                                        >
                                            {!saving && <Save size={13} aria-hidden="true" />}
                                            Save preset
                                        </Button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <EmptyState
                                bare
                                icon={<Layers size={18} />}
                                title="Select a course"
                                description="Choose a course on the left to view or customise its Word template preset."
                            />
                        )}
                    </div>
                </div>
            )}
        </Card>
    );
}

export default CoursePresetsPanel;
