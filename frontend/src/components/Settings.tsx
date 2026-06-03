import { useState, useCallback } from 'react';
import { Settings as SettingsIcon, Mail, Calendar, RotateCcw, Save, Eye, EyeOff, Info, AlertTriangle, Briefcase, GitMerge, Search, Loader2, Check } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { getConfig, setConfig, resetConfig, buildEmailBodyHtml, buildEmailSubject, buildStatusEmailBodyHtml, type AppConfig } from '../lib/appConfig';
import { supabase } from '../lib/supabase';
import { Student } from '../lib/types';
import MergeModal from './MergeModal';

const quillModules = {
    toolbar: [
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        ['link'],
        ['clean'],
        [{ 'font': [] }],
        [{ 'color': [] }, { 'background': [] }],
    ]
};

export default function Settings() {
    const [config, setLocalConfig] = useState<AppConfig>(getConfig);
    const [saved, setSaved] = useState(false);
    const [showPreview, setShowPreview] = useState(true);

    const isValidTemplate = config.htmlEmailTemplate.includes('{confirmationLink}') || config.htmlEmailTemplate.includes('{confirmationButton}');
    const isValidStatusTemplate = config.statusEmailTemplate.includes('{statusLink}') || config.statusEmailTemplate.includes('{statusButton}');

    const handleSave = useCallback(() => {
        if (!isValidTemplate || !isValidStatusTemplate) return;
        setConfig(config);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    }, [config, isValidTemplate, isValidStatusTemplate]);

    const handleReset = useCallback(() => {
        const defaults = resetConfig();
        setLocalConfig(defaults);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    }, []);

    const hasChanges = JSON.stringify(config) !== JSON.stringify(getConfig());
    const canSave = hasChanges && isValidTemplate && isValidStatusTemplate;

    // Preview with sample data
    const linkStr = 'https://example.com/confirm?course_id=abc123&date=2026-03-15';
    const previewBody = buildEmailBodyHtml('Introduction to Digital Skills', '15 Mar 2026', linkStr, config);
    const previewSubject = buildEmailSubject('Introduction to Digital Skills', '15 Mar 2026', config);

    // Status template preview
    const statusLinkStr = 'https://forms.gle/5ernSprvAbq4MTgf9';
    const statusPreviewBody = buildStatusEmailBodyHtml(statusLinkStr, config);

    const [showStatusPreview, setShowStatusPreview] = useState(true);

    const [scanning, setScanning] = useState(false);
    const [duplicateGroups, setDuplicateGroups] = useState<{ key: string; students: Student[] }[]>([]);
    const [selectedStudentForMerge, setSelectedStudentForMerge] = useState<Student | null>(null);
    const [targetStudentForMerge, setTargetStudentForMerge] = useState<Student | null>(null);
    const [mergeModalOpen, setMergeModalOpen] = useState(false);
    const [hasScanned, setHasScanned] = useState(false);
    const [markingNonDuplicates, setMarkingNonDuplicates] = useState<string | null>(null);

    const runDuplicateScan = useCallback(async () => {
        setScanning(true);
        setHasScanned(true);
        try {
            const { data: studentsData, error: studentsError } = await supabase
                .from('students')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (studentsError) throw studentsError;
            if (!studentsData) return;

            // Load non-duplicate relationships (fail-safe if table doesn't exist yet)
            let nonDupsData: { student_a_id: string; student_b_id: string }[] = [];
            try {
                const { data: ndData, error: ndError } = await supabase
                    .from('student_non_duplicates')
                    .select('student_a_id, student_b_id');
                if (!ndError && ndData) {
                    nonDupsData = ndData;
                }
            } catch (ndErr) {
                console.warn('Failed to load student_non_duplicates (table may not exist yet):', ndErr);
            }

            const nonDupsSet = new Set<string>();
            nonDupsData.forEach(row => {
                const ids = [row.student_a_id, row.student_b_id].sort();
                nonDupsSet.add(`${ids[0]}_${ids[1]}`);
            });

            // Group by email (ignoring empty emails)
            const groups: Record<string, Student[]> = {};
            studentsData.forEach(s => {
                if (s.email && s.email.trim()) {
                    const k = s.email.trim().toLowerCase();
                    if (!groups[k]) groups[k] = [];
                    groups[k].push(s);
                }
            });

            // Filter groups with > 1 student AND containing unresolved duplicates
            const dups = Object.entries(groups)
                .filter(([_, list]) => {
                    if (list.length <= 1) return false;
                    for (let i = 0; i < list.length; i++) {
                        for (let j = i + 1; j < list.length; j++) {
                            const pair = [list[i].id, list[j].id].sort();
                            if (!nonDupsSet.has(`${pair[0]}_${pair[1]}`)) {
                                return true; // Found an unresolved duplicate pair
                            }
                        }
                    }
                    return false;
                })
                .map(([key, list]) => ({
                    key,
                    students: list
                }));

            setDuplicateGroups(dups);
        } catch (err) {
            console.error('Scan failed:', err);
        } finally {
            setScanning(false);
        }
    }, []);

    const markGroupAsNonDuplicates = useCallback(async (key: string, students: Student[]) => {
        setMarkingNonDuplicates(key);
        try {
            const pairsToInsert: { student_a_id: string; student_b_id: string }[] = [];
            for (let i = 0; i < students.length; i++) {
                for (let j = i + 1; j < students.length; j++) {
                    const ids = [students[i].id, students[j].id].sort();
                    pairsToInsert.push({
                        student_a_id: ids[0],
                        student_b_id: ids[1]
                    });
                }
            }

            if (pairsToInsert.length > 0) {
                const { error } = await supabase
                    .from('student_non_duplicates')
                    .upsert(pairsToInsert, { onConflict: 'student_a_id,student_b_id' });
                
                if (error) throw error;
            }

            await runDuplicateScan();
        } catch (err) {
            console.error('Failed to mark group as non-duplicates:', err);
        } finally {
            setMarkingNonDuplicates(null);
        }
    }, [runDuplicateScan]);

    return (
        <div className="space-y-6 pb-8 w-full animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-brand-500/10 rounded-xl text-brand-500 dark:text-brand-400">
                        <SettingsIcon size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-primary tracking-tight">Settings</h2>
                        <p className="text-xs text-muted">Configure email templates and display preferences</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleReset}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted hover:text-danger bg-surface-elevated hover:bg-danger/10 border border-border-subtle rounded-xl transition-all"
                    >
                        <RotateCcw size={14} />
                        Reset
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!canSave}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all ${saved
                            ? 'bg-success/20 text-success border border-success/30'
                            : canSave
                                ? 'bg-brand-500 text-white hover:bg-brand-600 shadow-md shadow-brand-500/20'
                                : 'bg-surface-elevated text-muted border border-border-subtle cursor-not-allowed'
                            }`}
                    >
                        <Save size={14} />
                        {saved ? 'Saved!' : 'Save Changes'}
                    </button>
                </div>
            </div>

            {/* ═══ Course Invitation Email Settings ═══ */}
            <section className="bg-surface rounded-2xl shadow-card border border-border-subtle overflow-hidden">
                <div className="px-5 py-4 border-b border-border-subtle bg-surface-elevated/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-brand-500/10 rounded-lg">
                            <Mail size={16} className="text-brand-500 dark:text-brand-400" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-primary">Course Invitation Email</h3>
                            <p className="text-xs text-muted mt-0.5">Configure email subject and body template sent to invited students</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowPreview(!showPreview)}
                        className="flex items-center gap-1.5 text-xs font-medium text-muted hover:text-primary px-2.5 py-1.5 rounded-lg hover:bg-surface-elevated transition-all"
                    >
                        {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                        {showPreview ? 'Hide' : 'Preview'}
                    </button>
                </div>

                <div className={`p-5 grid grid-cols-1 ${showPreview ? 'xl:grid-cols-2' : ''} gap-6`}>
                    <div className="space-y-4">
                        {/* Subject Editing */}
                        <div className="space-y-2">
                            <label className="block text-xs font-semibold text-muted uppercase tracking-wider">Email Subject</label>
                            <input
                                type="text"
                                value={config.emailSubjectFormat}
                                onChange={e => setLocalConfig({ ...config, emailSubjectFormat: e.target.value })}
                                className="w-full px-4 py-2.5 bg-background border border-border-strong rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all text-primary placeholder:text-muted/40"
                                placeholder="e.g. You are Invited to join our {courseName} course"
                            />
                            <div className="flex items-start gap-2 p-3 bg-surface-elevated/50 border border-border-subtle rounded-xl">
                                <Info size={14} className="text-muted mt-0.5 flex-shrink-0" />
                                <p className="text-[11px] text-muted leading-relaxed">
                                    Subject placeholders: <code className="px-1.5 py-0.5 bg-background rounded font-mono text-primary">{'{courseName}'}</code> — course name, <code className="px-1.5 py-0.5 bg-background rounded font-mono text-primary">{'{date}'}</code> — invite date
                                </p>
                            </div>
                        </div>

                        {/* Body Editing */}
                        <div className="space-y-2">
                            <label className="block text-xs font-semibold text-muted uppercase tracking-wider">Email Body</label>
                            <div className="flex items-start gap-2 p-3 bg-surface-elevated/50 border border-border-subtle rounded-xl mb-2">
                                <Info size={14} className="text-muted mt-0.5 flex-shrink-0" />
                                <p className="text-[11px] text-muted leading-relaxed">
                                    Body placeholders: <code className="px-1.5 py-0.5 bg-background rounded font-mono text-primary">{'{courseDetails}'}</code> — styled course details card, <code className="px-1.5 py-0.5 bg-background rounded font-mono text-primary">{'{confirmationButton}'}</code> — styled confirm button
                                </p>
                            </div>
                            <div className="w-full bg-background border border-border-strong rounded-xl text-sm focus-within:ring-2 focus-within:ring-brand-500/50 focus-within:border-brand-500 transition-all text-primary [&_.ql-toolbar]:bg-surface-elevated/50 [&_.ql-toolbar]:border-none [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-border-subtle [&_.ql-toolbar]:rounded-t-xl [&_.ql-container]:border-none [&_.ql-container]:rounded-b-xl [&_.ql-editor]:min-h-[250px] [&_.ql-editor]:max-h-[500px] [&_.ql-editor]:overflow-y-auto [&_.ql-editor]:p-4 [&_.ql-stroke]:stroke-primary dark:[&_.ql-stroke]:stroke-white [&_.ql-fill]:fill-primary dark:[&_.ql-fill]:fill-white [&_.ql-picker]:text-primary dark:[&_.ql-picker]:text-white">
                                <ReactQuill 
                                    theme="snow"
                                    value={config.htmlEmailTemplate}
                                    onChange={(content) => {
                                        if (content !== config.htmlEmailTemplate) {
                                            setLocalConfig(prev => ({ ...prev, htmlEmailTemplate: content }));
                                        }
                                    }}
                                    modules={quillModules}
                                />
                            </div>
                        </div>

                        {!isValidTemplate && (
                            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-sm animate-fadeIn">
                                <AlertTriangle size={16} className="flex-shrink-0" />
                                <span><strong>Warning:</strong> Template must include confirmation tag (<code>{'{confirmationButton}'}</code> or <code>{'{confirmationLink}'}</code>).</span>
                            </div>
                        )}
                    </div>

                    {/* Preview */}
                    {showPreview && (
                        <div className="space-y-3 animate-fadeIn h-full flex flex-col min-w-0">
                            <div className="text-xs font-bold text-muted uppercase tracking-wider">Live Preview</div>
                            <div className="p-4 bg-background border border-border-subtle rounded-xl flex-1 flex flex-col">
                                <div className="text-xs text-muted mb-2">
                                    <span className="font-semibold">Subject: </span>
                                    <span className="text-primary">{previewSubject}</span>
                                </div>
                                <hr className="border-border-subtle mb-3" />
                                <iframe
                                    srcDoc={previewBody}
                                    title="Email Invitation Preview"
                                    className="w-full flex-1 min-h-[500px] max-h-[600px] border border-border-subtle rounded-xl bg-[#f4f7f6]"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* ═══ Graduate Outcomes Survey Email ═══ */}
            <section className="bg-surface rounded-2xl shadow-card border border-border-subtle overflow-hidden">
                <div className="px-5 py-4 border-b border-border-subtle bg-surface-elevated/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-violet-500/10 rounded-lg">
                            <Briefcase size={16} className="text-violet-500" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-primary">Graduate Outcomes Survey Email</h3>
                            <p className="text-xs text-muted mt-0.5">Configure email subject and body template sent to graduates for employment tracking</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowStatusPreview(!showStatusPreview)}
                        className="flex items-center gap-1.5 text-xs font-medium text-muted hover:text-primary px-2.5 py-1.5 rounded-lg hover:bg-surface-elevated transition-all"
                    >
                        {showStatusPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                        {showStatusPreview ? 'Hide' : 'Preview'}
                    </button>
                </div>

                <div className={`p-5 grid grid-cols-1 ${showStatusPreview ? 'xl:grid-cols-2' : ''} gap-6`}>
                    <div className="space-y-4">
                        {/* Subject Editing */}
                        <div className="space-y-2">
                            <label className="block text-xs font-semibold text-muted uppercase tracking-wider">Email Subject</label>
                            <input
                                type="text"
                                value={config.statusEmailSubjectFormat}
                                onChange={e => setLocalConfig({ ...config, statusEmailSubjectFormat: e.target.value })}
                                className="w-full px-4 py-2.5 bg-background border border-border-strong rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all text-primary placeholder:text-muted/40"
                                placeholder="e.g. Quick Status Update — How are things going?"
                            />
                        </div>

                        {/* Body Editing */}
                        <div className="space-y-2">
                            <label className="block text-xs font-semibold text-muted uppercase tracking-wider">Email Body</label>
                            <div className="flex items-start gap-2 p-3 bg-surface-elevated/50 border border-border-subtle rounded-xl mb-2">
                                <Info size={14} className="text-muted mt-0.5 flex-shrink-0" />
                                <p className="text-[11px] text-muted leading-relaxed">
                                    Body placeholders: <code className="px-1.5 py-0.5 bg-background rounded font-mono text-primary">{'{statusButton}'}</code> — styled action button, <code className="px-1.5 py-0.5 bg-background rounded font-mono text-primary">{'{statusLink}'}</code> — raw update URL
                                </p>
                            </div>
                            <div className="w-full bg-background border border-border-strong rounded-xl text-sm focus-within:ring-2 focus-within:ring-violet-500/50 focus-within:border-violet-500 transition-all text-primary [&_.ql-toolbar]:bg-surface-elevated/50 [&_.ql-toolbar]:border-none [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-border-subtle [&_.ql-toolbar]:rounded-t-xl [&_.ql-container]:border-none [&_.ql-container]:rounded-b-xl [&_.ql-editor]:min-h-[200px] [&_.ql-editor]:max-h-[400px] [&_.ql-editor]:overflow-y-auto [&_.ql-editor]:p-4 [&_.ql-stroke]:stroke-primary dark:[&_.ql-stroke]:stroke-white [&_.ql-fill]:fill-primary dark:[&_.ql-fill]:fill-white [&_.ql-picker]:text-primary dark:[&_.ql-picker]:text-white">
                                <ReactQuill
                                    theme="snow"
                                    value={config.statusEmailTemplate}
                                    onChange={(content) => {
                                        if (content !== config.statusEmailTemplate) {
                                            setLocalConfig(prev => ({ ...prev, statusEmailTemplate: content }));
                                        }
                                    }}
                                    modules={quillModules}
                                />
                            </div>
                        </div>

                        {!isValidStatusTemplate && (
                            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-sm animate-fadeIn">
                                <AlertTriangle size={16} className="flex-shrink-0" />
                                <span><strong>Warning:</strong> Template must include at least one status tag (<code>{'{statusButton}'}</code> or <code>{'{statusLink}'}</code>).</span>
                            </div>
                        )}
                    </div>

                    {/* Preview */}
                    {showStatusPreview && (
                        <div className="space-y-3 animate-fadeIn h-full flex flex-col min-w-0">
                            <div className="text-xs font-bold text-muted uppercase tracking-wider">Live Preview</div>
                            <div className="p-4 bg-background border border-border-subtle rounded-xl flex-1 flex flex-col">
                                <div className="text-xs text-muted mb-2">
                                    <span className="font-semibold">Subject: </span>
                                    <span className="text-primary">{config.statusEmailSubjectFormat}</span>
                                </div>
                                <hr className="border-border-subtle mb-3" />
                                <iframe
                                    srcDoc={statusPreviewBody}
                                    title="Status Survey Preview"
                                    className="w-full flex-1 min-h-[500px] max-h-[500px] border border-border-subtle rounded-xl bg-[#f4f7f6]"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* ═══ Duplicate Profiles Scanner ═══ */}
            <section className="bg-surface rounded-2xl shadow-card border border-border-subtle overflow-hidden">
                <div className="px-5 py-4 border-b border-border-subtle bg-surface-elevated/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-indigo-500/10 rounded-lg">
                            <GitMerge size={16} className="text-indigo-500" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-primary">Duplicate Profiles Scanner</h3>
                            <p className="text-xs text-muted mt-0.5">Scan the database for student profiles sharing the same email address</p>
                        </div>
                    </div>
                    <button
                        onClick={runDuplicateScan}
                        disabled={scanning}
                        className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
                    >
                        {scanning ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                        {scanning ? 'Scanning...' : 'Scan for Duplicates'}
                    </button>
                </div>
                <div className="p-5">
                    {scanning && (
                        <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted animate-fadeIn">
                            <Loader2 size={24} className="animate-spin text-indigo-500" />
                            <p className="text-xs font-medium">Scanning all student profiles...</p>
                        </div>
                    )}

                    {!scanning && !hasScanned && (
                        <div className="text-center py-6 text-xs text-muted">
                            Click "Scan for Duplicates" to search for redundant profiles.
                        </div>
                    )}

                    {!scanning && hasScanned && duplicateGroups.length === 0 && (
                        <div className="text-center py-6 text-xs text-green-600 dark:text-green-400 font-semibold">
                            🎉 No duplicates found! All emails in the database are unique.
                        </div>
                    )}

                    {!scanning && duplicateGroups.length > 0 && (
                        <div className="space-y-4">
                            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
                                <AlertTriangle size={14} className="flex-shrink-0" />
                                <span>Found {duplicateGroups.length} group(s) of students sharing the same email address. Review and merge them below:</span>
                            </p>
                            <div className="divide-y divide-border-subtle border border-border-subtle rounded-xl overflow-hidden bg-background">
                                {duplicateGroups.map((group) => (
                                    <div key={group.key} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-surface/30 transition-all">
                                        <div className="space-y-2">
                                            <span className="inline-block text-[10px] font-bold bg-indigo-500/10 text-indigo-600 px-2 py-0.5 rounded-full font-mono">
                                                {group.key}
                                            </span>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                                                {group.students.map((s) => (
                                                    <div key={s.id} className="text-xs text-primary font-medium flex items-center gap-2">
                                                        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                                                        <span>{s.first_name} {s.last_name}</span>
                                                        {s.phone && <span className="text-muted text-[10px]">({s.phone})</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 self-start sm:self-center">
                                            <button
                                                disabled={markingNonDuplicates === group.key || scanning}
                                                onClick={() => markGroupAsNonDuplicates(group.key, group.students)}
                                                className="px-3.5 py-2 bg-success/10 hover:bg-success/20 disabled:opacity-50 text-success text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 border border-success/10 hover:border-success/20 shadow-sm"
                                            >
                                                {markingNonDuplicates === group.key ? (
                                                    <Loader2 size={12} className="animate-spin" />
                                                ) : (
                                                    <Check size={12} />
                                                )}
                                                Not Duplicates
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setSelectedStudentForMerge(group.students[0]);
                                                    setTargetStudentForMerge(group.students[1]);
                                                    setMergeModalOpen(true);
                                                }}
                                                className="px-3.5 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 border border-indigo-500/10 hover:border-indigo-500/20 shadow-sm"
                                            >
                                                <GitMerge size={12} />
                                                Review & Merge
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {mergeModalOpen && selectedStudentForMerge && (
                    <MergeModal
                        open={mergeModalOpen}
                        student={selectedStudentForMerge}
                        initialTargetStudent={targetStudentForMerge}
                        onClose={() => {
                            setMergeModalOpen(false);
                            setSelectedStudentForMerge(null);
                            setTargetStudentForMerge(null);
                        }}
                        onSuccess={() => {
                            runDuplicateScan();
                        }}
                    />
                )}
            </section>

            {/* ═══ Display Preferences ═══ */}
            <section className="bg-surface rounded-2xl shadow-card border border-border-subtle overflow-hidden">
                <div className="px-5 py-4 border-b border-border-subtle bg-surface-elevated/50">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-success/10 rounded-lg">
                            <Calendar size={16} className="text-success" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-primary">General Preferences</h3>
                            <p className="text-xs text-muted mt-0.5">Customize email and display preferences</p>
                        </div>
                    </div>
                </div>
                <div className="p-5">
                    <div>
                        <label className="flex items-center gap-3 cursor-pointer group w-max">
                            <div className="relative flex items-center justify-center">
                                <input
                                    type="checkbox"
                                    checked={config.includeLogosInEmails ?? true}
                                    onChange={e => setLocalConfig({ ...config, includeLogosInEmails: e.target.checked })}
                                    className="peer sr-only"
                                />
                                <div className="w-10 h-6 bg-surface-elevated border border-border-strong rounded-full peer-checked:bg-brand-500 peer-checked:border-brand-500 transition-colors"></div>
                                <div className="absolute left-1 top-1 w-4 h-4 bg-muted rounded-full peer-checked:bg-white peer-checked:translate-x-4 transition-transform shadow-sm"></div>
                            </div>
                            <div>
                                <span className="text-sm font-semibold text-primary group-hover:text-brand-500 transition-colors">Include Logos in Emails</span>
                                <p className="text-xs text-muted mt-0.5">Show the Cork City Partnership logo banner at the top of all emails.</p>
                            </div>
                        </label>
                    </div>
                </div>
            </section>

            {/* ═══ Info Footer ═══ */}
            <div className="flex items-center gap-2 text-xs text-muted px-1">
                <Info size={12} />
                <span>Settings are saved locally in your browser and will persist across sessions.</span>
            </div>
        </div>
    );
}
