import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
    FileText, Upload, Download, Loader2, ChevronDown,
    CheckCircle, AlertCircle, Trash2, Info, X, FileArchive
} from 'lucide-react';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// ─── Types ──────────────────────────────────────────────────
interface Student {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address: string | null;
    eircode: string | null;
    dob: string | null;
}

interface Course {
    id: string;
    name: string;
}

interface Enrollment {
    id: string;
    student_id: string;
    course_id: string;
    status: string;
    course_variant: string | null;
    notes: string | null;
    confirmed_date: string | null;
    invited_date: string | null;
    created_at: string;
    students: Student | null;
    courses: Course | null;
}

interface DocumentTemplate {
    id: string;
    name: string;
    storage_path: string;
    created_at: string;
    updated_at: string;
}

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

// ─── Helpers ────────────────────────────────────────────────
function formatDateDMY(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateLong(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function buildPlaceholderData(enrollment: Enrollment): Record<string, string> {
    const s = enrollment.students;
    const c = enrollment.courses;

    return {
        userId: s?.id || '',
        firstName: s?.first_name || '',
        lastName: s?.last_name || '',
        fullName: [s?.first_name, s?.last_name].filter(Boolean).join(' '),
        email: s?.email || '',
        mobileNumber: s?.phone || '',
        address: s?.address || '',
        eircode: s?.eircode || '',
        dateOfBirth: formatDateLong(s?.dob),
        courseId: c?.id || '',
        courseTitle: c?.name || '',
        courseVariant: enrollment.course_variant || '',
        registeredAt: formatDateDMY(enrollment.created_at),
        courseRegistrationDate: formatDateLong(enrollment.created_at),
        isCompleted: enrollment.status === 'completed' ? 'Yes' : 'No',
        completedAt: enrollment.status === 'completed' ? formatDateLong(enrollment.confirmed_date) : '',
        isInvited: enrollment.invited_date ? 'Yes' : 'No',
        invitedAt: formatDateLong(enrollment.invited_date),
        confirmedDate: formatDateLong(enrollment.confirmed_date),
        courseDate: formatDateLong(enrollment.invited_date),
        enrollmentStatus: enrollment.status?.charAt(0).toUpperCase() + enrollment.status?.slice(1) || '',
        enrollmentNotes: enrollment.notes || '',
    };
}

// ─── Component ──────────────────────────────────────────────
export default function DocumentGenerator() {
    const [courses, setCourses] = useState<Course[]>([]);
    const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
    const [template, setTemplate] = useState<DocumentTemplate | null>(null);
    const [selectedCourseId, setSelectedCourseId] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [showPlaceholders, setShowPlaceholders] = useState(true);
    const [courseDropdownOpen, setCourseDropdownOpen] = useState(false);

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
        const [coursesRes, enrollmentsRes, templateRes] = await Promise.all([
            supabase.from('courses').select('*').order('name'),
            supabase.from('enrollments').select('*, students(id, first_name, last_name, email, phone, address, eircode, dob), courses(id, name)').order('created_at', { ascending: false }),
            supabase.from('document_templates').select('*').order('updated_at', { ascending: false }).limit(1),
        ]);

        if (coursesRes.data) setCourses(coursesRes.data);
        if (enrollmentsRes.data) setEnrollments(enrollmentsRes.data as Enrollment[]);
        if (templateRes.data && templateRes.data.length > 0) setTemplate(templateRes.data[0]);
        setLoading(false);
    }

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

    // ─── Template Upload ────────────────────────────────────
    async function handleTemplateUpload(file: File) {
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

            // Delete old template file if exists
            if (template?.storage_path) {
                await supabase.storage.from('templates').remove([template.storage_path]);
            }

            // Upload new template
            const { error: uploadError } = await supabase.storage
                .from('templates')
                .upload(storagePath, file, { cacheControl: '3600', upsert: true });

            if (uploadError) throw uploadError;

            // Upsert template record
            if (template) {
                const { error } = await supabase
                    .from('document_templates')
                    .update({ name: file.name, storage_path: storagePath, updated_at: new Date().toISOString() })
                    .eq('id', template.id);
                if (error) throw error;
                setTemplate({ ...template, name: file.name, storage_path: storagePath, updated_at: new Date().toISOString() });
            } else {
                const { data, error } = await supabase
                    .from('document_templates')
                    .insert({ name: file.name, storage_path: storagePath })
                    .select()
                    .single();
                if (error) throw error;
                setTemplate(data);
            }

            showToast('Template uploaded successfully!', 'success');
        } catch (err: unknown) {
            console.error('Upload error:', err);
            showToast(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
        } finally {
            setUploading(false);
        }
    }

    // ─── Delete Template ────────────────────────────────────
    async function handleDeleteTemplate() {
        if (!template) return;
        try {
            await supabase.storage.from('templates').remove([template.storage_path]);
            await supabase.from('document_templates').delete().eq('id', template.id);
            setTemplate(null);
            showToast('Template deleted', 'success');
        } catch (err: unknown) {
            showToast(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
        }
    }

    // ─── Generate Documents ─────────────────────────────────
    async function handleGenerate() {
        if (!template || confirmedForCourse.length === 0) return;

        setGenerating(true);
        try {
            // 1. Download template from storage
            const { data: templateData, error: downloadError } = await supabase.storage
                .from('templates')
                .download(template.storage_path);

            if (downloadError || !templateData) throw downloadError || new Error('Failed to download template');

            const templateBuffer = await templateData.arrayBuffer();

            // 2. Generate a document for each participant
            const zip = new JSZip();
            const courseName = selectedCourse?.name || 'Course';

            for (const enrollment of confirmedForCourse) {
                const student = enrollment.students;
                if (!student) continue;

                try {
                    const pizZip = new PizZip(templateBuffer);
                    const doc = new Docxtemplater(pizZip, {
                        paragraphLoop: true,
                        linebreaks: true,
                        delimiters: { start: '{', end: '}' },
                    });

                    const data = buildPlaceholderData(enrollment);
                    doc.render(data);

                    const generatedDoc = doc.getZip().generate({ type: 'arraybuffer' });
                    const fileName = `${student.first_name || 'Unknown'}_${student.last_name || 'Unknown'}.docx`
                        .replace(/[^a-zA-Z0-9_.\-\s]/g, '')
                        .replace(/\s+/g, '_');

                    zip.file(fileName, generatedDoc);
                } catch (docErr) {
                    console.error(`Error generating doc for ${student.first_name} ${student.last_name}:`, docErr);
                }
            }

            // 3. Download ZIP
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const zipName = `${courseName.replace(/[^a-zA-Z0-9_.\-\s]/g, '').replace(/\s+/g, '_')}_Documents.zip`;
            saveAs(zipBlob, zipName);

            showToast(`Generated ${confirmedForCourse.length} document(s)!`, 'success');
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
        <div className="space-y-6 pb-24">
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
                            <h3 className="text-lg font-bold text-primary">Word Document Template</h3>
                            <p className="text-sm text-muted mt-0.5">
                                Upload a Word template (.docx) with placeholders like {'{firstName}'}, {'{lastName}'}, {'{email}'}, {'{courseDate}'}, etc.
                                This template will be used to generate personalized documents for each student.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Current Template */}
                <div className="px-5 py-3 bg-surface-elevated/50 border-b border-border-subtle">
                    {template ? (
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <FileArchive size={16} className="text-violet-500" />
                                <span className="text-sm font-semibold text-primary">Current template:</span>
                                <span className="text-sm text-muted">{template.name}</span>
                            </div>
                            <button
                                onClick={handleDeleteTemplate}
                                className="text-surface-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-all"
                                title="Delete template"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <AlertCircle size={16} className="text-amber-500" />
                            <span className="text-sm text-amber-600 font-medium">No template uploaded yet</span>
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
                                if (file) handleTemplateUpload(file);
                                e.target.value = '';
                            }}
                        />
                        <div className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-500 via-purple-500 to-violet-600 hover:from-violet-600 hover:via-purple-600 hover:to-violet-700 transition-all shadow-sm hover:shadow-md hover:shadow-violet-500/25">
                            {uploading ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <Upload size={16} />
                            )}
                            {template ? 'Replace Template' : 'Upload Template'}
                        </div>
                    </label>
                    <p className="text-[11px] text-muted mt-2 text-center">
                        Maximum file size: 5MB. Supported placeholders: {'{firstName}'}, {'{lastName}'}, {'{email}'}, {'{mobileNumber}'}, {'{address}'}, {'{eircode}'}, {'{dateOfBirth}'}, {'{courseTitle}'}, {'{courseDate}'} and more.
                    </p>
                </div>
            </div>

            {/* ═══ Generate Documents Card ═══ */}
            <div className="bg-surface rounded-2xl shadow-card border border-border-subtle overflow-hidden">
                <div className="p-5 border-b border-border-subtle">
                    <div className="flex items-start gap-3">
                        <div className="p-2.5 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl text-emerald-600 flex-shrink-0">
                            <Download size={22} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-primary">Generate Documents</h3>
                            <p className="text-sm text-muted mt-0.5">
                                Select a course to generate personalized documents for all confirmed participants. Documents will be downloaded as a ZIP archive.
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
                        <div className="relative">
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
                                <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-surface-elevated rounded-xl shadow-lg border border-border-subtle py-1 max-h-64 overflow-y-auto animate-scaleIn origin-top">
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
                        disabled={!template || confirmedForCourse.length === 0 || generating}
                        className={`w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl text-sm font-bold transition-all ${!template || confirmedForCourse.length === 0
                            ? 'bg-surface-elevated text-muted cursor-not-allowed border border-border-subtle'
                            : generating
                                ? 'bg-emerald-400 text-white cursor-wait'
                                : 'bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-500 text-white hover:from-emerald-600 hover:via-emerald-700 hover:to-teal-600 shadow-sm hover:shadow-md hover:shadow-emerald-500/25'
                            }`}
                    >
                        {generating ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                Generating {confirmedForCourse.length} document(s)...
                            </>
                        ) : (
                            <>
                                <FileArchive size={18} />
                                Generate & Download ZIP ({confirmedForCourse.length} document{confirmedForCourse.length !== 1 ? 's' : ''})
                            </>
                        )}
                    </button>

                    {!template && (
                        <p className="text-xs text-amber-500 text-center font-medium">
                            ⚠ Please upload a template first before generating documents
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
