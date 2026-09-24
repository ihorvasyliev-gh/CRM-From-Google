import { useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { Mail, RotateCcw, Save, Eye, EyeOff, Info, AlertTriangle, Briefcase, GitMerge, Search, Loader2, Check, CheckCircle2, Rows3, Rows4, Plus, Languages, Globe, SlidersHorizontal, ShieldCheck, MailX } from 'lucide-react';
import ReactQuill, { Quill } from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { getConfig, setConfig, resetConfig, buildEmailBodyHtml, buildEmailSubject, buildStatusEmailBodyHtml, type AppConfig, type StatusEmailAudience } from '../lib/appConfig';
import { supabase } from '../lib/supabase';
import { Student } from '../lib/types';
import MergeModal from './MergeModal';
import UserRolesSection from './UserRolesSection';
import EmailOptOutSection from './EmailOptOutSection';
import Card from './ui/Card';
import Badge from './ui/Badge';
import { Button, IconButton } from './ui/Button';
import { Segmented } from './ui/Tabs';
import { EmptyState } from './ui/States';
import { calloutCls, eyebrowCls, inputCls, labelCls, panelCls } from './ui/styles';
import { toast } from '../lib/toast';
import { areNamesSimilar, normalizePhone } from '../lib/similarity';

// Register inline styles for Quill color, background, font, and size to ensure email client compatibility
const ColorStyle = Quill.import('attributors/style/color') as any;
const BackgroundStyle = Quill.import('attributors/style/background') as any;
const FontStyle = Quill.import('attributors/style/font') as any;
const SizeStyle = Quill.import('attributors/style/size') as any;
Quill.register(ColorStyle, true);
Quill.register(BackgroundStyle, true);
Quill.register(FontStyle, true);
Quill.register(SizeStyle, true);

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
    const [density, setDensity] = useState<'comfortable' | 'compact'>(() => {
        try {
            const saved = window.localStorage.getItem('view_density');
            return (saved === 'compact' || saved === 'comfortable') ? saved : 'comfortable';
        } catch {
            return 'comfortable';
        }
    });

    useEffect(() => {
        const handleDensityChange = (e: Event) => {
            const customEvent = e as CustomEvent<'comfortable' | 'compact'>;
            if (customEvent.detail) {
                setDensity(customEvent.detail);
            } else {
                const saved = window.localStorage.getItem('view_density');
                if (saved === 'compact' || saved === 'comfortable') setDensity(saved);
            }
        };
        window.addEventListener('densitychange', handleDensityChange);
        return () => window.removeEventListener('densitychange', handleDensityChange);
    }, []);

    const [inviteTemplateTab, setInviteTemplateTab] = useState<'high_english' | 'standard'>('high_english');
    const [previewMultiDate, setPreviewMultiDate] = useState(false);

    const isValidHighEnglishTemplate = config.htmlEmailTemplate.includes('{confirmationLink}') || config.htmlEmailTemplate.includes('{confirmationButton}');
    const isValidStandardTemplate = (config.htmlEmailTemplateStandard || '').includes('{confirmationLink}') || (config.htmlEmailTemplateStandard || '').includes('{confirmationButton}');
    const isValidTemplate = isValidHighEnglishTemplate && isValidStandardTemplate;
    const hasStatusTag = (tpl: string) => tpl.includes('{statusLink}') || tpl.includes('{statusButton}');
    const isValidStatusTemplate = hasStatusTag(config.statusEmailTemplate) && hasStatusTag(config.outreachEmailTemplate);
    // Survey email tab: CRM graduates or external lists (e.g. Action 11)
    const [statusAudience, setStatusAudience] = useState<StatusEmailAudience>('graduates');
    const statusTemplateKey = statusAudience === 'outreach' ? 'outreachEmailTemplate' : 'statusEmailTemplate';
    const statusSubjectKey = statusAudience === 'outreach' ? 'outreachEmailSubjectFormat' : 'statusEmailSubjectFormat';
    const isValidCurrentStatusTemplate = hasStatusTag(config[statusTemplateKey]);

    // Snapshot of the last saved config — comparing against it avoids re-reading and
    // re-migrating localStorage on every keystroke in the template editors.
    const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(getConfig()));
    // Quill normalises the stored HTML when it mounts, which alone would make the config look
    // edited. Only count the page as dirty once the user actually changed something.
    const [touched, setTouched] = useState(false);
    const editConfig = useCallback((updater: (prev: AppConfig) => AppConfig) => {
        setTouched(true);
        setLocalConfig(updater);
    }, []);

    const handleSave = useCallback(() => {
        if (!isValidTemplate || !isValidStatusTemplate) return;
        const merged = setConfig(config);
        setSavedSnapshot(JSON.stringify(merged));
        setTouched(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    }, [config, isValidTemplate, isValidStatusTemplate]);

    const handleReset = useCallback(() => {
        if (!window.confirm('Reset all email templates and settings to their defaults?')) return;
        const defaults = resetConfig();
        setLocalConfig(defaults);
        setSavedSnapshot(JSON.stringify(defaults));
        setTouched(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    }, []);

    const hasChanges = useMemo(() => touched && JSON.stringify(config) !== savedSnapshot, [touched, config, savedSnapshot]);
    const canSave = hasChanges && isValidTemplate && isValidStatusTemplate;

    // Ctrl/Cmd+S saves; warn before closing the tab with unsaved edits
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                if (canSave) handleSave();
            }
        };
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            if (!hasChanges) return;
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('beforeunload', onBeforeUnload);
        };
    }, [canSave, hasChanges, handleSave]);

    // Preview with sample data
    const linkStr = 'https://example.com/confirm?course_id=abc123&date=2026-03-15';
    const previewCourseName = inviteTemplateTab === 'high_english' ? 'Security Guarding (PSA)' : 'Introduction to Digital Skills';
    const previewDates = previewMultiDate ? ['Wed, 11 Mar 2026', 'Thu, 12 Mar 2026', 'Fri, 13 Mar 2026'] : '15 Mar 2026';
    const previewBody = buildEmailBodyHtml(previewCourseName, previewDates, linkStr, config, 7, inviteTemplateTab === 'high_english');
    const previewSubject = buildEmailSubject(previewCourseName, previewMultiDate ? 'Wed 11, Thu 12 or Fri 13 Mar 2026' : '15 Mar 2026', config);

    // Status template preview
    const statusLinkStr = `${window.location.origin}/status${statusAudience === 'outreach' ? '?list=example' : ''}`;
    const statusPreviewBody = buildStatusEmailBodyHtml(statusLinkStr, config, statusAudience);

    const [showStatusPreview, setShowStatusPreview] = useState(true);
    const [activeSection, setActiveSection] = useState('settings-invitation');

    // Highlight the section currently in view in the side navigation
    useEffect(() => {
        if (typeof IntersectionObserver === 'undefined') return;
        const ids = ['settings-invitation', 'settings-survey', 'settings-unsubscribes', 'settings-duplicates', 'settings-preferences', 'settings-users'];
        const observer = new IntersectionObserver(
            entries => {
                const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
                if (visible[0]) setActiveSection(visible[0].target.id);
            },
            { rootMargin: '-80px 0px -60% 0px' }
        );
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) observer.observe(el);
        });
        return () => observer.disconnect();
    }, []);

    const [scanning, setScanning] = useState(false);
    const [duplicateGroups, setDuplicateGroups] = useState<{ key: string; students: Student[] }[]>([]);
    const [potentialMatches, setPotentialMatches] = useState<{ studentA: Student; studentB: Student; reason: string }[]>([]);
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

            // 1. Group by exact email (ignoring empty emails)
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

            // 2. Fast candidate bucketing: group students by normalized phone and by DOB
            // Instead of comparing all N*(N-1)/2 pairs (~4.5M comparisons),
            // only compare students that share a normalized phone or DOB.
            const candidatePairs = new Map<string, [Student, Student]>();
            const phoneBuckets = new Map<string, Student[]>();
            const dobBuckets = new Map<string, Student[]>();

            for (const s of studentsData) {
                const p = normalizePhone(s.phone);
                if (p && p.length >= 6) {
                    let list = phoneBuckets.get(p);
                    if (!list) {
                        list = [];
                        phoneBuckets.set(p, list);
                    }
                    list.push(s);
                }
                if (s.dob && s.dob.trim()) {
                    const d = s.dob.trim();
                    let list = dobBuckets.get(d);
                    if (!list) {
                        list = [];
                        dobBuckets.set(d, list);
                    }
                    list.push(s);
                }
            }

            for (const list of phoneBuckets.values()) {
                if (list.length > 1) {
                    for (let i = 0; i < list.length; i++) {
                        for (let j = i + 1; j < list.length; j++) {
                            const [id1, id2] = [list[i].id, list[j].id].sort();
                            const key = `${id1}_${id2}`;
                            if (!candidatePairs.has(key)) {
                                candidatePairs.set(key, [list[i], list[j]]);
                            }
                        }
                    }
                }
            }

            for (const list of dobBuckets.values()) {
                if (list.length > 1) {
                    for (let i = 0; i < list.length; i++) {
                        for (let j = i + 1; j < list.length; j++) {
                            const [id1, id2] = [list[i].id, list[j].id].sort();
                            const key = `${id1}_${id2}`;
                            if (!candidatePairs.has(key)) {
                                candidatePairs.set(key, [list[i], list[j]]);
                            }
                        }
                    }
                }
            }

            const matchesList: { studentA: Student; studentB: Student; reason: string }[] = [];
            const processedPairs = new Set<string>();

            for (const [pairKey, [s1, s2]] of candidatePairs.entries()) {
                // Skip if they share the exact same email (handled by email duplicate scanner)
                if (s1.email && s2.email && s1.email.trim().toLowerCase() === s2.email.trim().toLowerCase()) {
                    continue;
                }

                if (nonDupsSet.has(pairKey) || processedPairs.has(pairKey)) {
                    continue;
                }

                // Check if names are similar
                if (areNamesSimilar(s1.first_name, s1.last_name, s2.first_name, s2.last_name)) {
                    let hasMatchingId = false;
                    const reasons: string[] = [];

                    // Check DOB match
                    if (s1.dob && s2.dob && s1.dob === s2.dob) {
                        hasMatchingId = true;
                        reasons.push('Same DOB');
                    }

                    // Check Phone match
                    const p1 = normalizePhone(s1.phone);
                    const p2 = normalizePhone(s2.phone);
                    if (p1 && p2 && p1 === p2) {
                        hasMatchingId = true;
                        reasons.push('Same Phone');
                    }

                    if (hasMatchingId) {
                        processedPairs.add(pairKey);
                        const t1 = new Date(s1.created_at || 0).getTime();
                        const t2 = new Date(s2.created_at || 0).getTime();
                        const studentA = t1 <= t2 ? s1 : s2; // older profile
                        const studentB = t1 <= t2 ? s2 : s1; // newer profile

                        // List the differences
                        const diffs: string[] = [];
                        if (studentA.address !== studentB.address) diffs.push('address');
                        if (studentA.phone !== studentB.phone && normalizePhone(studentA.phone) !== normalizePhone(studentB.phone)) diffs.push('phone');
                        if (studentA.email !== studentB.email) diffs.push('email');

                        let reasonText = reasons.join(' & ');
                        if (diffs.length > 0) {
                            reasonText += `, different ${diffs.join('/')}`;
                        }

                        matchesList.push({
                            studentA,
                            studentB,
                            reason: reasonText
                        });
                    }
                }
            }

            setDuplicateGroups(dups);
            setPotentialMatches(matchesList);
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
            toast.error('Failed to mark profiles as not duplicates');
        } finally {
            setMarkingNonDuplicates(null);
        }
    }, [runDuplicateScan]);

    const markPairAsNonDuplicates = useCallback(async (sA: Student, sB: Student) => {
        const key = [sA.id, sB.id].sort().join('_');
        setMarkingNonDuplicates(key);
        try {
            const ids = [sA.id, sB.id].sort();
            const { error } = await supabase
                .from('student_non_duplicates')
                .upsert({
                    student_a_id: ids[0],
                    student_b_id: ids[1]
                }, { onConflict: 'student_a_id,student_b_id' });
            
            if (error) throw error;

            await runDuplicateScan();
        } catch (err) {
            console.error('Failed to mark pair as non-duplicates:', err);
            toast.error('Failed to mark profiles as not duplicates');
        } finally {
            setMarkingNonDuplicates(null);
        }
    }, [runDuplicateScan]);

    const insertVariable = useCallback((variable: string, target: 'invitation_high_english' | 'invitation_standard' | 'status' | 'outreach') => {
        if (target === 'invitation_high_english') {
            editConfig(prev => ({
                ...prev,
                htmlEmailTemplate: prev.htmlEmailTemplate ? `${prev.htmlEmailTemplate} ${variable}` : variable
            }));
        } else if (target === 'invitation_standard') {
            editConfig(prev => ({
                ...prev,
                htmlEmailTemplateStandard: prev.htmlEmailTemplateStandard ? `${prev.htmlEmailTemplateStandard} ${variable}` : variable
            }));
        } else if (target === 'outreach') {
            editConfig(prev => ({
                ...prev,
                outreachEmailTemplate: prev.outreachEmailTemplate ? `${prev.outreachEmailTemplate} ${variable}` : variable
            }));
        } else {
            editConfig(prev => ({
                ...prev,
                statusEmailTemplate: prev.statusEmailTemplate ? `${prev.statusEmailTemplate} ${variable}` : variable
            }));
        }
    }, [editConfig]);

    const quillWrapCls = 'w-full bg-surface border border-border-subtle rounded-xl text-sm focus-within:ring-2 focus-within:ring-brand-500/20 focus-within:border-brand-500 transition-colors text-primary [&_.ql-toolbar]:bg-surface-elevated/60 [&_.ql-toolbar]:border-none [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-border-subtle [&_.ql-toolbar]:rounded-t-xl [&_.ql-container]:border-none [&_.ql-container]:rounded-b-xl [&_.ql-editor]:rounded-b-xl dark:[&_.ql-editor]:bg-[#f8fafc] dark:[&_.ql-editor]:text-slate-900 [&_.ql-editor]:overflow-y-auto [&_.ql-editor]:p-4 [&_.ql-stroke]:stroke-primary dark:[&_.ql-stroke]:stroke-white [&_.ql-fill]:fill-primary dark:[&_.ql-fill]:fill-white [&_.ql-picker]:text-primary dark:[&_.ql-picker]:text-white';
    const chipCls = (present: boolean) =>
        `inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-mono border transition-colors active:scale-95 ${
            present
                ? 'bg-success/10 text-status-confirmed border-success/25 hover:bg-success/15'
                : 'bg-surface text-primary border-border-subtle hover:border-brand-500/50 hover:text-brand-600 dark:hover:text-brand-400'
        }`;
    const validNote = (ok: boolean, okText: string, badText: ReactNode) =>
        ok ? (
            <div className={`${calloutCls.success} flex items-center gap-2 px-3 py-2 text-xs font-medium`}>
                <Check size={14} className="flex-shrink-0 text-status-confirmed" />
                <span>{okText}</span>
            </div>
        ) : (
            <div className={`${calloutCls.danger} flex items-center gap-2 px-3 py-2.5 text-xs font-medium animate-fadeIn`}>
                <AlertTriangle size={15} className="flex-shrink-0 text-status-rejected" />
                <span>{badText}</span>
            </div>
        );

    const sections = [
        { id: 'settings-invitation', label: 'Invitation email', icon: Mail },
        { id: 'settings-survey', label: 'Outcomes survey', icon: Briefcase },
        { id: 'settings-unsubscribes', label: 'Unsubscribed', icon: MailX },
        { id: 'settings-duplicates', label: 'Duplicate profiles', icon: GitMerge },
        { id: 'settings-preferences', label: 'Preferences', icon: SlidersHorizontal },
        { id: 'settings-users', label: 'Users & roles', icon: ShieldCheck },
    ];
    const scrollToSection = (id: string) => {
        setActiveSection(id);
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <div className="w-full pb-8 animate-fadeIn">
            <div className="grid grid-cols-1 lg:grid-cols-[210px_minmax(0,1fr)] gap-5 lg:gap-8 items-start">
                {/* Section navigation */}
                <aside className="lg:sticky lg:top-6 min-w-0">
                    <nav aria-label="Settings sections" className="flex lg:flex-col gap-1 overflow-x-auto scrollbar-none -mx-3 px-3 lg:mx-0 lg:px-0">
                        {sections.map(sec => {
                            const Icon = sec.icon;
                            const active = activeSection === sec.id;
                            return (
                                <button
                                    key={sec.id}
                                    type="button"
                                    onClick={() => scrollToSection(sec.id)}
                                    aria-current={active ? 'true' : undefined}
                                    className={`shrink-0 flex items-center gap-2.5 h-9 px-3 rounded-xl text-[13px] font-medium whitespace-nowrap transition-colors ${
                                        active
                                            ? 'bg-surface text-primary font-semibold shadow-card ring-1 ring-border-subtle'
                                            : 'text-muted hover:text-primary hover:bg-surface/70'
                                    }`}
                                >
                                    <Icon size={15} className={active ? 'text-brand-500' : ''} />
                                    {sec.label}
                                </button>
                            );
                        })}
                    </nav>
                    <div className="hidden lg:block mt-6 pt-4 border-t border-border-subtle space-y-3">
                        <p className="flex items-start gap-1.5 text-[11px] text-muted leading-relaxed">
                            <Info size={12} className="flex-shrink-0 mt-0.5" />
                            Email and display settings are saved to your account and this browser.
                        </p>
                        <Button variant="ghost" size="sm" onClick={handleReset} className="-ml-2.5 hover:!text-status-rejected">
                            <RotateCcw size={13} />
                            Reset to defaults
                        </Button>
                    </div>
                </aside>

                <div className="space-y-6 min-w-0">
                    {/* ═══ Course Invitation Email ═══ */}
                    <Card
                        id="settings-invitation"
                        className="scroll-mt-20"
                        title="Course invitation email"
                        subtitle="Subject and body sent to invited students"
                        icon={Mail}
                        divided
                        action={
                            <div className="hidden sm:flex items-center gap-2">
                                <Segmented<'high_english' | 'standard'>
                                    ariaLabel="Invitation template"
                                    value={inviteTemplateTab}
                                    onChange={setInviteTemplateTab}
                                    options={[
                                        { value: 'high_english', label: 'High English', icon: <Languages size={13} /> },
                                        { value: 'standard', label: 'Standard', icon: <Globe size={13} /> },
                                    ]}
                                />
                                <Button variant="ghost" size="sm" onClick={() => setShowPreview(!showPreview)}>
                                    {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                                    {showPreview ? 'Hide preview' : 'Preview'}
                                </Button>
                            </div>
                        }
                    >
                        <div className="sm:hidden mb-4 flex items-center justify-between gap-2">
                            <Segmented<'high_english' | 'standard'>
                                ariaLabel="Invitation template"
                                value={inviteTemplateTab}
                                onChange={setInviteTemplateTab}
                                options={[
                                    { value: 'high_english', label: 'High English', icon: <Languages size={13} /> },
                                    { value: 'standard', label: 'Standard', icon: <Globe size={13} /> },
                                ]}
                            />
                            <IconButton label={showPreview ? 'Hide preview' : 'Show preview'} onClick={() => setShowPreview(!showPreview)}>
                                {showPreview ? <EyeOff size={16} /> : <Eye size={16} />}
                            </IconButton>
                        </div>
                        <div className={`grid grid-cols-1 ${showPreview ? '2xl:grid-cols-2 items-start' : ''} gap-6`}>
                            <div className="space-y-5 min-w-0">
                                <div className={`${calloutCls.info} p-3 flex items-start gap-2.5 text-xs`}>
                                    {inviteTemplateTab === 'high_english'
                                        ? <Languages size={15} className="text-status-invited flex-shrink-0 mt-px" />
                                        : <Globe size={15} className="text-status-invited flex-shrink-0 mt-px" />}
                                    <div className="space-y-0.5">
                                        <div className="font-semibold text-primary">
                                            {inviteTemplateTab === 'high_english' ? 'High English required template' : 'Standard course template'}
                                        </div>
                                        <div className="text-muted leading-relaxed">
                                            {inviteTemplateTab === 'high_english'
                                                ? 'Used for courses marked as "High English". Includes English suitability warnings and [I Am Confident in English — Confirm My Place] button.'
                                                : 'Used for general courses. Does not include language warnings and uses standard [Confirm My Place] button.'}
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="invite-subject" className={labelCls}>Email subject</label>
                                    <input
                                        id="invite-subject"
                                        type="text"
                                        value={config.emailSubjectFormat}
                                        onChange={e => editConfig(prev => ({ ...prev, emailSubjectFormat: e.target.value }))}
                                        className={`${inputCls} h-10`}
                                        placeholder="e.g. You are Invited to join our {courseName} course"
                                    />
                                    <p className="mt-1.5 text-[11px] text-muted leading-relaxed">
                                        Placeholders: <code className="px-1.5 py-0.5 bg-surface-elevated rounded font-mono text-primary">{'{courseName}'}</code> course name,{' '}
                                        <code className="px-1.5 py-0.5 bg-surface-elevated rounded font-mono text-primary">{'{date}'}</code> invite date
                                    </p>
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className={labelCls + ' !mb-0'}>
                                            {inviteTemplateTab === 'high_english' ? 'Email body (High English)' : 'Email body (Standard course)'}
                                        </span>
                                        <span className="text-[11px] text-muted">Click a tag to insert it</span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                        {[
                                            { tag: '{studentName}', label: 'Student Name' },
                                            { tag: '{courseName}', label: 'Course Name' },
                                            { tag: '{date}', label: 'Date' },
                                            { tag: '{responseDays}', label: 'Days' },
                                            { tag: '{courseDetails}', label: 'Course Card' },
                                            ...(inviteTemplateTab === 'high_english' ? [{ tag: '{englishWarning}', label: 'Warning Box' }] : []),
                                            { tag: '{capacityNotice}', label: 'Limited Places & No-Show Policy' },
                                            { tag: '{confirmationButton}', label: 'Confirm Button' },
                                            { tag: '{confirmationLink}', label: 'Confirm URL' },
                                        ].map(item => {
                                            const activeContent = inviteTemplateTab === 'high_english'
                                                ? config.htmlEmailTemplate
                                                : (config.htmlEmailTemplateStandard || '');
                                            const isPresent = activeContent.includes(item.tag);
                                            const target = inviteTemplateTab === 'high_english' ? 'invitation_high_english' : 'invitation_standard';
                                            return (
                                                <button
                                                    key={item.tag}
                                                    type="button"
                                                    onClick={() => insertVariable(item.tag, target)}
                                                    className={chipCls(isPresent)}
                                                    title={`${item.label} — click to insert ${item.tag}`}
                                                >
                                                    {isPresent ? <Check size={11} /> : <Plus size={11} className="text-muted" />}
                                                    {item.tag}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div className={`${quillWrapCls} [&_.ql-editor]:min-h-[250px] [&_.ql-editor]:max-h-[500px]`}>
                                        <ReactQuill
                                            key={inviteTemplateTab}
                                            theme="snow"
                                            value={inviteTemplateTab === 'high_english' ? config.htmlEmailTemplate : (config.htmlEmailTemplateStandard || '')}
                                            onChange={(content, _delta, source) => {
                                                const update = source === 'user' ? editConfig : setLocalConfig;
                                                if (inviteTemplateTab === 'high_english') {
                                                    if (content !== config.htmlEmailTemplate) {
                                                        update(prev => ({ ...prev, htmlEmailTemplate: content }));
                                                    }
                                                } else {
                                                    if (content !== config.htmlEmailTemplateStandard) {
                                                        update(prev => ({ ...prev, htmlEmailTemplateStandard: content }));
                                                    }
                                                }
                                            }}
                                            modules={quillModules}
                                        />
                                    </div>
                                </div>

                                {inviteTemplateTab === 'high_english'
                                    ? validNote(isValidHighEnglishTemplate, 'Confirmation button/link tag is valid and configured.', <><strong>Warning:</strong> High English template must include confirmation tag (<code>{'{confirmationButton}'}</code> or <code>{'{confirmationLink}'}</code>).</>)
                                    : validNote(isValidStandardTemplate, 'Confirmation button/link tag is valid and configured.', <><strong>Warning:</strong> Standard Course template must include confirmation tag (<code>{'{confirmationButton}'}</code> or <code>{'{confirmationLink}'}</code>).</>)}
                            </div>

                            {showPreview && (
                                <div className="space-y-3 animate-fadeIn flex flex-col min-w-0 2xl:sticky 2xl:top-6">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className={eyebrowCls}>Live preview · {inviteTemplateTab === 'high_english' ? 'High English' : 'Standard'}</span>
                                        <label className="flex items-center gap-2 text-xs text-muted cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={previewMultiDate}
                                                onChange={e => setPreviewMultiDate(e.target.checked)}
                                                className="rounded border-border-strong accent-brand-500"
                                            />
                                            Multi-date invitation
                                        </label>
                                    </div>
                                    <div className={`${panelCls} p-3 flex-1 flex flex-col`}>
                                        <div className="text-xs text-muted px-1 pb-2.5 mb-3 border-b border-border-subtle">
                                            <span className="font-semibold">Subject: </span>
                                            <span className="text-primary font-medium">{previewSubject}</span>
                                        </div>
                                        <iframe
                                            srcDoc={previewBody}
                                            title="Email Invitation Preview"
                                            className="w-full flex-1 min-h-[500px] max-h-[600px] border border-border-subtle rounded-lg bg-[#f4f7f6]"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* ═══ Outcomes Survey Email ═══ */}
                    <Card
                        id="settings-survey"
                        className="scroll-mt-20"
                        title="Outcomes survey email"
                        subtitle="Sent to graduates and external lists (e.g. Action 11) for employment tracking"
                        icon={Briefcase}
                        tone="completed"
                        divided
                        action={
                            <div className="hidden sm:flex items-center gap-2">
                                <Segmented<StatusEmailAudience>
                                    ariaLabel="Survey audience"
                                    value={statusAudience}
                                    onChange={setStatusAudience}
                                    options={[
                                        { value: 'graduates', label: 'CRM graduates' },
                                        { value: 'outreach', label: 'External lists' },
                                    ]}
                                />
                                <Button variant="ghost" size="sm" onClick={() => setShowStatusPreview(!showStatusPreview)}>
                                    {showStatusPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                                    {showStatusPreview ? 'Hide preview' : 'Preview'}
                                </Button>
                            </div>
                        }
                    >
                        <div className="sm:hidden mb-4 flex items-center justify-between gap-2">
                            <Segmented<StatusEmailAudience>
                                ariaLabel="Survey audience"
                                value={statusAudience}
                                onChange={setStatusAudience}
                                options={[
                                    { value: 'graduates', label: 'CRM graduates' },
                                    { value: 'outreach', label: 'External lists' },
                                ]}
                            />
                            <IconButton label={showStatusPreview ? 'Hide preview' : 'Show preview'} onClick={() => setShowStatusPreview(!showStatusPreview)}>
                                {showStatusPreview ? <EyeOff size={16} /> : <Eye size={16} />}
                            </IconButton>
                        </div>
                        <div className={`grid grid-cols-1 ${showStatusPreview ? '2xl:grid-cols-2 items-start' : ''} gap-6`}>
                            <div className="space-y-5 min-w-0">
                                <div>
                                    <label htmlFor="survey-subject" className={labelCls}>Email subject</label>
                                    <input
                                        id="survey-subject"
                                        type="text"
                                        value={config[statusSubjectKey]}
                                        onChange={e => editConfig(prev => ({ ...prev, [statusSubjectKey]: e.target.value }))}
                                        className={`${inputCls} h-10`}
                                        placeholder="e.g. Quick Status Update — How are things going?"
                                    />
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className={labelCls + ' !mb-0'}>Email body</span>
                                        <span className="text-[11px] text-muted">Click a tag to insert it</span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                        {[
                                            { tag: '{statusDetails}', label: 'Questions Card' },
                                            { tag: '{statusButton}', label: 'Status Button' },
                                            { tag: '{statusLink}', label: 'Status Link' },
                                        ].map(item => {
                                            const isPresent = config[statusTemplateKey].includes(item.tag);
                                            return (
                                                <button
                                                    key={item.tag}
                                                    type="button"
                                                    onClick={() => insertVariable(item.tag, statusAudience === 'outreach' ? 'outreach' : 'status')}
                                                    className={chipCls(isPresent)}
                                                    title={`${item.label} — click to insert ${item.tag}`}
                                                >
                                                    {isPresent ? <Check size={11} /> : <Plus size={11} className="text-muted" />}
                                                    {item.tag}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div className={`${quillWrapCls} [&_.ql-editor]:min-h-[200px] [&_.ql-editor]:max-h-[400px]`}>
                                        <ReactQuill
                                            key={statusAudience}
                                            theme="snow"
                                            value={config[statusTemplateKey]}
                                            onChange={(content, _delta, source) => {
                                                if (content !== config[statusTemplateKey]) {
                                                    (source === 'user' ? editConfig : setLocalConfig)(prev => ({ ...prev, [statusTemplateKey]: content }));
                                                }
                                            }}
                                            modules={quillModules}
                                        />
                                    </div>
                                </div>

                                {validNote(isValidCurrentStatusTemplate, 'Survey button/link tag is valid and configured.', <><strong>Warning:</strong> Template must include at least one status tag (<code>{'{statusButton}'}</code> or <code>{'{statusLink}'}</code>).</>)}
                            </div>

                            {showStatusPreview && (
                                <div className="space-y-3 animate-fadeIn flex flex-col min-w-0 2xl:sticky 2xl:top-6">
                                    <span className={eyebrowCls}>Live preview</span>
                                    <div className={`${panelCls} p-3 flex-1 flex flex-col`}>
                                        <div className="text-xs text-muted px-1 pb-2.5 mb-3 border-b border-border-subtle">
                                            <span className="font-semibold">Subject: </span>
                                            <span className="text-primary font-medium">{config[statusSubjectKey]}</span>
                                        </div>
                                        <iframe
                                            srcDoc={statusPreviewBody}
                                            title="Status Survey Preview"
                                            className="w-full flex-1 min-h-[500px] max-h-[500px] border border-border-subtle rounded-lg bg-[#f4f7f6]"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* ═══ Unsubscribed emails ═══ */}
                    <div id="settings-unsubscribes" className="scroll-mt-20">
                        <EmailOptOutSection />
                    </div>

                    {/* ═══ Duplicate Profiles Scanner ═══ */}
                    <Card
                        id="settings-duplicates"
                        className="scroll-mt-20"
                        title="Duplicate profiles"
                        subtitle="Find students sharing an email address or with very similar details"
                        icon={GitMerge}
                        tone="warning"
                        divided
                        action={
                            <Button variant="secondary" size="sm" onClick={runDuplicateScan} loading={scanning}>
                                {!scanning && <Search size={13} />}
                                {scanning ? 'Scanning…' : hasScanned ? 'Scan again' : 'Scan for duplicates'}
                            </Button>
                        }
                    >
                        {scanning && (
                            <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted animate-fadeIn">
                                <Loader2 size={24} className="animate-spin text-brand-500" />
                                <p className="text-xs font-medium">Scanning all student profiles…</p>
                            </div>
                        )}

                        {!scanning && !hasScanned && (
                            <EmptyState
                                bare
                                className="!py-6"
                                icon={<GitMerge size={20} />}
                                title="No scan run yet"
                                description='Click "Scan for duplicates" to search for redundant profiles.'
                            />
                        )}

                        {!scanning && hasScanned && duplicateGroups.length === 0 && potentialMatches.length === 0 && (
                            <div className={`${calloutCls.success} flex items-center gap-2 p-3 text-xs font-semibold`}>
                                <CheckCircle2 size={15} className="text-status-confirmed flex-shrink-0" />
                                No duplicates or profile updates found — everything is clean.
                            </div>
                        )}

                        {!scanning && duplicateGroups.length > 0 && (
                            <div className="space-y-3">
                                <div className={`${calloutCls.warning} flex items-center gap-2 p-3 text-xs font-medium`}>
                                    <AlertTriangle size={14} className="flex-shrink-0 text-status-requested" />
                                    <span>Found {duplicateGroups.length} group(s) of students sharing the same email address. Review and merge them below:</span>
                                </div>
                                <div className="divide-y divide-border-subtle border border-border-subtle rounded-xl overflow-hidden">
                                    {duplicateGroups.map((group) => (
                                        <div key={group.key} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-surface-elevated/40 transition-colors">
                                            <div className="space-y-2 min-w-0">
                                                <Badge tone="brand" className="font-mono">{group.key}</Badge>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                                                    {group.students.map((s) => (
                                                        <div key={s.id} className="text-xs text-primary font-medium flex items-center gap-2">
                                                            <span className="w-1.5 h-1.5 bg-brand-500 rounded-full flex-shrink-0" />
                                                            <span>{s.first_name} {s.last_name}</span>
                                                            {s.phone && <span className="text-muted text-[11px]">({s.phone})</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 self-start sm:self-center flex-shrink-0">
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    loading={markingNonDuplicates === group.key}
                                                    disabled={scanning}
                                                    onClick={() => markGroupAsNonDuplicates(group.key, group.students)}
                                                >
                                                    {markingNonDuplicates !== group.key && <Check size={13} />}
                                                    Not Duplicates
                                                </Button>
                                                <Button
                                                    variant="brand-soft"
                                                    size="sm"
                                                    onClick={() => {
                                                        setSelectedStudentForMerge(group.students[0]);
                                                        setTargetStudentForMerge(group.students[1]);
                                                        setMergeModalOpen(true);
                                                    }}
                                                >
                                                    <GitMerge size={13} />
                                                    Review & Merge
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {!scanning && potentialMatches.length > 0 && (
                            <div className={`space-y-3 ${duplicateGroups.length > 0 ? 'mt-6' : ''}`}>
                                <div className={`${calloutCls.info} flex items-center gap-2 p-3 text-xs font-medium`}>
                                    <Info size={14} className="flex-shrink-0 text-status-invited" />
                                    <span>Found {potentialMatches.length} potential profile update(s) (similar name, but different details). Review them below:</span>
                                </div>
                                <div className="divide-y divide-border-subtle border border-border-subtle rounded-xl overflow-hidden">
                                    {potentialMatches.map((match) => {
                                        const pairKey = [match.studentA.id, match.studentB.id].sort().join('_');
                                        return (
                                            <div key={pairKey} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-surface-elevated/40 transition-colors">
                                                <div className="space-y-2 min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <Badge tone="brand">Potential match</Badge>
                                                        <Badge tone="warning">{match.reason}</Badge>
                                                    </div>
                                                    <div className="flex flex-col gap-1.5">
                                                        {([['A', match.studentA, 'Older'], ['B', match.studentB, 'Newer']] as const).map(([label, st, age]) => (
                                                            <div key={label} className="text-xs text-primary flex flex-wrap items-center gap-1.5">
                                                                <span className="text-muted w-16 flex-shrink-0">Profile {label}:</span>
                                                                <span className="font-semibold">{st.first_name} {st.last_name}</span>
                                                                {st.phone && <span className="text-muted text-[11px]">({st.phone})</span>}
                                                                {st.email && <span className="text-muted text-[11px]">• {st.email}</span>}
                                                                {st.address && <span className="text-muted text-[11px]">• {st.address}</span>}
                                                                <Badge tone={age === 'Newer' ? 'brand' : 'neutral'}>({age})</Badge>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 self-start sm:self-center flex-shrink-0">
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        loading={markingNonDuplicates === pairKey}
                                                        disabled={scanning}
                                                        onClick={() => markPairAsNonDuplicates(match.studentA, match.studentB)}
                                                    >
                                                        {markingNonDuplicates !== pairKey && <Check size={13} />}
                                                        Not Duplicates
                                                    </Button>
                                                    <Button
                                                        variant="brand-soft"
                                                        size="sm"
                                                        onClick={() => {
                                                            setSelectedStudentForMerge(match.studentA);
                                                            setTargetStudentForMerge(match.studentB);
                                                            setMergeModalOpen(true);
                                                        }}
                                                    >
                                                        <GitMerge size={13} />
                                                        Review & Merge
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

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
                    </Card>

                    {/* ═══ General Preferences ═══ */}
                    <Card
                        id="settings-preferences"
                        className="scroll-mt-20"
                        title="Preferences"
                        subtitle="Email branding and interface density"
                        icon={SlidersHorizontal}
                        tone="success"
                        divided
                        bodyClassName="!p-0"
                    >
                        <div className="divide-y divide-border-subtle">
                            <label className="flex items-center justify-between gap-4 px-4 sm:px-5 py-4 cursor-pointer">
                                <div className="min-w-0">
                                    <span className="block text-[13px] font-semibold text-primary">Include logos in emails</span>
                                    <span className="block text-xs text-muted mt-0.5">Show the Cork City Partnership logo banner at the top of all emails.</span>
                                </div>
                                <span className="relative flex items-center flex-shrink-0">
                                    <input
                                        type="checkbox"
                                        checked={config.includeLogosInEmails ?? false}
                                        onChange={e => editConfig(prev => ({ ...prev, includeLogosInEmails: e.target.checked }))}
                                        className="peer sr-only"
                                    />
                                    <span className="w-10 h-6 bg-border-strong rounded-full peer-checked:bg-brand-500 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40" />
                                    <span className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full peer-checked:translate-x-4 transition-transform shadow-sm" />
                                </span>
                            </label>

                            <div className="px-4 sm:px-5 py-4">
                                <span className="block text-[13px] font-semibold text-primary">Interface density</span>
                                <span className="block text-xs text-muted mt-0.5 mb-3">Choose the layout density that best fits your screen and workflow.</span>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
                                    {([
                                        { value: 'comfortable', label: 'Comfortable', desc: 'Spacious cards and comfortable padding for standard displays.', Icon: Rows3 },
                                        { value: 'compact', label: 'Compact', desc: 'Tighter rows and smaller padding to see more data at once.', Icon: Rows4 },
                                    ] as const).map(opt => {
                                        const active = density === opt.value;
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                aria-pressed={active}
                                                onClick={() => {
                                                    document.documentElement.classList.toggle('density-compact', opt.value === 'compact');
                                                    window.localStorage.setItem('view_density', opt.value);
                                                    setDensity(opt.value);
                                                    window.dispatchEvent(new CustomEvent('densitychange', { detail: opt.value }));
                                                }}
                                                className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-colors ${
                                                    active
                                                        ? 'bg-brand-500/[0.06] border-brand-500 ring-1 ring-brand-500'
                                                        : 'bg-surface border-border-subtle hover:border-border-strong'
                                                }`}
                                            >
                                                <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${active ? 'bg-brand-500 text-white' : 'bg-surface-elevated text-muted'}`}>
                                                    <opt.Icon size={16} />
                                                </span>
                                                <span>
                                                    <span className="block text-xs font-semibold text-primary">
                                                        {opt.label}{opt.value === 'comfortable' && <span className="text-muted font-normal"> (default)</span>}
                                                    </span>
                                                    <span className="block text-[11px] text-muted mt-0.5">{opt.desc}</span>
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* ═══ Users & Roles ═══ */}
                    <div id="settings-users" className="scroll-mt-20">
                        <UserRolesSection />
                    </div>

                    <div className="lg:hidden flex items-center justify-between gap-3 text-xs text-muted px-1">
                        <span className="flex items-center gap-1.5"><Info size={12} /> Settings persist across sessions.</span>
                        <Button variant="ghost" size="sm" onClick={handleReset}>
                            <RotateCcw size={13} />
                            Reset to defaults
                        </Button>
                    </div>

                    {/* Save bar */}
                    {(hasChanges || saved) && (
                        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+5rem)] lg:bottom-5 z-20 animate-slideUp">
                            <div className="flex items-center justify-between gap-3 pl-4 pr-2 py-2 rounded-2xl bg-surface border border-border-subtle shadow-float">
                                <div className="flex items-center gap-2 text-[13px] min-w-0">
                                    {saved && !hasChanges ? (
                                        <>
                                            <CheckCircle2 size={16} className="text-status-confirmed flex-shrink-0" />
                                            <span className="font-semibold text-primary">Changes saved</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="w-2 h-2 rounded-full bg-warning flex-shrink-0" />
                                            <span className="font-semibold text-primary">Unsaved changes</span>
                                            <span className="hidden sm:inline text-muted truncate">
                                                {canSave ? '· Ctrl+S to save' : '· fix the template warnings to save'}
                                            </span>
                                        </>
                                    )}
                                </div>
                                <Button variant="primary" onClick={handleSave} disabled={!canSave}>
                                    <Save size={14} />
                                    Save changes
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
