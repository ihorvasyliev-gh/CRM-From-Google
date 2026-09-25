import { useState, useMemo, useCallback, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { fetchCourses } from '../lib/queries';
import { FileText, Download, ChevronDown, AlertCircle, Trash2, Info, X, FileArchive, Plus, Pencil, Check, CheckCircle2, Variable, Tag, Table2, BookOpen, Users, Braces, Copy, ClipboardList, ArrowRight } from 'lucide-react';
import { generateDocumentsArchive, fetchDocumentTemplates, templatesForCourse, type TemplateDescriptor } from '../lib/documentUtils';
import { fetchAllEnrollments } from '../hooks/useEnrollments';
import { formatDateLong, formatDateSpaces, todayISO } from '../lib/dateUtils';
import { DocumentTemplate, TemplateVariable, cleanVariant } from '../lib/types';
import { getConfig, setConfig as persistConfig, type ExcelColumn } from '../lib/appConfig';
import Toast, { type ToastData } from './Toast';
import ConfirmDialog from './ConfirmDialog';
import { useModalBehavior } from '../hooks/useModalBehavior';
import Card from './ui/Card';
import Badge from './ui/Badge';
import StatTile from './ui/StatTile';
import FileDropzone from './ui/FileDropzone';
import { Button, IconButton } from './ui/Button';
import { copyText } from './Viewer/viewerUtils';
import { calloutCls, eyebrowCls, fieldCls, panelCls, tableCls, theadCls, thCls, tbodyCls, trCls, tdCls } from './ui/styles';


// ─── Placeholder Categories ─────────────────────────────────
const PLACEHOLDER_CATEGORIES = [
    {
        title: 'Student Information',
        items: [
            { key: 'userId', desc: 'User ID' },
            { key: 'firstName', desc: 'First Name' },
            { key: 'lastName', desc: 'Last Name' },
            { key: 'fullName', desc: 'Full Name' },
            { key: 'email', desc: 'Email' },
            { key: 'mobileNumber', desc: 'Phone Number' },
            { key: 'address', desc: 'Address' },
            { key: 'eircode', desc: 'Eircode' },
            { key: 'dateOfBirth', desc: 'Date of Birth (formatted)' },
        ],
    },
    {
        title: 'Course Information',
        items: [
            { key: 'courseId', desc: 'Course ID' },
            { key: 'courseTitle', desc: 'Course Title' },
            { key: 'courseVariant', desc: 'Course Variant (language)' },
        ],
    },
    {
        title: 'Registration Information',
        items: [
            { key: 'registeredAt', desc: 'Registration Date (DD/MM/YYYY)' },
            { key: 'courseRegistrationDate', desc: 'Registration Date (formatted)' },
            { key: 'isCompleted', desc: 'Completion Status (Yes/No)' },
            { key: 'completedAt', desc: 'Completion Date (formatted)' },
        ],
    },
    {
        title: 'Enrollment & Dates',
        items: [
            { key: 'isInvited', desc: 'Invitation Status (Yes/No)' },
            { key: 'invitedAt', desc: 'Invitation Date (formatted)' },
            { key: 'confirmedDate', desc: 'Confirmed Date (formatted)' },
            { key: 'courseDate', desc: 'Course Date (formatted)' },
            { key: 'enrollmentStatus', desc: 'Current Status' },
            { key: 'enrollmentNotes', desc: 'Admin Notes' },
        ],
    },
];



// ─── Component ──────────────────────────────────────────────
export default function DocumentGenerator() {
    const queryClient = useQueryClient();

    // ─── Cached data via React Query ────────────────────────
    const { data: courses = [], isLoading: coursesLoading } = useQuery({
        queryKey: ['doc_courses'],
        staleTime: 0, // pick up template presets just edited on the Courses tab
        queryFn: fetchCourses,
    });

    // Reuse global enrollments cache (same key as useEnrollments / Dashboard)
    const { data: enrollments = [], isLoading: enrollmentsLoading } = useQuery({
        queryKey: ['enrollments'],
        queryFn: fetchAllEnrollments,
    });

    const { data: templates = [], isLoading: templatesLoading } = useQuery({
        queryKey: ['doc_templates'],
        queryFn: fetchDocumentTemplates,
    });

    const { data: attTemplate = null } = useQuery({
        queryKey: ['doc_att_template'],
        queryFn: async () => {
            const { data } = await supabase.from('attendance_templates').select('*').order('updated_at', { ascending: false }).limit(1);
            return (data && data.length > 0) ? data[0] as DocumentTemplate : null;
        },
    });

    const { data: labelTemplate = null } = useQuery({
        queryKey: ['doc_label_template'],
        queryFn: async () => {
            const { data } = await supabase.from('label_templates').select('*').order('updated_at', { ascending: false }).limit(1);
            return (data && data.length > 0) ? data[0] as DocumentTemplate : null;
        },
    });

    const { data: customVars = [] } = useQuery({
        queryKey: ['doc_custom_vars'],
        queryFn: async () => {
            const { data } = await supabase.from('template_variables').select('*').order('created_at', { ascending: true });
            return (data || []) as TemplateVariable[];
        },
    });

    const loading = coursesLoading || enrollmentsLoading || templatesLoading;

    // ─── Non-cached UI state ────────────────────────────────
    const [selectedCourseId, setSelectedCourseId] = useState<string>('');
    const [uploading, setUploading] = useState(false);
    const [attUploading, setAttUploading] = useState(false);
    const [labelUploading, setLabelUploading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [toast, setToast] = useState<ToastData | null>(null);
    // Pending destructive action awaiting confirmation (template / variable deletion)
    const [pendingDelete, setPendingDelete] = useState<{ title: string; message: string; run: () => Promise<void> } | null>(null);
    const [showPlaceholders, setShowPlaceholders] = useState(true);
    const [courseDropdownOpen, setCourseDropdownOpen] = useState(false);

    // ─── Custom Variables State ─────────────────────────────
    const [newVarKey, setNewVarKey] = useState('');
    const [newVarValue, setNewVarValue] = useState('');
    const [addingVar, setAddingVar] = useState(false);
    const [editingVarId, setEditingVarId] = useState<string | null>(null);
    const [editingVarValue, setEditingVarValue] = useState('');

    // ─── Excel Columns State ────────────────────────────────
    const [excelColumns, setExcelColumns] = useState<ExcelColumn[]>(() => getConfig().excelColumns);
    const [newColHeader, setNewColHeader] = useState('');
    const [newColPlaceholder, setNewColPlaceholder] = useState('');

    const showToast = useCallback((message: string, type: 'success' | 'error') => {
        setToast({ message, type });
    }, []);

    useModalBehavior(courseDropdownOpen, () => setCourseDropdownOpen(false));

    // ─── Helpers to update cached data after mutations ──────
    const setTemplates = useCallback((updater: (prev: DocumentTemplate[]) => DocumentTemplate[]) => {
        queryClient.setQueryData<DocumentTemplate[]>(['doc_templates'], (old = []) => updater(old));
    }, [queryClient]);

    const setAttTemplate = useCallback((value: DocumentTemplate | null) => {
        queryClient.setQueryData<DocumentTemplate | null>(['doc_att_template'], value);
    }, [queryClient]);

    const setLabelTemplate = useCallback((value: DocumentTemplate | null) => {
        queryClient.setQueryData<DocumentTemplate | null>(['doc_label_template'], value);
    }, [queryClient]);

    const setCustomVars = useCallback((updater: ((prev: TemplateVariable[]) => TemplateVariable[]) | TemplateVariable[]) => {
        queryClient.setQueryData<TemplateVariable[]>(['doc_custom_vars'], (old = []) =>
            typeof updater === 'function' ? updater(old) : updater
        );
    }, [queryClient]);

    // ─── Active templates ───────────────────────────────────
    const activeTemplates = useMemo(() => templates.filter(t => t.is_active), [templates]);

    // ─── Courses with confirmed enrollments ─────────────────
    const coursesWithConfirmed = useMemo(() => {
        const courseIds = new Set(
            enrollments
                .filter(e => e.status === 'confirmed')
                .map(e => e.course_id)
        );
        return courses.filter(c => courseIds.has(c.id));
    }, [courses, enrollments]);

    // ─── Confirmed enrollments for selected course ──────────
    const confirmedForCourse = useMemo(() => {
        if (!selectedCourseId) return [];
        return enrollments
            .filter(e => e.course_id === selectedCourseId && e.status === 'confirmed')
            .sort((a, b) => {
                const aName = `${a.students?.last_name || ''} ${a.students?.first_name || ''}`.toLowerCase();
                const bName = `${b.students?.last_name || ''} ${b.students?.first_name || ''}`.toLowerCase();
                return aName.localeCompare(bName);
            });
    }, [enrollments, selectedCourseId]);

    const selectedCourse = courses.find(c => c.id === selectedCourseId);
    const courseTemplates = useMemo(() => templatesForCourse(templates, selectedCourse?.template_ids), [templates, selectedCourse]);

    // ─── Template Upload (add new) ──────────────────────────
    async function handleUploadTemplate(file: File) {
        if (!file.name.endsWith('.docx')) {
            showToast('Only .docx files are supported', 'error');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showToast('File size must be less than 5MB', 'error');
            return;
        }

        setUploading(true);
        try {
            const storagePath = `template_${Date.now()}.docx`;

            const { error: uploadError } = await supabase.storage
                .from('templates')
                .upload(storagePath, file, { cacheControl: '3600', upsert: true });

            if (uploadError) throw uploadError;

            const { data, error } = await supabase
                .from('document_templates')
                .insert({ name: file.name, storage_path: storagePath, is_active: true })
                .select()
                .single();
            if (error) throw error;

            setTemplates(prev => [...prev, data]);
            showToast('Template uploaded successfully!', 'success');
        } catch (err: unknown) {
            console.error('Upload error:', err);
            showToast(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
        } finally {
            setUploading(false);
        }
    }

    // ─── Attendance Template Upload ─────────────────────────
    async function handleUploadAttendance(file: File) {
        if (!file.name.endsWith('.docx')) {
            showToast('Only .docx files are supported', 'error');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showToast('File size must be less than 5MB', 'error');
            return;
        }

        setAttUploading(true);
        try {
            const storagePath = `template_att_${Date.now()}.docx`;

            if (attTemplate?.storage_path) {
                await supabase.storage.from('templates').remove([attTemplate.storage_path]);
            }

            const { error: uploadError } = await supabase.storage
                .from('templates')
                .upload(storagePath, file, { cacheControl: '3600', upsert: true });

            if (uploadError) throw uploadError;

            if (attTemplate) {
                const { error } = await supabase
                    .from('attendance_templates')
                    .update({ name: file.name, storage_path: storagePath, updated_at: new Date().toISOString() })
                    .eq('id', attTemplate.id);
                if (error) throw error;
                setAttTemplate({ ...attTemplate, name: file.name, storage_path: storagePath, updated_at: new Date().toISOString() });
            } else {
                const { data, error } = await supabase
                    .from('attendance_templates')
                    .insert({ name: file.name, storage_path: storagePath })
                    .select()
                    .single();
                if (error) throw error;
                setAttTemplate(data);
            }

            showToast('Attendance Template uploaded successfully!', 'success');
        } catch (err: unknown) {
            console.error('Upload error:', err);
            showToast(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
        } finally {
            setAttUploading(false);
        }
    }

    // ─── Toggle Template Active ─────────────────────────────
    async function handleToggleActive(tpl: DocumentTemplate) {
        const newActive = !tpl.is_active;
        try {
            const { error } = await supabase
                .from('document_templates')
                .update({ is_active: newActive })
                .eq('id', tpl.id);
            if (error) throw error;
            setTemplates(prev => prev.map(t => t.id === tpl.id ? { ...t, is_active: newActive } : t));
        } catch (err: unknown) {
            showToast(`Failed to toggle: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
        }
    }

    // ─── Delete Template ────────────────────────────────────
    async function handleDeleteTemplate(tpl: DocumentTemplate) {
        try {
            const { error } = await supabase.from('document_templates').delete().eq('id', tpl.id);
            if (error) throw error;
            await supabase.storage.from('templates').remove([tpl.storage_path]);
            setTemplates(prev => prev.filter(t => t.id !== tpl.id));
            showToast('Template deleted', 'success');
        } catch (err: unknown) {
            showToast(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
        }
    }

    async function handleDeleteAttendance() {
        if (!attTemplate) return;
        try {
            const { error } = await supabase.from('attendance_templates').delete().eq('id', attTemplate.id);
            if (error) throw error;
            await supabase.storage.from('templates').remove([attTemplate.storage_path]);
            setAttTemplate(null);
            showToast('Attendance Template deleted', 'success');
        } catch (err: unknown) {
            showToast(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
        }
    }

    // ─── Label Template Upload ───────────────────────────────
    async function handleUploadLabels(file: File) {
        if (!file.name.endsWith('.docx')) {
            showToast('Only .docx files are supported', 'error');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showToast('File size must be less than 5MB', 'error');
            return;
        }

        setLabelUploading(true);
        try {
            const storagePath = `template_lbl_${Date.now()}.docx`;

            if (labelTemplate?.storage_path) {
                await supabase.storage.from('templates').remove([labelTemplate.storage_path]);
            }

            const { error: uploadError } = await supabase.storage
                .from('templates')
                .upload(storagePath, file, { cacheControl: '3600', upsert: true });

            if (uploadError) throw uploadError;

            if (labelTemplate) {
                const { error } = await supabase
                    .from('label_templates')
                    .update({ name: file.name, storage_path: storagePath, updated_at: new Date().toISOString() })
                    .eq('id', labelTemplate.id);
                if (error) throw error;
                setLabelTemplate({ ...labelTemplate, name: file.name, storage_path: storagePath, updated_at: new Date().toISOString() });
            } else {
                const { data, error } = await supabase
                    .from('label_templates')
                    .insert({ name: file.name, storage_path: storagePath })
                    .select()
                    .single();
                if (error) throw error;
                setLabelTemplate(data);
            }

            showToast('Label Template uploaded successfully!', 'success');
        } catch (err: unknown) {
            console.error('Upload error:', err);
            showToast(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
        } finally {
            setLabelUploading(false);
        }
    }

    async function handleDeleteLabels() {
        if (!labelTemplate) return;
        try {
            const { error } = await supabase.from('label_templates').delete().eq('id', labelTemplate.id);
            if (error) throw error;
            await supabase.storage.from('templates').remove([labelTemplate.storage_path]);
            setLabelTemplate(null);
            showToast('Label Template deleted', 'success');
        } catch (err: unknown) {
            showToast(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
        }
    }

    // ─── Custom Variable Handlers ────────────────────────────
    async function handleAddVariable() {
        const key = newVarKey.trim();
        const value = newVarValue.trim();
        if (!key) { showToast('Variable name is required', 'error'); return; }

        setAddingVar(true);
        try {
            const { data, error } = await supabase
                .from('template_variables')
                .insert({ var_key: key, var_value: value })
                .select()
                .single();
            if (error) throw error;
            setCustomVars(prev => [...prev, data]);
            setNewVarKey('');
            setNewVarValue('');
            showToast(`Variable {${key}} added`, 'success');
        } catch (err: unknown) {
            showToast(`Failed to add variable: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
        } finally {
            setAddingVar(false);
        }
    }

    async function handleDeleteVariable(v: TemplateVariable) {
        try {
            const { error } = await supabase.from('template_variables').delete().eq('id', v.id);
            if (error) throw error;
            setCustomVars(prev => prev.filter(cv => cv.id !== v.id));
            showToast(`Variable {${v.var_key}} deleted`, 'success');
        } catch (err: unknown) {
            showToast(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
        }
    }

    async function handleSaveVariableValue(v: TemplateVariable) {
        try {
            const { error } = await supabase
                .from('template_variables')
                .update({ var_value: editingVarValue })
                .eq('id', v.id);
            if (error) throw error;
            setCustomVars(prev => prev.map(cv => cv.id === v.id ? { ...cv, var_value: editingVarValue } : cv));
            setEditingVarId(null);
            showToast(`Variable {${v.var_key}} updated`, 'success');
        } catch (err: unknown) {
            showToast(`Update failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
        }
    }

    /** Build a Record from custom vars for template rendering */
    const customVarMap = useMemo(() => {
        const map: Record<string, string> = {};
        customVars.forEach(v => { map[v.var_key] = v.var_value; });
        return map;
    }, [customVars]);

    // ─── Generate Documents ─────────────────────────────────
    async function handleGenerate() {
        if (courseTemplates.length === 0 || confirmedForCourse.length === 0) return;

        setGenerating(true);
        try {
            const courseName = selectedCourse?.name || 'Course';
            const firstEnr = confirmedForCourse[0];
            const rawDate = firstEnr?.confirmed_date || firstEnr?.invited_date || firstEnr?.completed_date;
            const dateStr = formatDateSpaces(rawDate) || formatDateSpaces(todayISO());
            const variant = firstEnr ? cleanVariant(courseName, firstEnr.course_variant) : '';
            const courseStr = variant ? `${courseName} (${variant})` : courseName;
            const zipName = `${courseStr} ${dateStr}.zip`.replace(/[/\\?%*:|"<>]/g, '-');

            const tplDescriptors: TemplateDescriptor[] = courseTemplates.map(t => ({
                name: t.name,
                storagePath: t.storage_path,
            }));

            const result = await generateDocumentsArchive(
                confirmedForCourse,
                tplDescriptors,
                zipName,
                attTemplate?.storage_path,
                customVarMap,
                labelTemplate?.storage_path,
                excelColumns
            );

            // Build a detailed status message
            if (result.failedTemplates.length > 0 || result.failedDocs.length > 0) {
                const failedNames = result.failedTemplates.map(f => `"${f.name}": ${f.error}`).join('; ');
                const failedDocDetails = result.failedDocs.length > 0
                    ? ` | ${result.failedDocs.length} doc(s) failed to render`
                    : '';
                const msg = result.failedTemplates.length > 0
                    ? `Failed templates: ${failedNames}${failedDocDetails}. Generated: ${result.totalDocs} doc(s) from ${result.successTemplates.length}/${result.totalTemplates} template(s).`
                    : `${result.failedDocs.length} doc(s) failed: ${result.failedDocs.slice(0, 3).map(d => `${d.student} (${d.template}): ${d.error}`).join('; ')}. Total generated: ${result.totalDocs}.`;
                showToast(msg, 'error');
            } else {
                showToast(`Generated ${result.totalDocs} document(s) with ${result.successTemplates.length} template(s)!`, 'success');
            }

            if (!result.attendanceOk && result.attendanceError) {
                showToast(`Attendance sheet failed: ${result.attendanceError}`, 'error');
            }

            if (!result.labelsOk && result.labelsError) {
                showToast(`Address labels failed: ${result.labelsError}`, 'error');
            }
        } catch (err: unknown) {
            console.error('Generation error:', err);
            showToast(`Generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
        } finally {
            setGenerating(false);
        }
    }

    // ─── Loading State ──────────────────────────────────────
    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 rounded-full border-2 border-brand-500/20 border-t-brand-500 animate-spin" />
            </div>
        );
    }

    const fileInputHandler = (handler: (file: File) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handler(file);
        e.target.value = '';
    };

    const addExcelColumn = () => {
        if (!newColHeader.trim() || !newColPlaceholder.trim()) return;
        const updated = [...excelColumns, { header: newColHeader.trim(), placeholder: newColPlaceholder.trim() }];
        setExcelColumns(updated);
        persistConfig({ excelColumns: updated });
        setNewColHeader('');
        setNewColPlaceholder('');
    };

    const canGenerate = courseTemplates.length > 0 && confirmedForCourse.length > 0;
    const archiveContents = [
        {
            label: `${courseTemplates.length} Word template${courseTemplates.length !== 1 ? 's' : ''} per student${courseTemplates.length ? `: ${courseTemplates.map(t => t.name).join(', ')}` : ''}`,
            ok: courseTemplates.length > 0,
        },
        { label: 'Attendance sheet', ok: !!attTemplate },
        { label: 'Address labels', ok: !!labelTemplate },
        { label: `Participants.xlsx (${excelColumns.length} column${excelColumns.length !== 1 ? 's' : ''})`, ok: excelColumns.length > 0 },
    ];

    const stepHeader = (n: number, title: string, done: boolean, hint?: ReactNode) => (
        <div className="flex items-center gap-3 mb-3">
            <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${
                    done ? 'bg-success text-white' : 'bg-surface-elevated text-muted border border-border-subtle'
                }`}
            >
                {done ? <Check size={13} strokeWidth={3} /> : n}
            </span>
            <span className="text-[13px] font-semibold text-primary">{title}</span>
            {hint && <span className="ml-auto text-[11px] text-muted">{hint}</span>}
        </div>
    );

    const singleTemplateRow = (tpl: DocumentTemplate | null, emptyText: string, onDelete: () => void) =>
        tpl ? (
            <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-border-subtle bg-surface-elevated/40">
                <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-info/10 text-status-invited flex items-center justify-center flex-shrink-0">
                        <FileText size={15} />
                    </span>
                    <div className="min-w-0">
                        <p className="text-[13px] font-medium text-primary truncate" title={tpl.name}>{tpl.name}</p>
                        <p className="text-[11px] text-muted">Current template</p>
                    </div>
                </div>
                <IconButton size="sm" tone="danger" label="Delete template" onClick={onDelete}>
                    <Trash2 size={14} />
                </IconButton>
            </div>
        ) : (
            <div className={`${calloutCls.warning} flex items-center gap-2 px-3 py-2 text-xs font-medium`}>
                <AlertCircle size={14} className="text-status-requested flex-shrink-0" />
                {emptyText}
            </div>
        );

    // ─── Render ─────────────────────────────────────────────
    return (
        <div className="pb-8 space-y-5">
            <Toast toast={toast} onDismiss={() => setToast(null)} />
            <ConfirmDialog
                open={!!pendingDelete}
                title={pendingDelete?.title || ''}
                message={pendingDelete?.message || ''}
                onConfirm={async () => {
                    if (!pendingDelete) return;
                    await pendingDelete.run();
                    setPendingDelete(null);
                }}
                onCancel={() => setPendingDelete(null)}
            />

            {/* Readiness overview */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
                <StatTile
                    label="Active templates"
                    icon={FileArchive}
                    tone="completed"
                    accent={false}
                    value={<>{activeTemplates.length}<span className="text-sm font-semibold text-muted"> / {templates.length}</span></>}
                    hint={activeTemplates.length ? 'Used for every student' : 'Upload a .docx to start'}
                    hintTone={activeTemplates.length ? 'muted' : 'alert'}
                />
                <StatTile
                    label="Ready courses"
                    icon={Users}
                    tone="success"
                    accent={false}
                    value={coursesWithConfirmed.length}
                    hint="With confirmed participants"
                />
                <StatTile
                    label="Attendance & labels"
                    icon={Tag}
                    tone="info"
                    accent={false}
                    value={<>{Number(!!attTemplate) + Number(!!labelTemplate)}<span className="text-sm font-semibold text-muted"> / 2</span></>}
                    hint={attTemplate && labelTemplate ? 'Both templates set' : 'Optional sheets'}
                />
                <StatTile
                    label="Custom variables"
                    icon={Variable}
                    tone="brand"
                    accent={false}
                    value={customVars.length}
                    hint={`${excelColumns.length} Excel column${excelColumns.length !== 1 ? 's' : ''}`}
                />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] gap-5 items-start">
                {/* ═══ Left: generate flow ═══ */}
                <div className="space-y-5 min-w-0">
                    <Card
                        title="Generate documents"
                        subtitle={`Personalised documents for all confirmed participants of a course · ${activeTemplates.length} active template${activeTemplates.length !== 1 ? 's' : ''}`}
                        icon={Download}
                        tone="success"
                        divided
                    >
                        <div className="space-y-6">
                            {/* Step 1 */}
                            <div>
                                {stepHeader(1, 'Choose a course', !!selectedCourse, `${coursesWithConfirmed.length} with confirmed students`)}
                                <div className="relative z-30">
                                    <button
                                        type="button"
                                        onClick={() => setCourseDropdownOpen(!courseDropdownOpen)}
                                        aria-haspopup="listbox"
                                        aria-expanded={courseDropdownOpen}
                                        className="w-full flex items-center justify-between gap-3 h-11 px-3.5 bg-surface border border-border-subtle rounded-xl text-sm transition-colors hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                                    >
                                        <span className="flex items-center gap-2.5 min-w-0">
                                            <BookOpen size={16} className="text-muted flex-shrink-0" />
                                            <span className={`truncate ${selectedCourse ? 'text-primary font-medium' : 'text-muted'}`}>
                                                {selectedCourse?.name || 'Choose a course...'}
                                            </span>
                                        </span>
                                        <ChevronDown size={16} className={`text-muted transition-transform flex-shrink-0 ${courseDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {courseDropdownOpen && (
                                        <div className="fixed inset-0 z-40" onClick={() => setCourseDropdownOpen(false)} aria-hidden="true" />
                                    )}
                                    {courseDropdownOpen && (
                                        <div role="listbox" className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-surface rounded-xl shadow-float border border-border-subtle p-1 max-h-72 overflow-y-auto animate-popoverScaleIn origin-top">
                                            {coursesWithConfirmed.length === 0 ? (
                                                <div className="px-4 py-3 text-sm text-muted text-center">
                                                    No courses with confirmed enrollments
                                                </div>
                                            ) : (
                                                coursesWithConfirmed.map(c => {
                                                    const count = enrollments.filter(e => e.course_id === c.id && e.status === 'confirmed').length;
                                                    const active = selectedCourseId === c.id;
                                                    return (
                                                        <button
                                                            key={c.id}
                                                            type="button"
                                                            role="option"
                                                            aria-selected={active}
                                                            onClick={() => {
                                                                setSelectedCourseId(c.id);
                                                                setCourseDropdownOpen(false);
                                                            }}
                                                            className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                                                                active ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400 font-medium' : 'text-primary hover:bg-surface-elevated'
                                                            }`}
                                                        >
                                                            <span className="truncate">{c.name}</span>
                                                            <Badge tone={active ? 'brand' : 'neutral'} shape="pill" className="tabular-nums flex-shrink-0">
                                                                {count} confirmed
                                                            </Badge>
                                                        </button>
                                                    );
                                                })
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Step 2 */}
                            <div>
                                {stepHeader(2, 'Review participants', confirmedForCourse.length > 0, selectedCourseId ? `Confirmed Participants (${confirmedForCourse.length})` : undefined)}
                                {!selectedCourseId ? (
                                    <div className={`${panelCls} border-dashed px-4 py-6 text-center text-xs text-muted`}>
                                        Pick a course above to see who will receive documents.
                                    </div>
                                ) : confirmedForCourse.length === 0 ? (
                                    <div className={`${panelCls} px-4 py-6 text-center`}>
                                        <AlertCircle size={20} className="mx-auto mb-2 text-muted" />
                                        <p className="text-sm text-muted">No confirmed enrollments for this course</p>
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-border-subtle overflow-hidden">
                                        <div className="overflow-x-auto max-h-80 overflow-y-auto">
                                            <table className={tableCls}>
                                                <thead className={`${theadCls} sticky top-0 z-10 !bg-surface-elevated`}>
                                                    <tr>
                                                        <th className={`${thCls} w-10`}>#</th>
                                                        <th className={thCls}>Name</th>
                                                        <th className={`${thCls} hidden md:table-cell`}>Phone</th>
                                                        <th className={thCls}>Variant</th>
                                                        <th className={`${thCls} hidden sm:table-cell`}>Confirmed</th>
                                                    </tr>
                                                </thead>
                                                <tbody className={tbodyCls}>
                                                    {confirmedForCourse.map((enrollment, idx) => (
                                                        <tr key={enrollment.id} className={trCls}>
                                                            <td className={`${tdCls} !py-2.5 text-muted text-xs tabular-nums`}>{idx + 1}</td>
                                                            <td className={`${tdCls} !py-2.5`}>
                                                                <p className="font-medium text-primary text-[13px]">
                                                                    {enrollment.students?.first_name} {enrollment.students?.last_name}
                                                                </p>
                                                                <p className="text-[11px] text-muted truncate max-w-[240px]">{enrollment.students?.email || '—'}</p>
                                                            </td>
                                                            <td className={`${tdCls} !py-2.5 text-muted text-xs tabular-nums hidden md:table-cell`}>{enrollment.students?.phone || '—'}</td>
                                                            <td className={`${tdCls} !py-2.5`}>
                                                                {enrollment.course_variant ? <Badge tone="completed">{enrollment.course_variant}</Badge> : <span className="text-muted">—</span>}
                                                            </td>
                                                            <td className={`${tdCls} !py-2.5 text-muted text-xs hidden sm:table-cell whitespace-nowrap`}>
                                                                {enrollment.confirmed_date ? formatDateLong(enrollment.confirmed_date) : '—'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Step 3 */}
                            <div>
                                {stepHeader(3, 'Generate the archive', false)}
                                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 mb-4">
                                    {archiveContents.map(item => (
                                        <li key={item.label} className={`flex items-center gap-2 text-xs ${item.ok ? 'text-primary' : 'text-muted line-through decoration-border-strong'}`}>
                                            {item.ok
                                                ? <CheckCircle2 size={14} className="text-status-confirmed flex-shrink-0" />
                                                : <X size={14} className="text-muted flex-shrink-0" />}
                                            {item.label}
                                        </li>
                                    ))}
                                </ul>
                                <Button
                                    variant={canGenerate ? 'success' : 'secondary'}
                                    size="lg"
                                    className="w-full !h-11"
                                    onClick={handleGenerate}
                                    disabled={!canGenerate || generating}
                                    loading={generating}
                                >
                                    {generating ? (
                                        <>Generating {confirmedForCourse.length} document(s) × {courseTemplates.length} template(s)...</>
                                    ) : (
                                        <>
                                            <FileArchive size={17} />
                                            Generate & Download ZIP ({confirmedForCourse.length} student{confirmedForCourse.length !== 1 ? 's' : ''} × {courseTemplates.length} template{courseTemplates.length !== 1 ? 's' : ''})
                                        </>
                                    )}
                                </Button>
                                {activeTemplates.length === 0 && (
                                    <p className="mt-2 text-xs text-status-requested text-center font-medium flex items-center justify-center gap-1.5">
                                        <AlertCircle size={13} />
                                        Please upload and activate at least one template before generating documents
                                    </p>
                                )}
                            </div>
                        </div>
                    </Card>

                    {/* Available variables */}
                    <Card
                        title="Available variables"
                        subtitle="Click a placeholder to copy it, then paste it into your Word template"
                        icon={Braces}
                        divided={showPlaceholders}
                        action={
                            <Button variant="ghost" size="sm" onClick={() => setShowPlaceholders(!showPlaceholders)} aria-expanded={showPlaceholders}>
                                {showPlaceholders ? 'Hide' : 'Show'}
                                <ChevronDown size={14} className={`transition-transform ${showPlaceholders ? 'rotate-180' : ''}`} />
                            </Button>
                        }
                        bodyClassName={showPlaceholders ? '' : '!p-0'}
                    >
                        {showPlaceholders && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                                {PLACEHOLDER_CATEGORIES.map(cat => (
                                    <div key={cat.title}>
                                        <p className={`${eyebrowCls} mb-2`}>{cat.title}</p>
                                        <div className="space-y-1">
                                            {cat.items.map(item => (
                                                <button
                                                    key={item.key}
                                                    type="button"
                                                    onClick={() => copyText(`{${item.key}}`, 'Placeholder')}
                                                    className="w-full flex items-center gap-2 text-left text-[13px] px-1.5 py-1 -mx-1.5 rounded-lg hover:bg-surface-elevated transition-colors group"
                                                    title={`Copy {${item.key}}`}
                                                >
                                                    <code className="text-brand-600 dark:text-brand-400 bg-brand-500/10 px-1.5 py-0.5 rounded font-mono text-xs flex-shrink-0">
                                                        {`{${item.key}}`}
                                                    </code>
                                                    <span className="text-muted truncate flex-1">{item.desc}</span>
                                                    <Copy size={12} className="text-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                {customVars.length > 0 && (
                                    <div>
                                        <p className={`${eyebrowCls} mb-2`}>Custom Variables</p>
                                        <div className="space-y-1">
                                            {customVars.map(v => (
                                                <button
                                                    key={v.id}
                                                    type="button"
                                                    onClick={() => copyText(`{${v.var_key}}`, 'Placeholder')}
                                                    className="w-full flex items-center gap-2 text-left text-[13px] px-1.5 py-1 -mx-1.5 rounded-lg hover:bg-surface-elevated transition-colors group"
                                                    title={`Copy {${v.var_key}}`}
                                                >
                                                    <code className="text-status-confirmed bg-success/10 px-1.5 py-0.5 rounded font-mono text-xs flex-shrink-0">
                                                        {`{${v.var_key}}`}
                                                    </code>
                                                    <span className="text-muted truncate flex-1">{v.var_value || <em>empty</em>}</span>
                                                    <Copy size={12} className="text-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </Card>
                </div>

                {/* ═══ Right: templates & setup ═══ */}
                <div className="space-y-5 min-w-0">
                    {/* Word templates */}
                    <Card
                        title="Word document templates"
                        subtitle="Toggle which .docx templates are used during generation"
                        icon={FileText}
                        tone="completed"
                        action={<Badge tone="completed" shape="pill" className="tabular-nums">{templates.length}</Badge>}
                    >
                        <div className="space-y-2">
                            {templates.length === 0 ? (
                                <div className={`${calloutCls.warning} flex items-center gap-2 px-3 py-2 text-xs font-medium`}>
                                    <AlertCircle size={14} className="text-status-requested flex-shrink-0" />
                                    No templates uploaded yet
                                </div>
                            ) : (
                                <ul className="rounded-xl border border-border-subtle divide-y divide-border-subtle overflow-hidden">
                                    {templates.map(tpl => (
                                        <li key={tpl.id} className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${tpl.is_active ? '' : 'bg-surface-elevated/40'}`}>
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={tpl.is_active}
                                                onClick={() => handleToggleActive(tpl)}
                                                title={tpl.is_active ? 'Deactivate template' : 'Activate template'}
                                                className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${tpl.is_active ? 'bg-brand-500' : 'bg-border-strong'}`}
                                            >
                                                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${tpl.is_active ? 'translate-x-4' : ''}`} />
                                            </button>
                                            <div className="min-w-0 flex-1">
                                                <p className={`text-[13px] font-medium truncate ${tpl.is_active ? 'text-primary' : 'text-muted'}`} title={tpl.name}>{tpl.name}</p>
                                                <p className="text-[11px] text-muted">Added {new Date(tpl.created_at).toLocaleDateString()}</p>
                                            </div>
                                            <IconButton
                                                size="sm"
                                                tone="danger"
                                                label={`Delete template ${tpl.name}`}
                                                title="Delete template"
                                                onClick={() => setPendingDelete({
                                                    title: 'Delete Template',
                                                    message: `Delete "${tpl.name}"? The file will be removed permanently.`,
                                                    run: () => handleDeleteTemplate(tpl),
                                                })}
                                            >
                                                <Trash2 size={14} />
                                            </IconButton>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <FileDropzone
                                accept=".docx"
                                onChange={fileInputHandler(handleUploadTemplate)}
                                uploading={uploading}
                                title="Add new template"
                                hint="Drop a .docx here or click to browse · max 5MB"
                            />
                        </div>
                    </Card>

                    {/* Attendance sheet */}
                    <Card
                        title="Attendance sheet"
                        subtitle={<>Numbered placeholders up to 34, e.g. {'{firstName1}'}, {'{phone1}'}</>}
                        icon={ClipboardList}
                        tone="info"
                    >
                        <div className="space-y-2">
                            {singleTemplateRow(attTemplate, 'No attendance template uploaded yet', () => setPendingDelete({
                                title: 'Delete Attendance Template',
                                message: 'Delete the attendance sheet template? The file will be removed permanently.',
                                run: handleDeleteAttendance,
                            }))}
                            <FileDropzone
                                compact
                                accept=".docx"
                                onChange={fileInputHandler(handleUploadAttendance)}
                                uploading={attUploading}
                                title={attTemplate ? 'Replace Attendance Template' : 'Upload Attendance Template'}
                                hint={<>Also supports {'{courseTitle}'}, {'{courseDate}'} … up to {'{email34}'}</>}
                            />
                        </div>
                    </Card>

                    {/* Address labels */}
                    <Card
                        title="Address labels"
                        subtitle={<>Numbered placeholders up to 28, e.g. {'{address1}'}, {'{eircode1}'}</>}
                        icon={Tag}
                        tone="warning"
                    >
                        <div className="space-y-2">
                            {singleTemplateRow(labelTemplate, 'No label template uploaded yet', () => setPendingDelete({
                                title: 'Delete Label Template',
                                message: 'Delete the label template? The file will be removed permanently.',
                                run: handleDeleteLabels,
                            }))}
                            <FileDropzone
                                compact
                                accept=".docx"
                                onChange={fileInputHandler(handleUploadLabels)}
                                uploading={labelUploading}
                                title={labelTemplate ? 'Replace Label Template' : 'Upload Label Template'}
                                hint="Drop a .docx here or click to browse · max 5MB"
                            />
                        </div>
                    </Card>

                    {/* Custom variables */}
                    <Card
                        title="Custom variables"
                        subtitle={<>Values substituted into every template, e.g. {'{Tutor}'}</>}
                        icon={Variable}
                        tone="success"
                    >
                        <div className="space-y-3">
                            {customVars.length > 0 ? (
                                <ul className="rounded-xl border border-border-subtle divide-y divide-border-subtle overflow-hidden">
                                    {customVars.map(v => (
                                        <li key={v.id} className="flex items-center gap-2.5 px-3 py-2">
                                            <code className="text-status-confirmed bg-success/10 px-1.5 py-0.5 rounded font-mono text-xs flex-shrink-0">
                                                {`{${v.var_key}}`}
                                            </code>
                                            {editingVarId === v.id ? (
                                                <div className="flex items-center gap-1 flex-1 min-w-0">
                                                    <input
                                                        type="text"
                                                        value={editingVarValue}
                                                        onChange={e => setEditingVarValue(e.target.value)}
                                                        onKeyDown={e => { if (e.key === 'Enter') handleSaveVariableValue(v); if (e.key === 'Escape') setEditingVarId(null); }}
                                                        className={`${fieldCls} !h-8 flex-1 min-w-0`}
                                                        autoFocus
                                                    />
                                                    <IconButton size="sm" tone="brand" label="Save" onClick={() => handleSaveVariableValue(v)}>
                                                        <Check size={14} />
                                                    </IconButton>
                                                    <IconButton size="sm" label="Cancel" onClick={() => setEditingVarId(null)}>
                                                        <X size={14} />
                                                    </IconButton>
                                                </div>
                                            ) : (
                                                <>
                                                    <button
                                                        type="button"
                                                        className="flex-1 min-w-0 text-left text-[13px] text-primary truncate hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                                                        onClick={() => { setEditingVarId(v.id); setEditingVarValue(v.var_value); }}
                                                        title="Click to edit"
                                                    >
                                                        {v.var_value || <em className="text-muted">empty — click to set</em>}
                                                    </button>
                                                    <IconButton size="sm" tone="brand" label="Edit value" onClick={() => { setEditingVarId(v.id); setEditingVarValue(v.var_value); }}>
                                                        <Pencil size={13} />
                                                    </IconButton>
                                                    <IconButton
                                                        size="sm"
                                                        tone="danger"
                                                        label="Delete variable"
                                                        onClick={() => setPendingDelete({
                                                            title: 'Delete Variable',
                                                            message: `Delete variable {${v.var_key}}? Templates using it will render it empty.`,
                                                            run: () => handleDeleteVariable(v),
                                                        })}
                                                    >
                                                        <Trash2 size={14} />
                                                    </IconButton>
                                                </>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-xs text-muted flex items-center gap-1.5"><Info size={13} /> No custom variables defined yet</p>
                            )}

                            <div className="flex flex-col sm:flex-row gap-2">
                                <input
                                    type="text"
                                    value={newVarKey}
                                    onChange={e => setNewVarKey(e.target.value)}
                                    placeholder="Name, e.g. Tutor"
                                    aria-label="Variable Name"
                                    className={`${fieldCls} sm:flex-1`}
                                />
                                <input
                                    type="text"
                                    value={newVarValue}
                                    onChange={e => setNewVarValue(e.target.value)}
                                    placeholder="Value, e.g. John Smith"
                                    aria-label="Value"
                                    onKeyDown={e => { if (e.key === 'Enter') handleAddVariable(); }}
                                    className={`${fieldCls} sm:flex-1`}
                                />
                                <Button variant="secondary" onClick={handleAddVariable} disabled={!newVarKey.trim()} loading={addingVar}>
                                    {!addingVar && <Plus size={14} />}
                                    Add
                                </Button>
                            </div>
                            <p className="text-[11px] text-muted">
                                Use <code className="text-status-confirmed bg-success/10 px-1 py-0.5 rounded font-mono">{'{{VariableName}}'}</code> in your Word templates to reference these variables.
                            </p>
                        </div>
                    </Card>

                    {/* Excel columns */}
                    <Card
                        title="Excel export columns"
                        subtitle={<>Columns of <strong className="font-semibold">Participants.xlsx</strong> in the archive</>}
                        icon={Table2}
                        tone="success"
                    >
                        <div className="space-y-3">
                            {excelColumns.length > 0 ? (
                                <ul className="rounded-xl border border-border-subtle divide-y divide-border-subtle overflow-hidden">
                                    {excelColumns.map((col, idx) => (
                                        <li key={`${col.placeholder}-${idx}`} className="flex items-center gap-2.5 px-3 py-2">
                                            <span className="text-[11px] tabular-nums text-muted w-4 text-right flex-shrink-0">{idx + 1}</span>
                                            <span className="text-[13px] font-medium text-primary truncate">{col.header}</span>
                                            <ArrowRight size={12} className="text-muted flex-shrink-0" />
                                            <code className="text-brand-600 dark:text-brand-400 bg-brand-500/10 px-1.5 py-0.5 rounded font-mono text-xs truncate">
                                                {`{${col.placeholder}}`}
                                            </code>
                                            <IconButton
                                                size="sm"
                                                tone="danger"
                                                label="Remove column"
                                                className="ml-auto"
                                                onClick={() => {
                                                    const updated = excelColumns.filter((_, i) => i !== idx);
                                                    setExcelColumns(updated);
                                                    persistConfig({ excelColumns: updated });
                                                }}
                                            >
                                                <Trash2 size={14} />
                                            </IconButton>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className={`${calloutCls.warning} flex items-center gap-2 px-3 py-2 text-xs font-medium`}>
                                    <AlertCircle size={14} className="text-status-requested flex-shrink-0" />
                                    No columns configured — no Excel file will be generated
                                </div>
                            )}

                            <div className="flex flex-col sm:flex-row gap-2">
                                <input
                                    type="text"
                                    value={newColHeader}
                                    onChange={e => setNewColHeader(e.target.value)}
                                    placeholder="Header, e.g. Full Name"
                                    aria-label="Column Header"
                                    className={`${fieldCls} sm:flex-1`}
                                />
                                <input
                                    type="text"
                                    value={newColPlaceholder}
                                    onChange={e => setNewColPlaceholder(e.target.value)}
                                    placeholder="Placeholder, e.g. fullName"
                                    aria-label="Placeholder Key"
                                    onKeyDown={e => { if (e.key === 'Enter') addExcelColumn(); }}
                                    className={`${fieldCls} sm:flex-1`}
                                />
                                <Button variant="secondary" onClick={addExcelColumn} disabled={!newColHeader.trim() || !newColPlaceholder.trim()}>
                                    <Plus size={14} />
                                    Add
                                </Button>
                            </div>
                            <p className="text-[11px] text-muted">
                                Use placeholder keys from Available variables (e.g. <code className="font-mono text-primary">firstName</code>, <code className="font-mono text-primary">email</code>, <code className="font-mono text-primary">courseDate</code>).
                            </p>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
