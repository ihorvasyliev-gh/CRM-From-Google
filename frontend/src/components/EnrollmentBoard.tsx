import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
    CheckCircle, Clock, Send, Search, Copy, Calendar,
    Filter, Check, X, Plus, Trash2, ChevronDown, GraduationCap,
    MoreHorizontal, ArrowRight, LogOut, Ban, Globe, Mail, Star, FileText, Pencil, ArrowUpDown, FileArchive, Loader2
} from 'lucide-react';
import { generateDocumentsArchive } from '../lib/documentUtils';
import EnrollmentModal from './EnrollmentModal';
import ConfirmDialog from './ConfirmDialog';
import Toast, { ToastData } from './Toast';

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
    is_priority: boolean; // Added priority field
    created_at: string;
    students: Student | null;
    courses: Course | null;
}

// ─── Constants ──────────────────────────────────────────────
const PIPELINE_STATUSES = ['requested', 'invited', 'confirmed', 'completed'] as const;
const SECONDARY_STATUSES = ['withdrawn', 'rejected'] as const;
const ALL_STATUSES = [...PIPELINE_STATUSES, ...SECONDARY_STATUSES] as const;

const STATUS_CONFIG: Record<string, {
    label: string;
    icon: React.ReactNode;
    color: string;
    bg: string;
    border: string;
    pillBg: string;
    gradient: string;
}> = {
    requested: {
        label: 'Requested',
        icon: <Clock size={14} />,
        color: 'text-warning',
        bg: 'bg-warning/10',
        border: 'border-warning/20',
        pillBg: 'bg-warning/20 text-warning',
        gradient: 'from-warning to-amber-500',
    },
    invited: {
        label: 'Invited',
        icon: <Send size={14} />,
        color: 'text-info',
        bg: 'bg-info/10',
        border: 'border-info/20',
        pillBg: 'bg-info/20 text-info',
        gradient: 'from-info to-blue-500',
    },
    confirmed: {
        label: 'Confirmed',
        icon: <CheckCircle size={14} />,
        color: 'text-success',
        bg: 'bg-success/10',
        border: 'border-success/20',
        pillBg: 'bg-success/20 text-success',
        gradient: 'from-success to-emerald-500',
    },
    completed: {
        label: 'Completed',
        icon: <GraduationCap size={14} />,
        color: 'text-brand-500',
        bg: 'bg-brand-500/10',
        border: 'border-brand-500/20',
        pillBg: 'bg-brand-500/20 text-brand-500',
        gradient: 'from-brand-500 to-brand-400',
    },
    withdrawn: {
        label: 'Withdrawn',
        icon: <LogOut size={14} />,
        color: 'text-muted',
        bg: 'bg-muted/10',
        border: 'border-muted/20',
        pillBg: 'bg-muted/20 text-muted',
        gradient: 'from-muted to-surface-500',
    },
    rejected: {
        label: 'Rejected',
        icon: <Ban size={14} />,
        color: 'text-danger',
        bg: 'bg-danger/10',
        border: 'border-danger/20',
        pillBg: 'bg-danger/20 text-danger',
        gradient: 'from-danger to-red-500',
    },
};

// ─── Helpers ────────────────────────────────────────────────
function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-IE', {
        day: '2-digit', month: 'short', year: 'numeric',
    });
}

function formatShortDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-IE', {
        day: 'numeric', month: 'short',
    });
}

function copyToClipboard(text: string): Promise<void> {
    return navigator.clipboard.writeText(text);
}

function collectEmails(enrollments: Enrollment[]): string {
    const emails = enrollments
        .map(e => e.students?.email)
        .filter((email): email is string => !!email && email.trim() !== '');
    return [...new Set(emails)].join('; ');
}

function getCoursePill(enrollment: Enrollment): string {
    const name = enrollment.courses?.name || 'Unknown';
    const variant = enrollment.course_variant?.trim();
    return variant ? `${name} (${variant})` : name;
}

function todayISO(): string {
    return new Date().toISOString().split('T')[0];
}

// ─── Component ──────────────────────────────────────────────
export default function EnrollmentBoard() {
    const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Filters
    const [selectedCourse, setSelectedCourse] = useState<string>('all');
    const [selectedVariant, setSelectedVariant] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [showSecondary, setShowSecondary] = useState(false);
    const [sortOrder, setSortOrder] = useState<'date-asc' | 'date-desc' | 'name'>('date-asc');

    // Modals
    const [enrollModalOpen, setEnrollModalOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Enrollment | null>(null);
    const [toast, setToast] = useState<ToastData | null>(null);

    // Confirm date picker
    const [confirmDateTarget, setConfirmDateTarget] = useState<{ ids: string[]; bulk: boolean } | null>(null);
    const [confirmDate, setConfirmDate] = useState(todayISO());

    // Invite date picker
    const [inviteDateTarget, setInviteDateTarget] = useState<{ ids: string[]; bulk: boolean } | null>(null);
    const [inviteDate, setInviteDate] = useState(todayISO());
    const [savedInviteDates, setSavedInviteDates] = useState<string[]>([]);

    // Action menu
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Edit Note
    const [editNoteTarget, setEditNoteTarget] = useState<{ id: string; note: string } | null>(null);
    const [editNoteText, setEditNoteText] = useState('');

    const [generatingDocs, setGeneratingDocs] = useState(false);

    async function handleGenerateDocuments() {
        if (selectedIds.size === 0) return;
        setGeneratingDocs(true);
        try {
            // Fetch the latest template
            const { data, error } = await supabase
                .from('document_templates')
                .select('*')
                .order('updated_at', { ascending: false })
                .limit(1);

            if (error || !data || data.length === 0) {
                throw new Error('No template uploaded. Please upload a template in Document Generator first.');
            }

            const template = data[0];
            const selectedEnrollments = enrollments.filter(e => selectedIds.has(e.id));

            await generateDocumentsArchive(
                selectedEnrollments,
                template.storage_path,
                'Selected_Enrollments_Documents.zip'
            );

            showToast(`Generated ${selectedEnrollments.length} document(s)!`, 'success');
            clearSelection();
        } catch (err: any) {
            console.error('Generation error:', err);
            showToast(`Generation failed: ${err.message}`, 'error');
        } finally {
            setGeneratingDocs(false);
        }
    }

    const showToast = useCallback((message: string, type: 'success' | 'error') => {
        setToast({ message, type });
    }, []);

    // Close menu on click outside
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpenMenuId(null);
            }
        }
        if (openMenuId) document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [openMenuId]);

    // ─── Data Fetching ──────────────────────────────────────
    useEffect(() => {
        fetchEnrollments();
    }, []);

    async function fetchEnrollments() {
        const { data } = await supabase
            .from('enrollments')
            .select('*, students(id, first_name, last_name, email, phone, address, eircode, dob), courses(id, name)')
            .order('created_at', { ascending: false });
        if (data) setEnrollments(data as Enrollment[]);
    }

    // ─── Fetch Saved Course Dates ────────────────────────────
    async function fetchCourseDates(courseId: string) {
        const today = todayISO();
        const { data } = await supabase
            .from('invite_dates')
            .select('invite_date')
            .eq('course_id', courseId)
            .gte('invite_date', today)
            .order('invite_date', { ascending: true });
        setSavedInviteDates(data ? data.map((d: { invite_date: string }) => d.invite_date) : []);
    }

    // ─── Open Invite Modal ──────────────────────────────────
    function openInviteModal(ids: string[], bulk: boolean) {
        setInviteDateTarget({ ids, bulk });
        setInviteDate(todayISO());
        // Determine course_id from first selected enrollment
        const first = enrollments.find(e => ids.includes(e.id));
        if (first) fetchCourseDates(first.course_id);
    }

    // ─── Invite Helpers ─────────────────────────────────────
    async function performInvite(ids: string[], date: string) {
        // 1. Upsert the date into invite_dates
        const first = enrollments.find(e => ids.includes(e.id));
        if (first) {
            await supabase.from('invite_dates').upsert(
                { course_id: first.course_id, invite_date: date },
                { onConflict: 'course_id,invite_date' }
            );
        }
        // 2. Update enrollments
        const updatePayload = { status: 'invited', invited_date: date, confirmed_date: null };
        const { error } = await supabase
            .from('enrollments')
            .update(updatePayload)
            .in('id', ids);
        if (!error) {
            setEnrollments(prev => prev.map(e =>
                ids.includes(e.id) ? { ...e, ...updatePayload } : e
            ));
            setSelectedIds(prev => {
                const next = new Set(prev);
                ids.forEach(id => next.delete(id));
                return next;
            });
            showToast(`${ids.length} enrollment(s) → invited`, 'success');
        } else {
            showToast('Error updating status', 'error');
        }
    }

    async function handleInviteWithDate() {
        if (!inviteDateTarget) return;
        await performInvite(inviteDateTarget.ids, inviteDate);
        setInviteDateTarget(null);
    }

    async function handleInviteAndEmail() {
        if (!inviteDateTarget) return;
        const ids = inviteDateTarget.ids;
        const selectedEnrollments = enrollments.filter(e => ids.includes(e.id));
        await performInvite(ids, inviteDate);

        // Build mailto
        const emails = selectedEnrollments
            .map(e => e.students?.email)
            .filter((email): email is string => !!email && email.trim() !== '');
        const uniqueEmails = [...new Set(emails)];
        const first = selectedEnrollments[0];
        const courseName = first ? getCoursePill(first) : 'Course';
        const dateFormatted = formatDate(inviteDate);
        const subject = encodeURIComponent(`${courseName} — ${dateFormatted}`);
        const bcc = uniqueEmails.map(e => encodeURIComponent(e)).join(',');
        window.open(`mailto:?bcc=${bcc}&subject=${subject}`, '_self');
        setInviteDateTarget(null);
    }

    // ─── Status Update ──────────────────────────────────────
    async function updateStatus(id: string, newStatus: string, confirmedDate?: string, invitedDate?: string) {
        const current = enrollments.find(e => e.id === id);
        if (newStatus === 'invited' && !invitedDate) {
            openInviteModal([id], false);
            return;
        }
        if (newStatus === 'confirmed' && !confirmedDate) {
            setConfirmDateTarget({ ids: [id], bulk: false });
            // Default to invited_date if available (and future/today?), otherwise today
            const defaultDate = current?.invited_date || todayISO();
            setConfirmDate(defaultDate);
            if (current) fetchCourseDates(current.course_id);
            return;
        }

        const updatePayload: Record<string, string | null> = { status: newStatus };
        if (newStatus === 'confirmed' && confirmedDate) {
            updatePayload.confirmed_date = confirmedDate;
        }
        if (newStatus === 'invited' && invitedDate) {
            updatePayload.invited_date = invitedDate;
        }
        // Only clear dates when moving back to early statuses (requested/rejected).
        // Completed/withdrawn preserve historical confirmed_date and invited_date.
        if (newStatus === 'requested' || newStatus === 'rejected') {
            updatePayload.confirmed_date = null;
            updatePayload.invited_date = null;
        }

        // For completed/withdrawn, update ALL variants
        if (newStatus === 'completed' || newStatus === 'withdrawn') {
            const currentEnrollment = enrollments.find(e => e.id === id);
            if (!currentEnrollment) return;

            const relatedIds = enrollments
                .filter(e => e.student_id === currentEnrollment.student_id && e.course_id === currentEnrollment.course_id)
                .map(e => e.id);

            const { error } = await supabase
                .from('enrollments')
                .update(updatePayload)
                .in('id', relatedIds);

            if (!error) {
                setEnrollments(prev => prev.map(e =>
                    relatedIds.includes(e.id) ? { ...e, status: newStatus, confirmed_date: updatePayload.confirmed_date ?? null, invited_date: updatePayload.invited_date ?? null } : e
                ));
                showToast(`Updated ${relatedIds.length} related enrollment(s)`, 'success');
            } else {
                showToast('Error updating status', 'error');
            }
        } else {
            const { error } = await supabase.from('enrollments').update(updatePayload).eq('id', id);
            if (!error) {
                setEnrollments(prev => prev.map(e =>
                    e.id === id ? { ...e, status: newStatus, confirmed_date: updatePayload.confirmed_date ?? null, invited_date: updatePayload.invited_date ?? null } : e
                ));
            } else {
                showToast('Error updating status', 'error');
            }
        }
        setOpenMenuId(null);
    }

    // ─── Bulk Update ────────────────────────────────────────
    async function bulkUpdateStatus(newStatus: string, confirmedDate?: string) {
        if (selectedIds.size === 0) return;

        if (newStatus === 'invited') {
            openInviteModal(Array.from(selectedIds), true);
            return;
        }

        if (newStatus === 'confirmed' && !confirmedDate) {
            const ids = Array.from(selectedIds);
            setConfirmDateTarget({ ids, bulk: true });

            // Try to find a common invited_date or just default to today
            const firstId = ids[0];
            const first = enrollments.find(e => e.id === firstId);
            const defaultDate = first?.invited_date || todayISO();
            setConfirmDate(defaultDate);

            if (first) fetchCourseDates(first.course_id);
            return;
        }

        let idsToUpdate = Array.from(selectedIds);
        const updatePayload: Record<string, string | null> = { status: newStatus };
        if (newStatus === 'confirmed' && confirmedDate) {
            updatePayload.confirmed_date = confirmedDate;
        }
        if (newStatus !== 'confirmed') {
            updatePayload.confirmed_date = null;
        }
        if (newStatus !== 'invited') {
            updatePayload.invited_date = null;
        }

        if (newStatus === 'completed' || newStatus === 'withdrawn') {
            const selectedEnrollments = enrollments.filter(e => selectedIds.has(e.id));
            const extraIds: string[] = [];
            selectedEnrollments.forEach(curr => {
                enrollments.filter(e =>
                    e.student_id === curr.student_id &&
                    e.course_id === curr.course_id &&
                    !selectedIds.has(e.id)
                ).forEach(r => extraIds.push(r.id));
            });
            idsToUpdate = [...idsToUpdate, ...extraIds];
        }

        const { error } = await supabase
            .from('enrollments')
            .update(updatePayload)
            .in('id', idsToUpdate);

        if (!error) {
            setEnrollments(prev => prev.map(e =>
                idsToUpdate.includes(e.id)
                    ? { ...e, status: newStatus, confirmed_date: updatePayload.confirmed_date ?? null, invited_date: updatePayload.invited_date ?? null }
                    : e
            ));
            setSelectedIds(new Set());
            showToast(`${idsToUpdate.length} enrollment(s) → ${newStatus}`, 'success');
        } else {
            showToast('Error updating status', 'error');
        }
    }

    // ─── Confirm Date Handler ───────────────────────────────
    async function handleConfirmWithDate() {
        if (!confirmDateTarget) return;

        // Also save this date as a "Course Date" if it's new, similar to invite logic?
        // Logic: If I confirm for a date, it's likely a valid course date.
        // But let's stick to reading from invite_dates for now, unless we want to upsert here too?
        // User asked to "connect logic", so it makes sense to Upsert too potentially?
        // Let's keep it simple: Just update status. IF the user picked a date, they picked it.
        // Actually, if they pick a NEW date here, we probably SHOULD save it so it appears next time?
        // Let's add the upsert logic here too for consistency.

        const firstId = confirmDateTarget.ids[0];
        const first = enrollments.find(e => e.id === firstId);
        if (first && confirmDate) {
            await supabase.from('invite_dates').upsert(
                { course_id: first.course_id, invite_date: confirmDate },
                { onConflict: 'course_id,invite_date' }
            );
        }

        if (confirmDateTarget.bulk) {
            await bulkUpdateStatus('confirmed', confirmDate);
        } else {
            await updateStatus(confirmDateTarget.ids[0], 'confirmed', confirmDate);
        }
        setConfirmDateTarget(null);
    }

    async function togglePriority(id: string, currentPriority: boolean) {
        const newPriority = !currentPriority;
        const { error } = await supabase
            .from('enrollments')
            .update({ is_priority: newPriority })
            .eq('id', id);

        if (!error) {
            setEnrollments(prev => prev.map(e =>
                e.id === id ? { ...e, is_priority: newPriority } : e
            ));
        } else {
            showToast('Failed to update priority', 'error');
        }
    }

    // ─── Notes ──────────────────────────────────────────────
    function openEditNote(enrollment: Enrollment) {
        setEditNoteTarget({ id: enrollment.id, note: enrollment.notes || '' });
        setEditNoteText(enrollment.notes || '');
        setOpenMenuId(null);
    }

    async function saveNote() {
        if (!editNoteTarget) return;

        const { error } = await supabase
            .from('enrollments')
            .update({ notes: editNoteText })
            .eq('id', editNoteTarget.id);

        if (!error) {
            setEnrollments(prev => prev.map(e =>
                e.id === editNoteTarget.id ? { ...e, notes: editNoteText } : e
            ));
            showToast('Note updated', 'success');
        } else {
            showToast('Failed to update note', 'error');
        }
        setEditNoteTarget(null);
    }

    // ─── Delete ─────────────────────────────────────────────
    async function handleDeleteEnrollment() {
        if (!deleteTarget) return;
        const { error } = await supabase.from('enrollments').delete().eq('id', deleteTarget.id);
        if (!error) {
            setEnrollments(prev => prev.filter(e => e.id !== deleteTarget.id));
            setSelectedIds(prev => {
                const next = new Set(prev);
                next.delete(deleteTarget.id);
                return next;
            });
            showToast('Enrollment deleted', 'success');
        } else {
            showToast('Failed to delete enrollment', 'error');
        }
        setDeleteTarget(null);
    }

    // ─── Filtering ──────────────────────────────────────────
    const filteredEnrollments = useMemo(() => {
        let result = enrollments;
        if (selectedCourse !== 'all') result = result.filter(e => e.course_id === selectedCourse);
        if (selectedVariant !== 'all') {
            result = result.filter(e => (e.course_variant || '').trim().toLowerCase() === selectedVariant.toLowerCase());
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(e => {
                const name = `${e.students?.first_name || ''} ${e.students?.last_name || ''}`.toLowerCase();
                const email = (e.students?.email || '').toLowerCase();
                const phone = (e.students?.phone || '').toLowerCase();
                const notes = (e.notes || '').toLowerCase();
                return name.includes(q) || email.includes(q) || phone.includes(q) || notes.includes(q);
            });
        }
        if (dateFrom) {
            const from = new Date(dateFrom);
            result = result.filter(e => new Date(e.created_at) >= from);
        }
        if (dateTo) {
            const to = new Date(dateTo);
            to.setSeconds(59, 999);
            result = result.filter(e => new Date(e.created_at) <= to);
        }
        return result;
    }, [enrollments, selectedCourse, selectedVariant, searchQuery, dateFrom, dateTo]);

    // ─── Group by Status ────────────────────────────────────
    const byStatus = useMemo(() => {
        const map: Record<string, Enrollment[]> = {};
        ALL_STATUSES.forEach(s => { map[s] = []; });
        filteredEnrollments.forEach(e => {
            if (map[e.status]) map[e.status].push(e);
            else map[e.status] = [e];
        });
        // Sort each group based on sortOrder
        Object.values(map).forEach(arr => {
            arr.sort((a, b) => {
                // Primary sort: Priority (true first)
                if (a.is_priority !== b.is_priority) {
                    return a.is_priority ? -1 : 1;
                }

                if (sortOrder === 'name') {
                    // Secondary sort: Name
                    const aName = `${a.students?.last_name || ''} ${a.students?.first_name || ''}`.toLowerCase();
                    const bName = `${b.students?.last_name || ''} ${b.students?.first_name || ''}`.toLowerCase();
                    return aName.localeCompare(bName);
                } else {
                    // Secondary sort: Date
                    const aDate = new Date(a.created_at).getTime();
                    const bDate = new Date(b.created_at).getTime();
                    return sortOrder === 'date-asc' ? aDate - bDate : bDate - aDate;
                }
            });
        });
        return map;
    }, [filteredEnrollments, sortOrder]);

    // ─── Status Counts (unfiltered) ─────────────────────────
    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        ALL_STATUSES.forEach(s => { counts[s] = 0; });
        enrollments.forEach(e => { counts[e.status] = (counts[e.status] || 0) + 1; });
        return counts;
    }, [enrollments]);

    // ─── Selection ──────────────────────────────────────────
    function toggleSelect(id: string) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function selectAllInColumn(status: string) {
        const items = byStatus[status] || [];
        const allSelected = items.every(e => selectedIds.has(e.id));
        setSelectedIds(prev => {
            const next = new Set(prev);
            items.forEach(e => {
                if (allSelected) next.delete(e.id);
                else next.add(e.id);
            });
            return next;
        });
    }

    function clearSelection() {
        setSelectedIds(new Set());
    }

    // ─── Copy ───────────────────────────────────────────────
    async function handleCopyEmails(items: Enrollment[], label: string) {
        const emailStr = collectEmails(items);
        if (!emailStr) { showToast('No emails to copy', 'error'); return; }
        await copyToClipboard(emailStr);
        showToast(`${label} emails copied!`, 'success');
    }

    async function handleCopySelectedEmails() {
        const selected = filteredEnrollments.filter(e => selectedIds.has(e.id));
        await handleCopyEmails(selected, `${selected.length}`);
    }

    // ─── Unique course list for chips ───────────────────────
    const uniqueCourses = useMemo(() => {
        const seen = new Map<string, string>();
        enrollments.forEach(e => {
            if (e.course_id && e.courses?.name && !seen.has(e.course_id)) {
                seen.set(e.course_id, e.courses.name);
            }
        });
        return Array.from(seen.entries())
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [enrollments]);

    // Unique language variants for the SELECTED course only (case-insensitive dedup)
    const uniqueVariants = useMemo(() => {
        if (selectedCourse === 'all') return [];
        const seen = new Map<string, string>();
        enrollments
            .filter(e => e.course_id === selectedCourse)
            .forEach(e => {
                const v = (e.course_variant || '').trim();
                if (v && !seen.has(v.toLowerCase())) {
                    seen.set(v.toLowerCase(), v.charAt(0).toUpperCase() + v.slice(1).toLowerCase());
                }
            });
        return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
    }, [enrollments, selectedCourse]);

    const hasFilters = searchQuery || selectedCourse !== 'all' || selectedVariant !== 'all' || dateFrom || dateTo;
    const selectedCount = selectedIds.size;
    const secondaryCount = (byStatus['withdrawn']?.length || 0) + (byStatus['rejected']?.length || 0);

    // ─── Render ─────────────────────────────────────────────
    return (
        <div className="space-y-4 pb-24">
            {/* ═══ Toolbar ═══ */}
            <div className="bg-surface rounded-2xl shadow-card border border-border-subtle p-4 space-y-3">
                {/* Row 1: Title + Search + Add */}
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-brand-500/10 rounded-xl text-brand-500 dark:text-brand-400">
                            <GraduationCap size={20} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-bold text-primary tracking-tight">Enrollments</h2>
                                <span className="text-xs font-mono font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2.5 py-0.5 rounded-full">
                                    {enrollments.length}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="relative flex-1 sm:w-72">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
                            <input
                                type="text"
                                placeholder="Search by name, email or phone..."
                                className="w-full pl-9 pr-8 py-2.5 bg-surface-elevated border border-border-strong rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 focus:bg-background transition-all placeholder:text-muted/60 text-primary"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                        <button
                            onClick={() => setEnrollModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-xl transition-all shadow-sm hover:shadow-brand-500/25 active:scale-[0.98] whitespace-nowrap"
                        >
                            <Plus size={16} /> Add
                        </button>
                    </div>
                </div>

                {/* Row 2: Course chips */}
                <div className="flex flex-wrap gap-2 items-center">
                    <button
                        onClick={() => setSelectedCourse('all')}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${selectedCourse === 'all'
                            ? 'bg-brand-500 text-white border-brand-500 shadow-sm'
                            : 'bg-surface-elevated text-muted border-border-strong hover:border-brand-500 hover:text-brand-500'
                            }`}
                    >
                        All Courses
                    </button>
                    {uniqueCourses.map(c => (
                        <button
                            key={c.id}
                            onClick={() => {
                                const newCourse = c.id === selectedCourse ? 'all' : c.id;
                                setSelectedCourse(newCourse);
                                setSelectedVariant('all');
                            }}
                            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${selectedCourse === c.id
                                ? 'bg-brand-500 text-white border-brand-500 shadow-sm'
                                : 'bg-surface-elevated text-muted border-border-strong hover:border-brand-500 hover:text-brand-500'
                                }`}
                        >
                            {c.name}
                        </button>
                    ))}
                </div>

                {/* Row 2b: Language chips — only when a specific course is selected */}
                {selectedCourse !== 'all' && uniqueVariants.length > 0 && (
                    <div className="flex flex-wrap gap-2 items-center">
                        <Globe size={14} className="text-muted mr-0.5" />
                        {uniqueVariants.length > 1 && (
                            <button
                                onClick={() => setSelectedVariant('all')}
                                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${selectedVariant === 'all'
                                    ? 'bg-violet-500 text-white border-violet-500 shadow-sm'
                                    : 'bg-surface-elevated text-muted border-border-strong hover:border-violet-500 hover:text-violet-500 dark:hover:text-violet-400'
                                    }`}
                            >
                                All Languages
                            </button>
                        )}
                        {uniqueVariants.map(v => (
                            <button
                                key={v}
                                onClick={() => setSelectedVariant(v === selectedVariant ? 'all' : v)}
                                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${selectedVariant === v
                                    ? 'bg-violet-500 text-white border-violet-500 shadow-sm'
                                    : 'bg-surface-elevated text-muted border-border-strong hover:border-violet-500 hover:text-violet-500 dark:hover:text-violet-400'
                                    }`}
                            >
                                {v}
                            </button>
                        ))}
                    </div>
                )}

                {/* Row 3: Date filter + Clear */}
                <div className="flex flex-wrap gap-2.5 items-center">
                    <div className="flex items-center gap-1.5 text-muted">
                        <Filter size={14} />
                        <span className="text-xs font-medium uppercase tracking-wider">Date:</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-surface-elevated border border-border-strong rounded-xl px-2.5 py-1">
                        <Calendar size={13} className="text-muted" />
                        <input
                            type="datetime-local"
                            className="bg-transparent text-sm outline-none py-0.5 text-primary"
                            value={dateFrom}
                            onChange={e => setDateFrom(e.target.value)}
                            title="From date and time"
                        />
                        <span className="text-muted/50 text-xs">—</span>
                        <input
                            type="datetime-local"
                            className="bg-transparent text-sm outline-none py-0.5 text-primary"
                            value={dateTo}
                            onChange={e => setDateTo(e.target.value)}
                            title="To date and time"
                        />
                    </div>
                    {hasFilters && (
                        <button
                            onClick={() => {
                                setSearchQuery('');
                                setSelectedCourse('all');
                                setSelectedVariant('all');
                                setDateFrom('');
                                setDateTo('');
                            }}
                            className="text-xs font-medium text-danger hover:text-danger/80 bg-danger/10 px-3 py-1.5 rounded-xl transition-all"
                        >
                            Clear filters
                        </button>
                    )}
                    <div className="h-4 w-px bg-border-strong mx-1 hidden sm:block"></div>
                    <button
                        onClick={() => {
                            setSortOrder((prev: 'date-asc' | 'date-desc' | 'name') => prev === 'date-asc' ? 'date-desc' : prev === 'date-desc' ? 'name' : 'date-asc');
                        }}
                        className="flex items-center gap-1.5 text-xs font-medium text-muted hover:text-primary transition-colors bg-surface-elevated px-2.5 py-1.5 rounded-xl border border-border-strong active:scale-95"
                        title="Toggle Sort Order"
                    >
                        <ArrowUpDown size={14} />
                        {sortOrder === 'date-asc' ? 'Oldest first' : sortOrder === 'date-desc' ? 'Newest first' : 'By Name'}
                    </button>
                    <span className="text-xs font-mono text-muted ml-auto font-medium tracking-wide">
                        {filteredEnrollments.length} <span className="opacity-50">/</span> {enrollments.length} enrollments
                    </span>
                </div>

                {/* Row 4: Status Summary Bar */}
                <div className="flex flex-wrap gap-2">
                    {ALL_STATUSES.map(status => {
                        const cfg = STATUS_CONFIG[status];
                        const count = statusCounts[status] || 0;
                        if (count === 0 && SECONDARY_STATUSES.includes(status as typeof SECONDARY_STATUSES[number])) return null;
                        return (
                            <div
                                key={status}
                                className={`inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase px-2.5 py-1.5 rounded-lg ${cfg.bg} ${cfg.color} ${cfg.border} border`}
                            >
                                {cfg.icon}
                                <span>{cfg.label}</span>
                                <span className="font-mono bg-background/50 px-1.5 py-0.5 rounded ml-0.5 shadow-sm">{count}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ═══ Kanban Pipeline ═══ */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {PIPELINE_STATUSES.map(status => {
                    const cfg = STATUS_CONFIG[status];
                    const items = byStatus[status] || [];
                    const allSelected = items.length > 0 && items.every(e => selectedIds.has(e.id));
                    const someSelected = items.some(e => selectedIds.has(e.id));

                    return (
                        <div key={status} className="flex flex-col bg-surface rounded-2xl shadow-card border border-border-subtle overflow-hidden">
                            {/* Column Header */}
                            <div className={`p-3.5 border-b-2 ${cfg.border} bg-surface-elevated/50`}>
                                <div className="flex items-center justify-between mb-1.5">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${cfg.gradient} shadow-sm`} />
                                        <h3 className="text-[13px] font-bold text-primary uppercase tracking-wider">{cfg.label}</h3>
                                        <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${cfg.pillBg} shadow-sm`}>
                                            {items.length}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {items.length > 0 && (
                                            <button
                                                onClick={() => handleCopyEmails(items, cfg.label)}
                                                className="p-1.5 text-muted hover:text-primary hover:bg-surface-elevated rounded-lg transition-colors"
                                                title={`Copy all ${cfg.label} emails`}
                                            >
                                                <Copy size={14} />
                                            </button>
                                        )}
                                        {items.length > 0 && (
                                            <button
                                                onClick={() => selectAllInColumn(status)}
                                                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${allSelected
                                                    ? 'bg-brand-500 border-brand-500 text-white shadow-sm'
                                                    : someSelected
                                                        ? 'bg-brand-500/20 border-brand-500/50 text-brand-500'
                                                        : 'border-border-strong hover:border-brand-500/50'
                                                    }`}
                                            >
                                                {(allSelected || someSelected) && <Check size={12} strokeWidth={3} />}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Cards */}
                            <div className="p-2 overflow-y-auto flex-1 space-y-2 bg-surface" style={{ maxHeight: '560px' }}>
                                {items.length === 0 && (
                                    <div className="text-center py-8 text-muted/60">
                                        <div className={`w-10 h-10 rounded-full ${cfg.bg} flex items-center justify-center mx-auto mb-2 ${cfg.color} opacity-40`}>
                                            {cfg.icon}
                                        </div>
                                        <p className="text-xs uppercase tracking-wider font-semibold">No enrollments</p>
                                    </div>
                                )}
                                {items.map(enrollment => {
                                    const isSelected = selectedIds.has(enrollment.id);
                                    const isMenuOpen = openMenuId === enrollment.id;

                                    return (
                                        <div
                                            key={enrollment.id}
                                            className={`group relative p-3 rounded-xl border transition-all cursor-pointer ${isSelected
                                                ? 'border-brand-400 bg-brand-500/5 shadow-sm ring-1 ring-brand-500/20'
                                                : 'border-border-strong bg-surface-elevated hover:shadow-card hover:border-brand-500/30'
                                                }`}
                                            onClick={() => toggleSelect(enrollment.id)}
                                            title={[
                                                enrollment.students?.email,
                                                enrollment.students?.phone,
                                            ].filter(Boolean).join(' • ') || undefined}
                                        >
                                            <div className="flex items-start gap-2.5">
                                                {/* Checkbox */}
                                                <div
                                                    className={`mt-0.5 w-[16px] h-[16px] rounded flex items-center justify-center flex-shrink-0 border-2 transition-all ${isSelected
                                                        ? 'bg-brand-500 border-brand-500 text-white shadow-sm'
                                                        : 'border-border-strong group-hover:border-brand-500/50 bg-background'
                                                        }`}
                                                >
                                                    {isSelected && <Check size={10} strokeWidth={3} />}
                                                </div>

                                                {/* Star Priority */}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        togglePriority(enrollment.id, !!enrollment.is_priority);
                                                    }}
                                                    className={`mt-0.5 p-0.5 rounded transition-all ${enrollment.is_priority
                                                        ? 'text-warning hover:text-warning/80 drop-shadow-sm'
                                                        : 'text-muted/40 hover:text-warning/60'
                                                        }`}
                                                    title={enrollment.is_priority ? "Remove priority" : "Mark as priority"}
                                                >
                                                    <Star size={16} fill={enrollment.is_priority ? "currentColor" : "none"} />
                                                </button>

                                                <div className="flex-1 min-w-0">
                                                    {/* Name + Actions */}
                                                    <div className="flex justify-between items-start">
                                                        <p className="font-semibold text-primary text-[13px] truncate leading-5 tracking-tight">
                                                            {enrollment.students?.first_name} {enrollment.students?.last_name}
                                                        </p>
                                                        {/* ⋯ Action Menu */}
                                                        <div className="relative" ref={isMenuOpen ? menuRef : null}>
                                                            <button
                                                                onClick={e => { e.stopPropagation(); setOpenMenuId(isMenuOpen ? null : enrollment.id); }}
                                                                className={`p-1 rounded-md transition-all ${isMenuOpen
                                                                    ? 'bg-surface-elevated text-primary shadow-sm ring-1 ring-border-strong'
                                                                    : 'text-muted hover:bg-surface hover:text-primary'
                                                                    }`}
                                                            >
                                                                <MoreHorizontal size={14} />
                                                            </button>

                                                            {isMenuOpen && (
                                                                <div className="absolute right-0 top-7 z-50 w-44 bg-surface-elevated rounded-xl shadow-lg border border-border-subtle py-1.5 animate-scaleIn origin-top-right">
                                                                    {ALL_STATUSES.filter(s => s !== status).map(s => {
                                                                        const sCfg = STATUS_CONFIG[s];
                                                                        return (
                                                                            <button
                                                                                key={s}
                                                                                onClick={e => { e.stopPropagation(); updateStatus(enrollment.id, s); }}
                                                                                className="w-full px-3 py-2 text-left text-xs font-medium flex items-center gap-2 hover:bg-surface transition-all"
                                                                            >
                                                                                <ArrowRight size={12} className="text-muted" />
                                                                                <span className={sCfg.color}>{sCfg.icon}</span>
                                                                                <span className="text-primary">Move to {sCfg.label}</span>
                                                                            </button>
                                                                        );
                                                                    })}
                                                                    <div className="border-t border-border-subtle my-1" />
                                                                    <button
                                                                        onClick={e => { e.stopPropagation(); openEditNote(enrollment); }}
                                                                        className="w-full px-3 py-2 text-left text-xs font-medium flex items-center gap-2 hover:bg-surface transition-all text-primary"
                                                                    >
                                                                        <Pencil size={12} className="text-muted" />
                                                                        Edit Note
                                                                    </button>
                                                                    <div className="border-t border-border-subtle my-1" />
                                                                    <button
                                                                        onClick={e => { e.stopPropagation(); setDeleteTarget(enrollment); setOpenMenuId(null); }}
                                                                        className="w-full px-3 py-2 text-left text-xs font-medium flex items-center gap-2 text-red-500 hover:bg-red-50 transition-all"
                                                                    >
                                                                        <Trash2 size={12} />
                                                                        Delete
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Course pill */}
                                                    <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full mt-1 ${cfg.pillBg}`}>
                                                        {getCoursePill(enrollment)}
                                                    </span>

                                                    {/* Info row */}
                                                    <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted">
                                                        <span>{formatShortDate(enrollment.created_at)}</span>
                                                        {enrollment.invited_date && (
                                                            <>
                                                                <span>•</span>
                                                                <span className="text-blue-600 font-medium flex items-center gap-0.5">
                                                                    <Send size={10} />
                                                                    {formatDate(enrollment.invited_date)}
                                                                </span>
                                                            </>
                                                        )}
                                                        {enrollment.confirmed_date && (
                                                            <>
                                                                <span>•</span>
                                                                <span className="text-emerald-600 font-medium flex items-center gap-0.5">
                                                                    <CheckCircle size={10} />
                                                                    {formatDate(enrollment.confirmed_date)}
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>

                                                    {/* Notes */}
                                                    {enrollment.notes && (
                                                        <p className="text-[11px] text-muted italic mt-1 bg-surface px-2 py-1 rounded-md truncate">
                                                            📝 {enrollment.notes}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ═══ Secondary Statuses (Withdrawn / Rejected) ═══ */}
            {secondaryCount > 0 && (
                <div>
                    <button
                        onClick={() => setShowSecondary(!showSecondary)}
                        className="flex items-center gap-2 text-sm font-medium text-muted hover:text-primary transition-all mb-3"
                    >
                        <ChevronDown size={16} className={`transition-transform ${showSecondary ? 'rotate-180' : ''}`} />
                        Withdrawn & Rejected ({secondaryCount})
                    </button>

                    {showSecondary && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-slideDown">
                            {SECONDARY_STATUSES.map(status => {
                                const cfg = STATUS_CONFIG[status];
                                const items = byStatus[status] || [];
                                if (items.length === 0) return null;

                                return (
                                    <div key={status} className="bg-surface-elevated rounded-2xl shadow-card border border-border-subtle overflow-hidden opacity-75">
                                        <div className={`p-3 border-b ${cfg.border} ${cfg.bg}`}>
                                            <div className="flex items-center gap-2">
                                                <span className={cfg.color}>{cfg.icon}</span>
                                                <h3 className="text-sm font-bold text-primary">{cfg.label}</h3>
                                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${cfg.pillBg}`}>
                                                    {items.length}
                                                </span>
                                                <button
                                                    onClick={() => handleCopyEmails(items, cfg.label)}
                                                    className="ml-auto p-1.5 text-muted hover:text-muted hover:bg-surface-100 rounded-lg transition-all"
                                                    title={`Copy ${cfg.label} emails`}
                                                >
                                                    <Copy size={13} />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="p-2 space-y-1.5 max-h-[300px] overflow-y-auto">
                                            {items.map(enrollment => (
                                                <div
                                                    key={enrollment.id}
                                                    className="group p-3 rounded-xl border border-border-subtle bg-surface-elevated hover:shadow-sm transition-all flex items-center gap-3"
                                                >
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-semibold text-primary text-[13px] truncate">
                                                            {enrollment.students?.first_name} {enrollment.students?.last_name}
                                                        </p>
                                                        <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full mt-0.5 ${cfg.pillBg}`}>
                                                            {getCoursePill(enrollment)}
                                                        </span>
                                                    </div>
                                                    <button
                                                        onClick={() => updateStatus(enrollment.id, 'requested')}
                                                        className="text-[11px] font-medium text-muted hover:text-brand-600 hover:bg-brand-50 px-2 py-1 rounded-lg transition-all whitespace-nowrap"
                                                    >
                                                        Restore
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleteTarget(enrollment)}
                                                        className="text-muted hover:text-red-500 hover:bg-red-50 p-1 rounded-lg transition-all"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ═══ Empty State ═══ */}
            {filteredEnrollments.length === 0 && (
                <div className="text-center py-16">
                    <div className="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <GraduationCap size={28} className="text-muted" />
                    </div>
                    <p className="text-lg font-semibold text-primary">No enrollments found</p>
                    <p className="text-sm text-muted mt-1">Try adjusting your filters or add a new enrollment</p>
                </div>
            )}

            {/* ═══ Floating Action Bar ═══ */}
            {selectedCount > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slideUp">
                    <div className="glass-dark rounded-2xl shadow-float px-6 py-3.5 flex items-center gap-4">
                        <span className="text-sm font-semibold text-white">
                            {selectedCount} selected
                        </span>

                        <div className="w-px h-6 bg-white/10" />

                        <button
                            onClick={handleCopySelectedEmails}
                            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all"
                        >
                            <Copy size={14} /> Copy Emails
                        </button>

                        <button
                            onClick={() => bulkUpdateStatus('invited')}
                            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition-all shadow-sm"
                        >
                            <Send size={14} /> Invite
                        </button>

                        <button
                            onClick={() => bulkUpdateStatus('confirmed')}
                            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-all shadow-sm"
                        >
                            <CheckCircle size={14} /> Confirm
                        </button>

                        <button
                            onClick={() => bulkUpdateStatus('completed')}
                            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-600 text-white transition-all shadow-sm"
                        >
                            <GraduationCap size={14} /> Complete
                        </button>

                        <button
                            onClick={handleGenerateDocuments}
                            disabled={generatingDocs}
                            className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg ${generatingDocs ? 'bg-amber-500/50 cursor-wait' : 'bg-amber-500 hover:bg-amber-600'} text-white transition-all shadow-sm`}
                        >
                            {generatingDocs ? <Loader2 size={14} className="animate-spin" /> : <FileArchive size={14} />} Gen Docs
                        </button>

                        <button
                            onClick={clearSelection}
                            className="text-white/50 hover:text-white transition-all ml-1 p-1 hover:bg-white/10 rounded-lg"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* ═══ Invite Date Modal ═══ */}
            {inviteDateTarget && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn" onClick={() => setInviteDateTarget(null)}>
                    <div
                        className="bg-surface-elevated rounded-2xl shadow-2xl border border-border-subtle p-6 w-full max-w-sm mx-4 animate-scaleIn"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3 mb-5">
                            <div className="p-2.5 bg-blue-50 rounded-xl text-blue-600">
                                <Send size={22} />
                            </div>
                            <div>
                                <h3 className="font-bold text-primary">Invite to Course</h3>
                                <p className="text-xs text-muted mt-0.5">
                                    {inviteDateTarget.ids.length === 1
                                        ? 'Select the date for this invitation'
                                        : `Select the date for ${inviteDateTarget.ids.length} invitations`
                                    }
                                </p>
                            </div>
                        </div>

                        {/* Saved dates chips */}
                        {savedInviteDates.length > 0 && (
                            <div className="mb-4">
                                <label className="block text-xs font-medium text-muted mb-2">Saved dates</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {savedInviteDates.map(d => (
                                        <button
                                            key={d}
                                            onClick={() => setInviteDate(d)}
                                            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${inviteDate === d
                                                ? 'bg-blue-500 text-white border-blue-500 shadow-sm'
                                                : 'bg-surface-elevated text-muted border-border-subtle hover:border-blue-300 hover:text-blue-600'
                                                }`}
                                        >
                                            {formatDate(d)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <label className="block text-sm font-medium text-primary mb-1.5">
                            {savedInviteDates.length > 0 ? 'Or pick a new date' : 'Invitation Date'}
                        </label>
                        <input
                            type="date"
                            value={inviteDate}
                            min={todayISO()}
                            onChange={e => setInviteDate(e.target.value)}
                            className="w-full px-4 py-3 border border-border-subtle rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-surface"
                        />

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setInviteDateTarget(null)}
                                className="px-4 py-2.5 text-sm font-medium text-muted bg-surface-100 hover:bg-surface-200 rounded-xl transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleInviteWithDate}
                                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-xl transition-all shadow-sm"
                            >
                                <Send size={14} /> Just Invite
                            </button>
                            <button
                                onClick={handleInviteAndEmail}
                                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 rounded-xl transition-all shadow-sm"
                            >
                                <Mail size={14} /> Invite & Email
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ Confirm Date Modal ═══ */}
            {confirmDateTarget && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn" onClick={() => setConfirmDateTarget(null)}>
                    <div
                        className="bg-surface-elevated rounded-2xl shadow-2xl border border-border-subtle p-6 w-full max-w-sm mx-4 animate-scaleIn"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3 mb-5">
                            <div className="p-2.5 bg-emerald-50 rounded-xl text-emerald-600">
                                <CheckCircle size={22} />
                            </div>
                            <div>
                                <h3 className="font-bold text-primary">Confirm Enrollment</h3>
                                <p className="text-xs text-muted mt-0.5">
                                    {confirmDateTarget.ids.length === 1
                                        ? 'Set the confirmation date for this enrollment'
                                        : `Set the confirmation date for ${confirmDateTarget.ids.length} enrollments`
                                    }
                                </p>
                            </div>
                        </div>

                        {/* Saved dates chips */}
                        {savedInviteDates.length > 0 && (
                            <div className="mb-4">
                                <label className="block text-xs font-medium text-muted mb-2">Saved Course Dates</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {savedInviteDates.map(d => (
                                        <button
                                            key={d}
                                            onClick={() => setConfirmDate(d)}
                                            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${confirmDate === d
                                                ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                                                : 'bg-surface-elevated text-muted border-border-subtle hover:border-emerald-300 hover:text-emerald-600'
                                                }`}
                                        >
                                            {formatDate(d)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <label className="block text-sm font-medium text-primary mb-1.5">
                            {savedInviteDates.length > 0 ? 'Or pick a new date' : 'Confirmation Date'}
                        </label>
                        <input
                            type="date"
                            value={confirmDate}
                            onChange={e => setConfirmDate(e.target.value)}
                            className="w-full px-4 py-3 border border-border-subtle rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 bg-surface"
                        />

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setConfirmDateTarget(null)}
                                className="flex-1 px-4 py-2.5 text-sm font-medium text-muted bg-surface-100 hover:bg-surface-200 rounded-xl transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmWithDate}
                                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 rounded-xl transition-all shadow-sm"
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ Modals ═══ */}
            <EnrollmentModal
                open={enrollModalOpen}
                onSave={() => {
                    fetchEnrollments();
                    setToast({ message: 'Enrollment created', type: 'success' });
                }}
                onClose={() => setEnrollModalOpen(false)}
            />
            <ConfirmDialog
                open={!!deleteTarget}
                title="Delete Enrollment"
                message={`Remove ${deleteTarget?.students?.first_name || ''} ${deleteTarget?.students?.last_name || ''} from ${deleteTarget?.courses?.name || 'this course'}?`}
                confirmLabel="Remove"
                onConfirm={handleDeleteEnrollment}
                onCancel={() => setDeleteTarget(null)}
            />
            <Toast toast={toast} onDismiss={() => setToast(null)} />

            {/* Edit Note Modal */}
            {editNoteTarget && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn" onClick={() => setEditNoteTarget(null)}>
                    <div
                        className="bg-surface-elevated rounded-2xl shadow-2xl border border-border-subtle p-6 w-full max-w-sm mx-4 animate-scaleIn"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3 mb-5">
                            <div className="p-2.5 bg-brand-50 rounded-xl text-brand-600">
                                <FileText size={22} />
                            </div>
                            <div>
                                <h3 className="font-bold text-primary">Enrollment Note</h3>
                                <p className="text-xs text-muted mt-0.5">
                                    Add or edit note for this student
                                </p>
                            </div>
                        </div>

                        <textarea
                            value={editNoteText}
                            onChange={e => setEditNoteText(e.target.value)}
                            placeholder="Enter note here..."
                            className="w-full px-4 py-3 border border-border-subtle rounded-xl text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 bg-surface min-h-[120px] resize-none"
                            autoFocus
                        />

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setEditNoteTarget(null)}
                                className="px-4 py-2.5 text-sm font-medium text-muted bg-surface-100 hover:bg-surface-200 rounded-xl transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveNote}
                                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 rounded-xl transition-all shadow-sm"
                            >
                                Save Note
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
