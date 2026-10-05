import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchAllEnrollments } from './useEnrollments';
import { fetchGraduatesFn } from './useOutcomes';
import { fetchCourses, fetchDashboardStats, fetchEmploymentStatuses, fetchStudentsPage } from '../lib/queries';

// Hover prefetch per tab: its data, plus its chunk (idle prewarm skips heavy chunks on slow connections)
const enrollmentsQuery = { queryKey: ['enrollments'], queryFn: fetchAllEnrollments };
const TAB_PREFETCH: Record<string, { queries?: { queryKey: string[]; queryFn: () => Promise<unknown> }[]; chunk?: () => Promise<unknown> }> = {
    dashboard: { queries: [{ queryKey: ['dashboard_stats'], queryFn: fetchDashboardStats }, enrollmentsQuery] },
    courses: { queries: [{ queryKey: ['courses'], queryFn: fetchCourses }, enrollmentsQuery], chunk: () => import('../components/CourseList') },
    enrollments: { queries: [enrollmentsQuery] },
    outcomes: { queries: [{ queryKey: ['outcomes_graduates'], queryFn: fetchGraduatesFn }], chunk: () => import('../components/OutcomesList') },
    documents: { queries: [enrollmentsQuery, { queryKey: ['doc_courses'], queryFn: fetchCourses }], chunk: () => import('../components/DocumentGenerator') },
    analytics: { queries: [enrollmentsQuery, { queryKey: ['analytics_employment_statuses_v1'], queryFn: fetchEmploymentStatuses }], chunk: () => import('../components/Analytics') },
    settings: { chunk: () => import('../components/Settings') },
    'pdf-forms': { chunk: () => import('../components/PdfForms') },
};

type IdleWindow = Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
};

/**
 * Loads tabs ahead of the first visit: a tab's data and code on hover (debounced, so a cursor
 * sweeping past the sidebar doesn't fetch everything), and the code of the other tabs while the
 * browser is idle (touch devices never hover). `shell` says which tabs this user has.
 */
export function useTabPrefetch(shell: 'admin' | 'viewer' | null, initialTab?: string) {
    const queryClient = useQueryClient();
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const prefetchTabData = useCallback((tab: string) => {
        const { queries = [] } = TAB_PREFETCH[tab] ?? {};
        queries.forEach(q => queryClient.prefetchQuery({ ...q, staleTime: 30_000 }));
        if (tab === 'students') {
            queryClient.prefetchInfiniteQuery({ queryKey: ['students', ''], queryFn: fetchStudentsPage, initialPageParam: 0, staleTime: 30_000 });
        }
    }, [queryClient]);

    const handleTabMouseEnter = useCallback((tab: string) => {
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = setTimeout(() => {
            prefetchTabData(tab);
            TAB_PREFETCH[tab]?.chunk?.();
        }, 150);
    }, [prefetchTabData]);

    // The page open after sign-in / reload: its data starts loading now, alongside its code,
    // instead of after the page's chunk has downloaded and rendered
    const initialTabRef = useRef(initialTab);
    useEffect(() => {
        if (shell === 'admin' && initialTabRef.current) prefetchTabData(initialTabRef.current);
    }, [shell, prefetchTabData]);

    const handleTabMouseLeave = useCallback(() => {
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
    }, []);

    useEffect(() => () => {
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    }, []);

    // Viewers: prewarm their route chunks during idle time
    useEffect(() => {
        if (shell !== 'viewer') return;
        const prewarm = () => {
            import('../components/ViewerHome');
            import('../components/ViewerStudentsDirectory');
            import('../components/ViewerCourses');
            import('../components/StudentDetailDrawer');
            import('../components/CommandPalette');
            import('../components/KeyboardShortcutsModal');
        };
        const w = window as IdleWindow;
        if (w.requestIdleCallback && w.cancelIdleCallback) {
            const handle = w.requestIdleCallback(prewarm, { timeout: 2000 });
            return () => w.cancelIdleCallback!(handle);
        }
        const timer = setTimeout(prewarm, 1000);
        return () => clearTimeout(timer);
    }, [shell]);

    // Admins: warm the code of the other tabs once the browser is idle, so the first visit to a
    // tab doesn't wait on a chunk download. Heavy chunks (charts, docx) are skipped on data-saver /
    // slow connections.
    useEffect(() => {
        if (shell !== 'admin') return;
        const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
        if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? '')) return;
        const slow = conn?.effectiveType === '3g';
        const loaders: Array<() => Promise<unknown>> = [
            // The dialogs App opens from anywhere (search, add student, enroll, student card)
            () => import('../components/CommandPalette'),
            () => import('../components/StudentDetail'),
            () => import('../components/EnrollmentModal'),
            () => import('../components/StudentModal'),
            () => import('../components/KeyboardShortcutsModal'),
            () => import('../components/Dashboard'),
            () => import('../components/StudentList'),
            () => import('../components/EnrollmentBoard'),
            () => import('../components/CourseList'),
            () => import('../components/OutcomesList'),
            () => import('../components/StudentDetailDrawer'),
            ...(slow ? [] : [
                () => import('../components/Settings'),
                () => import('../components/Analytics'),
                () => import('../components/DocumentGenerator'),
            ]),
        ];
        const w = window as IdleWindow;
        let cancelled = false;
        let handle: number | undefined;
        const schedule = (cb: () => void) => {
            handle = w.requestIdleCallback ? w.requestIdleCallback(cb, { timeout: 4000 }) : window.setTimeout(cb, 1500);
        };
        // One chunk per idle slot so prewarming never competes with user interaction
        const next = () => {
            const load = loaders.shift();
            if (cancelled || !load) return;
            load().catch(() => { /* real navigation retries via lazyWithRetry */ }).finally(() => {
                if (!cancelled) schedule(next);
            });
        };
        const start = window.setTimeout(() => schedule(next), 2500);
        return () => {
            cancelled = true;
            window.clearTimeout(start);
            if (handle !== undefined) {
                if (w.cancelIdleCallback) w.cancelIdleCallback(handle);
                else window.clearTimeout(handle);
            }
        };
    }, [shell]);

    return { handleTabMouseEnter, handleTabMouseLeave };
}
