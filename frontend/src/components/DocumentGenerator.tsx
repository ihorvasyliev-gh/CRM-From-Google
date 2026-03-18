import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { FileText, Upload, Download, Loader2, ChevronDown, CheckCircle, AlertCircle, Trash2, Info, X, FileArchive, ToggleLeft, ToggleRight, Plus, Pencil, Check, Variable, Tag, Table2 } from 'lucide-react';
import { generateDocumentsArchive, type EnrollmentWithRelations, type TemplateDescriptor } from '../lib/documentUtils';
import { formatDateLong } from '../lib/dateUtils';
import { DocumentTemplate, Course, TemplateVariable } from '../lib/types';
import { getConfig, setConfig as persistConfig, type ExcelColumn } from '../lib/appConfig';


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
    const [courses, setCourses] = useState<Course[]>([]);
    const [enrollments, setEnrollments] = useState<EnrollmentWithRelations[]>([]);
    const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
    const [attTemplate, setAttTemplate] = useState<DocumentTemplate | null>(null);
    const [labelTemplate, setLabelTemplate] = useState<DocumentTemplate | null>(null);
    const [selectedCourseId, setSelectedCourseId] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [attUploading, setAttUploading] = useState(false);
    const [labelUploading, setLabelUploading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [showPlaceholders, setShowPlaceholders] = useState(true);
    const [courseDropdownOpen, setCourseDropdownOpen] = useState(false);

    // ─── Custom Variables State ─────────────────────────────
    const [customVars, setCustomVars] = useState<TemplateVariable[]>([]);
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
        setTimeout(() => setToast(null), 4000);
    }, []);

    // ─── Data Fetching ──────────────────────────────────────
    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        setLoading(true);
        const [coursesRes, enrollmentsRes, templateRes, attTemplateRes, varsRes, lblTemplateRes] = await Promise.all([
            supabase.from('courses').select('*').order('name'),
            supabase.from('enrollments').select('*, students(id, first_name, last_name, email, phone, address, eircode, dob), courses(id, name)').order('created_at', { ascending: false }),
            supabase.from('document_templates').select('*').order('created_at', { ascending: true }),
            supabase.from('attendance_templates').select('*').order('updated_at', { ascending: false }).limit(1),
            supabase.from('template_variables').select('*').order('created_at', { ascending: true }),
            supabase.from('label_templates').select('*').order('updated_at', { ascending: false }).limit(1),
        ]);

        if (coursesRes.data) setCourses(coursesRes.data);
        if (enrollmentsRes.data) setEnrollments(enrollmentsRes.data as EnrollmentWithRelations[]);
        if (templateRes.data) setTemplates(templateRes.data);
        if (attTemplateRes.data && attTemplateRes.data.length > 0) setAttTemplate(attTemplateRes.data[0]);
        if (varsRes.data) setCustomVars(varsRes.data);
        if (lblTemplateRes.data && lblTemplateRes.data.length > 0) setLabelTemplate(lblTemplateRes.data[0]);
        setLoading(false);
    }

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
            await supabase.storage.from('templates').remove([tpl.storage_path]);
            await supabase.from('document_templates').delete().eq('id', tpl.id);
            setTemplates(prev => prev.filter(t => t.id !== tpl.id));
            showToast('Template deleted', 'success');
        } catch (err: unknown) {
            showToast(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
        }
    }

    async function handleDeleteAttendance() {
        if (!attTemplate) return;
        try {
            await supabase.storage.from('templates').remove([attTemplate.storage_path]);
            await supabase.from('attendance_templates').delete().eq('id', attTemplate.id);
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
            await supabase.storage.from('templates').remove([labelTemplate.storage_path]);
            await supabase.from('label_templates').delete().eq('id', labelTemplate.id);
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
        if (activeTemplates.length === 0 || confirmedForCourse.length === 0) return;

        setGenerating(true);
        try {
            const courseName = selectedCourse?.name || 'Course';
            const zipName = `${courseName.replace(/[^a-zA-Z0-9_.\-\s]/g, '').replace(/\s+/g, '_')}_Documents.zip`;

            const tplDescriptors: TemplateDescriptor[] = activeTemplates.map(t => ({
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
                <Loader2 size={24} className="animate-spin text-brand-500" />
            </div>
        );
    }

    // ─── Render ─────────────────────────────────────────────
    return (
        <div className="space-y-6 pb-8">
            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium shadow-lg animate-fadeIn ${toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                    }`}>
                    {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                    {toast.message}
                    <button onClick={() => setToast(null)} className="ml-2 hover:opacity-70"><X size={14} /></button>
                </div>
            )}

            {/* ═══ Template Management Card ═══ */}
            <div className="bg-surface rounded-2xl shadow-card border border-border-subtle overflow-hidden">
                {/* Header */}
                <div className="p-5 border-b border-surface-100">
                    <div className="flex items-start gap-3">
                        <div className="p-2.5 bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl text-violet-600 flex-shrink-0">
                            <FileText size={22} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-primary">Word Document Templates</h3>
                            <p className="text-sm text-muted mt-0.5">
                                Upload Word templates (.docx) with placeholders like {'{firstName}'}, {'{lastName}'}, {'{email}'}, {'{courseDate}'}, etc.
                                Toggle each template on/off to control which ones are used during generation.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Templates List */}
                <div className="px-5 py-3 border-b border-border-subtle">
                    {templates.length > 0 ? (
                        <div className="space-y-2">
                            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">
                                Uploaded Templates ({templates.length})
                            </p>
                            {templates.map(tpl => (
                                <div
                                    key={tpl.id}
                                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${
                                        tpl.is_active
                                            ? 'bg-violet-50/50 border-violet-200 dark:bg-violet-500/10 dark:border-violet-500/30'
                                            : 'bg-surface-elevated/50 border-border-subtle opacity-60'
                                    }`}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <button
                                            onClick={() => handleToggleActive(tpl)}
                                            className="flex-shrink-0 transition-colors"
                                            title={tpl.is_active ? 'Deactivate template' : 'Activate template'}
                                        >
                                            {tpl.is_active ? (
                                                <ToggleRight size={24} className="text-violet-500" />
                                            ) : (
                                                <ToggleLeft size={24} className="text-surface-400" />
                                            )}
                                        </button>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <FileArchive size={14} className={tpl.is_active ? 'text-violet-500' : 'text-surface-400'} />
                                                <span className="text-sm font-semibold text-primary truncate">{tpl.name}</span>
                                            </div>
                                            <p className="text-[11px] text-muted mt-0.5">
                                                Added {new Date(tpl.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteTemplate(tpl)}
                                        className="text-surface-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-all flex-shrink-0"
                                        title="Delete template"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <AlertCircle size={16} className="text-amber-500" />
                            <span className="text-sm text-amber-600 font-medium">No templates uploaded yet</span>
                        </div>
                    )}
                </div>

                {/* Available Variables */}
                <div className="px-5 py-4">
                    <button
                        onClick={() => setShowPlaceholders(!showPlaceholders)}
                        className="flex items-center gap-2 text-sm font-bold text-primary hover:text-brand-500 transition-colors"
                    >
                        <Info size={14} />
                        Available Variables
                        <ChevronDown size={14} className={`transition-transform ${showPlaceholders ? 'rotate-180' : ''}`} />
                    </button>

                    {showPlaceholders && (
                        <div className="mt-3 p-4 bg-surface-elevated rounded-xl border border-border-subtle">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {PLACEHOLDER_CATEGORIES.map(cat => (
                                    <div key={cat.title}>
                                        <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">{cat.title}</p>
                                        <div className="space-y-1">
                                            {cat.items.map(item => (
                                                <div key={item.key} className="flex items-center gap-2 text-[13px]">
                                                    <code className="text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded font-mono text-xs">
                                                        {`{${item.key}}`}
                                                    </code>
                                                    <span className="text-muted">—</span>
                                                    <span className="text-primary">{item.desc}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                {customVars.length > 0 && (
                                    <div>
                                        <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Custom Variables</p>
                                        <div className="space-y-1">
                                            {customVars.map(v => (
                                                <div key={v.id} className="flex items-center gap-2 text-[13px]">
                                                    <code className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-mono text-xs">
                                                        {`{${v.var_key}}`}
                                                    </code>
                                                    <span className="text-muted">—</span>
                                                    <span className="text-primary">{v.var_value || <em className="text-muted">empty</em>}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Upload Button */}
                <div className="px-5 pb-5">
                    <label className={`block w-full cursor-pointer ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
                        <input
                            type="file"
                            accept=".docx"
                            className="hidden"
                            onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadTemplate(file);
                                e.target.value = '';
                            }}
                        />
                        <div className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-500 via-purple-500 to-violet-600 hover:from-violet-600 hover:via-purple-600 hover:to-violet-700 transition-all shadow-sm hover:shadow-md hover:shadow-violet-500/25">
                            {uploading ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <Upload size={16} />
                            )}
                            Add New Template
                        </div>
                    </label>
                    <p className="text-[11px] text-muted mt-2 text-center">
                        Maximum file size: 5MB. You can upload multiple templates and toggle them on/off.
                    </p>
                </div>
            </div>

            {/* ═══ Custom Variables Card ═══ */}
            <div className="bg-surface rounded-2xl shadow-card border border-border-subtle overflow-hidden">
                <div className="p-5 border-b border-surface-100">
                    <div className="flex items-start gap-3">
                        <div className="p-2.5 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl text-emerald-600 flex-shrink-0">
                            <Variable size={22} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-primary">Custom Variables</h3>
                            <p className="text-sm text-muted mt-0.5">
                                Define custom placeholders (e.g. {'{Tutor}'}) and their values. These will be substituted into all templates during generation.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Variable List */}
                <div className="px-5 py-3 border-b border-border-subtle">
                    {customVars.length > 0 ? (
                        <div className="space-y-2">
                            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">
                                Defined Variables ({customVars.length})
                            </p>
                            {customVars.map(v => (
                                <div
                                    key={v.id}
                                    className="flex items-center justify-between px-3 py-2.5 rounded-xl border bg-emerald-50/50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30 transition-all"
                                >
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <code className="text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded font-mono text-xs flex-shrink-0">
                                            {`{${v.var_key}}`}
                                        </code>
                                        <span className="text-muted flex-shrink-0">→</span>
                                        {editingVarId === v.id ? (
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                <input
                                                    type="text"
                                                    value={editingVarValue}
                                                    onChange={e => setEditingVarValue(e.target.value)}
                                                    onKeyDown={e => { if (e.key === 'Enter') handleSaveVariableValue(v); if (e.key === 'Escape') setEditingVarId(null); }}
                                                    className="flex-1 min-w-0 px-2 py-1 text-sm rounded-lg border border-emerald-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                                                    autoFocus
                                                />
                                                <button
                                                    onClick={() => handleSaveVariableValue(v)}
                                                    className="text-emerald-600 hover:text-emerald-700 p-1 rounded-lg hover:bg-emerald-100 transition-all flex-shrink-0"
                                                    title="Save"
                                                >
                                                    <Check size={14} />
                                                </button>
                                                <button
                                                    onClick={() => setEditingVarId(null)}
                                                    className="text-surface-400 hover:text-surface-600 p-1 rounded-lg hover:bg-surface-100 transition-all flex-shrink-0"
                                                    title="Cancel"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ) : (
                                            <span
                                                className="text-sm text-primary truncate cursor-pointer hover:text-emerald-600 transition-colors"
                                                onClick={() => { setEditingVarId(v.id); setEditingVarValue(v.var_value); }}
                                                title="Click to edit"
                                            >
                                                {v.var_value || <em className="text-muted">empty — click to set</em>}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                                        {editingVarId !== v.id && (
                                            <button
                                                onClick={() => { setEditingVarId(v.id); setEditingVarValue(v.var_value); }}
                                                className="text-surface-400 hover:text-emerald-500 p-1.5 rounded-lg hover:bg-emerald-50 transition-all"
                                                title="Edit value"
                                            >
                                                <Pencil size={13} />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleDeleteVariable(v)}
                                            className="text-surface-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-all"
                                            title="Delete variable"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <Info size={16} className="text-surface-400" />
                            <span className="text-sm text-muted">No custom variables defined yet</span>
                        </div>
                    )}
                </div>

                {/* Add Variable Form */}
                <div className="px-5 pb-5 pt-4">
                    <p className="text-xs font-bold text-muted uppercase tracking-wider mb-3">Add New Variable</p>
                    <div className="flex items-end gap-3">
                        <div className="flex-1">
                            <label className="block text-[11px] text-muted mb-1">Variable Name</label>
                            <input
                                type="text"
                                value={newVarKey}
                                onChange={e => setNewVarKey(e.target.value)}
                                placeholder="e.g. Tutor"
                                className="w-full px-3 py-2 text-sm rounded-xl border border-border-subtle bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                            />
                        </div>
                        <div className="flex-1">
                            <label className="block text-[11px] text-muted mb-1">Value</label>
                            <input
                                type="text"
                                value={newVarValue}
                                onChange={e => setNewVarValue(e.target.value)}
                                placeholder="e.g. John Smith"
                                onKeyDown={e => { if (e.key === 'Enter') handleAddVariable(); }}
                                className="w-full px-3 py-2 text-sm rounded-xl border border-border-subtle bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                            />
                        </div>
                        <button
                            onClick={handleAddVariable}
                            disabled={!newVarKey.trim() || addingVar}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all flex-shrink-0 ${
                                !newVarKey.trim() || addingVar
                                    ? 'bg-surface-elevated text-muted cursor-not-allowed border border-border-subtle'
                                    : 'text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-sm hover:shadow-md hover:shadow-emerald-500/25'
                            }`}
                        >
                            {addingVar ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                            Add
                        </button>
                    </div>
                    <p className="text-[11px] text-muted mt-2">
                        Use <code className="text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded font-mono">{'{{VariableName}}'}</code> in your Word templates to reference these variables.
                    </p>
                </div>
            </div>

            {/* ═══ Attendance Sheet Template Card ═══ */}
            <div className="bg-surface rounded-2xl shadow-card border border-border-subtle overflow-hidden">
                <div className="p-5 border-b border-surface-100">
                    <div className="flex items-start gap-3">
                        <div className="p-2.5 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl text-blue-600 flex-shrink-0">
                            <FileText size={22} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-primary">Attendance Sheet Template</h3>
                            <p className="text-sm text-muted mt-0.5">
                                Upload a Word template (.docx) for the Attendance Sheet.
                                Use flat numbered placeholders up to 34 (e.g., {'{firstName1}'}, {'{lastName1}'}, {'{phone1}'}).
                            </p>
                        </div>
                    </div>
                </div>

                <div className="px-5 py-3 bg-surface-elevated/50 border-b border-border-subtle">
                    {attTemplate ? (
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <FileArchive size={16} className="text-blue-500" />
                                <span className="text-sm font-semibold text-primary">Current template:</span>
                                <span className="text-sm text-muted">{attTemplate.name}</span>
                            </div>
                            <button
                                onClick={handleDeleteAttendance}
                                className="text-surface-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-all"
                                title="Delete template"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <AlertCircle size={16} className="text-amber-500" />
                            <span className="text-sm text-amber-600 font-medium">No attendance template uploaded yet</span>
                        </div>
                    )}
                </div>

                <div className="px-5 pb-5 pt-5">
                    <label className={`block w-full cursor-pointer ${attUploading ? 'pointer-events-none opacity-60' : ''}`}>
                        <input
                            type="file"
                            accept=".docx"
                            className="hidden"
                            onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadAttendance(file);
                                e.target.value = '';
                            }}
                        />
                        <div className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-600 hover:from-blue-600 hover:via-cyan-600 hover:to-blue-700 transition-all shadow-sm hover:shadow-md hover:shadow-blue-500/25">
                            {attUploading ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <Upload size={16} />
                            )}
                            {attTemplate ? 'Replace Attendance Template' : 'Upload Attendance Template'}
                        </div>
                    </label>
                    <p className="text-[11px] text-muted mt-2 text-center">
                        Maximum file size: 5MB. Supported placeholders: {'{courseTitle}'}, {'{courseDate}'}, {'{firstName1}'}, {'{lastName1}'} ... up to {'{email34}'}.
                    </p>
                </div>
            </div>

            {/* ═══ Address Labels Template Card ═══ */}
            <div className="bg-surface rounded-2xl shadow-card border border-border-subtle overflow-hidden">
                <div className="p-5 border-b border-surface-100">
                    <div className="flex items-start gap-3">
                        <div className="p-2.5 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl text-amber-600 flex-shrink-0">
                            <Tag size={22} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-primary">Address Labels Template</h3>
                            <p className="text-sm text-muted mt-0.5">
                                Upload a Word template (.docx) for address label stickers.
                                Use flat numbered placeholders up to 28 (e.g., {'{firstName1}'}, {'{lastName1}'}, {'{address1}'}, {'{eircode1}'}).
                            </p>
                        </div>
                    </div>
                </div>

                <div className="px-5 py-3 bg-surface-elevated/50 border-b border-border-subtle">
                    {labelTemplate ? (
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <FileArchive size={16} className="text-amber-500" />
                                <span className="text-sm font-semibold text-primary">Current template:</span>
                                <span className="text-sm text-muted">{labelTemplate.name}</span>
                            </div>
                            <button
                                onClick={handleDeleteLabels}
                                className="text-surface-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-all"
                                title="Delete template"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <AlertCircle size={16} className="text-amber-500" />
                            <span className="text-sm text-amber-600 font-medium">No label template uploaded yet</span>
                        </div>
                    )}
                </div>

                <div className="px-5 pb-5 pt-5">
                    <label className={`block w-full cursor-pointer ${labelUploading ? 'pointer-events-none opacity-60' : ''}`}>
                        <input
                            type="file"
                            accept=".docx"
                            className="hidden"
                            onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadLabels(file);
                                e.target.value = '';
                            }}
                        />
                        <div className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:via-orange-600 hover:to-amber-700 transition-all shadow-sm hover:shadow-md hover:shadow-amber-500/25">
                            {labelUploading ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <Upload size={16} />
                            )}
                            {labelTemplate ? 'Replace Label Template' : 'Upload Label Template'}
                        </div>
                    </label>
                    <p className="text-[11px] text-muted mt-2 text-center">
                        Maximum file size: 5MB. Supported placeholders: {'{firstName1}'}, {'{lastName1}'}, {'{address1}'}, {'{eircode1}'} ... up to 28.
                    </p>
                </div>
            </div>

            {/* ═══ Excel Export Columns Card ═══ */}
            <div className="bg-surface rounded-2xl shadow-card border border-border-subtle overflow-hidden">
                <div className="p-5 border-b border-surface-100">
                    <div className="flex items-start gap-3">
                        <div className="p-2.5 bg-gradient-to-br from-teal-50 to-cyan-50 rounded-xl text-teal-600 flex-shrink-0">
                            <Table2 size={22} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-primary">Excel Export Columns</h3>
                            <p className="text-sm text-muted mt-0.5">
                                Configure which columns appear in the <strong>Participants.xlsx</strong> file included in the generated archive.
                                Uses the same placeholders as Word templates.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Current columns list */}
                <div className="px-5 py-3 border-b border-border-subtle">
                    {excelColumns.length > 0 ? (
                        <div className="space-y-2">
                            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">
                                Columns ({excelColumns.length})
                            </p>
                            {excelColumns.map((col, idx) => (
                                <div
                                    key={`${col.placeholder}-${idx}`}
                                    className="flex items-center justify-between px-3 py-2.5 rounded-xl border bg-teal-50/50 border-teal-200 dark:bg-teal-500/10 dark:border-teal-500/30 transition-all"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="text-xs font-mono text-muted w-5 text-center flex-shrink-0">{idx + 1}</span>
                                        <span className="text-sm font-semibold text-primary">{col.header}</span>
                                        <span className="text-muted flex-shrink-0">→</span>
                                        <code className="text-teal-600 bg-teal-100 px-2 py-0.5 rounded font-mono text-xs">
                                            {`{${col.placeholder}}`}
                                        </code>
                                    </div>
                                    <button
                                        onClick={() => {
                                            const updated = excelColumns.filter((_, i) => i !== idx);
                                            setExcelColumns(updated);
                                            persistConfig({ excelColumns: updated });
                                        }}
                                        className="text-surface-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-all flex-shrink-0"
                                        title="Remove column"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <AlertCircle size={16} className="text-amber-500" />
                            <span className="text-sm text-amber-600 font-medium">No columns configured — no Excel file will be generated</span>
                        </div>
                    )}
                </div>

                {/* Add column form */}
                <div className="px-5 pb-5 pt-4">
                    <p className="text-xs font-bold text-muted uppercase tracking-wider mb-3">Add Column</p>
                    <div className="flex items-end gap-3">
                        <div className="flex-1">
                            <label className="block text-[11px] text-muted mb-1">Column Header</label>
                            <input
                                type="text"
                                value={newColHeader}
                                onChange={e => setNewColHeader(e.target.value)}
                                placeholder="e.g. Full Name"
                                className="w-full px-3 py-2 text-sm rounded-xl border border-border-subtle bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                            />
                        </div>
                        <div className="flex-1">
                            <label className="block text-[11px] text-muted mb-1">Placeholder Key</label>
                            <input
                                type="text"
                                value={newColPlaceholder}
                                onChange={e => setNewColPlaceholder(e.target.value)}
                                placeholder="e.g. fullName"
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && newColHeader.trim() && newColPlaceholder.trim()) {
                                        const updated = [...excelColumns, { header: newColHeader.trim(), placeholder: newColPlaceholder.trim() }];
                                        setExcelColumns(updated);
                                        persistConfig({ excelColumns: updated });
                                        setNewColHeader('');
                                        setNewColPlaceholder('');
                                    }
                                }}
                                className="w-full px-3 py-2 text-sm rounded-xl border border-border-subtle bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                            />
                        </div>
                        <button
                            onClick={() => {
                                if (!newColHeader.trim() || !newColPlaceholder.trim()) return;
                                const updated = [...excelColumns, { header: newColHeader.trim(), placeholder: newColPlaceholder.trim() }];
                                setExcelColumns(updated);
                                persistConfig({ excelColumns: updated });
                                setNewColHeader('');
                                setNewColPlaceholder('');
                            }}
                            disabled={!newColHeader.trim() || !newColPlaceholder.trim()}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all flex-shrink-0 ${
                                !newColHeader.trim() || !newColPlaceholder.trim()
                                    ? 'bg-surface-elevated text-muted cursor-not-allowed border border-border-subtle'
                                    : 'text-white bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 shadow-sm hover:shadow-md hover:shadow-teal-500/25'
                            }`}
                        >
                            <Plus size={14} />
                            Add
                        </button>
                    </div>
                    <p className="text-[11px] text-muted mt-2">
                        Use placeholder keys from the Available Variables list above (e.g. <code className="text-teal-600 bg-teal-50 px-1 py-0.5 rounded font-mono">firstName</code>, <code className="text-teal-600 bg-teal-50 px-1 py-0.5 rounded font-mono">email</code>, <code className="text-teal-600 bg-teal-50 px-1 py-0.5 rounded font-mono">courseDate</code>).
                    </p>
                </div>
            </div>

            {/* ═══ Generate Documents Card ═══ */}
            <div className="bg-surface rounded-2xl shadow-card border border-border-subtle">
                <div className="p-5 border-b border-border-subtle">
                    <div className="flex items-start gap-3">
                        <div className="p-2.5 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl text-emerald-600 flex-shrink-0">
                            <Download size={22} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-primary">Generate Documents</h3>
                            <p className="text-sm text-muted mt-0.5">
                                Select a course to generate personalized documents for all confirmed participants using {activeTemplates.length} active template{activeTemplates.length !== 1 ? 's' : ''}.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="p-5 space-y-5">
                    {/* Course Selector */}
                    <div>
                        <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                            Select Course
                        </label>
                        <div className="relative z-50">
                            <button
                                onClick={() => setCourseDropdownOpen(!courseDropdownOpen)}
                                className="w-full flex items-center justify-between px-4 py-3 bg-surface-elevated border border-border-subtle rounded-xl text-sm transition-all hover:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                            >
                                <span className={selectedCourse ? 'text-primary font-medium' : 'text-muted'}>
                                    {selectedCourse?.name || 'Choose a course...'}
                                </span>
                                <ChevronDown size={16} className={`text-muted transition-transform ${courseDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {courseDropdownOpen && (
                                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-surface-elevated rounded-xl shadow-lg border border-border-subtle py-1 max-h-64 overflow-y-auto animate-scaleIn origin-top">
                                    {coursesWithConfirmed.length === 0 ? (
                                        <div className="px-4 py-3 text-sm text-muted text-center">
                                            No courses with confirmed enrollments
                                        </div>
                                    ) : (
                                        coursesWithConfirmed.map(c => {
                                            const count = enrollments.filter(e => e.course_id === c.id && e.status === 'confirmed').length;
                                            return (
                                                <button
                                                    key={c.id}
                                                    onClick={() => {
                                                        setSelectedCourseId(c.id);
                                                        setCourseDropdownOpen(false);
                                                    }}
                                                    className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-surface transition-all ${selectedCourseId === c.id ? 'bg-brand-500/10 text-brand-500 dark:text-brand-400 font-medium' : 'text-primary'
                                                        }`}
                                                >
                                                    <span>{c.name}</span>
                                                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${selectedCourseId === c.id ? 'bg-brand-500 flex items-center text-white' : 'bg-surface text-muted'
                                                        }`}>
                                                        {count} confirmed
                                                    </span>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Participants Preview */}
                    {selectedCourseId && confirmedForCourse.length > 0 && (
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-semibold text-muted uppercase tracking-wider">
                                    Confirmed Participants ({confirmedForCourse.length})
                                </label>
                            </div>
                            <div className="bg-surface-elevated rounded-xl border border-border-subtle overflow-hidden">
                                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                                    <table className="w-full text-sm">
                                        <thead className="sticky top-0 z-10">
                                            <tr className="bg-surface backdrop-blur-sm">
                                                <th className="text-left px-4 py-2.5 text-xs font-bold text-muted uppercase tracking-wider">#</th>
                                                <th className="text-left px-4 py-2.5 text-xs font-bold text-muted uppercase tracking-wider">Name</th>
                                                <th className="text-left px-4 py-2.5 text-xs font-bold text-muted uppercase tracking-wider">Email</th>
                                                <th className="text-left px-4 py-2.5 text-xs font-bold text-muted uppercase tracking-wider">Phone</th>
                                                <th className="text-left px-4 py-2.5 text-xs font-bold text-muted uppercase tracking-wider">Variant</th>
                                                <th className="text-left px-4 py-2.5 text-xs font-bold text-muted uppercase tracking-wider">Confirmed</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border-subtle">
                                            {confirmedForCourse.map((enrollment, idx) => (
                                                <tr key={enrollment.id} className="hover:bg-surface transition-colors">
                                                    <td className="px-4 py-2.5 text-muted text-xs font-mono">{idx + 1}</td>
                                                    <td className="px-4 py-2.5 font-medium text-primary">
                                                        {enrollment.students?.first_name} {enrollment.students?.last_name}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-muted">{enrollment.students?.email || '—'}</td>
                                                    <td className="px-4 py-2.5 text-muted">{enrollment.students?.phone || '—'}</td>
                                                    <td className="px-4 py-2.5">
                                                        {enrollment.course_variant ? (
                                                            <span className="text-xs font-medium text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                                                                {enrollment.course_variant}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted text-opacity-50">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-muted text-xs">
                                                        {enrollment.confirmed_date ? formatDateLong(enrollment.confirmed_date) : '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {selectedCourseId && confirmedForCourse.length === 0 && (
                        <div className="text-center py-8 text-muted text-opacity-80">
                            <AlertCircle size={24} className="mx-auto mb-2 text-muted text-opacity-50" />
                            <p className="text-sm">No confirmed enrollments for this course</p>
                        </div>
                    )}

                    {/* Generate Button */}
                    <button
                        onClick={handleGenerate}
                        disabled={activeTemplates.length === 0 || confirmedForCourse.length === 0 || generating}
                        className={`w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl text-sm font-bold transition-all ${activeTemplates.length === 0 || confirmedForCourse.length === 0
                            ? 'bg-surface-elevated text-muted cursor-not-allowed border border-border-subtle'
                            : generating
                                ? 'bg-emerald-400 text-white cursor-wait'
                                : 'bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-500 text-white hover:from-emerald-600 hover:via-emerald-700 hover:to-teal-600 shadow-sm hover:shadow-md hover:shadow-emerald-500/25'
                            }`}
                    >
                        {generating ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                Generating {confirmedForCourse.length} document(s) × {activeTemplates.length} template(s)...
                            </>
                        ) : (
                            <>
                                <FileArchive size={18} />
                                Generate & Download ZIP ({confirmedForCourse.length} student{confirmedForCourse.length !== 1 ? 's' : ''} × {activeTemplates.length} template{activeTemplates.length !== 1 ? 's' : ''})
                            </>
                        )}
                    </button>

                    {activeTemplates.length === 0 && (
                        <p className="text-xs text-amber-500 text-center font-medium">
                            ⚠ Please upload and activate at least one template before generating documents
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
