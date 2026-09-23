import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * The viewer student drawer is URL driven (`?student=<id>`), so it survives reloads,
 * can be shared as a link and closes with the browser Back button.
 *
 * Pages publish the ordered list of students they currently show; the drawer uses it
 * for Previous / Next navigation (↑ / ↓) without closing.
 */

export const STUDENT_PARAM = 'student';

let visibleIds: string[] = [];
const listeners = new Set<() => void>();

function emit() {
    listeners.forEach(l => l());
}

export function setVisibleStudentIds(ids: string[]) {
    if (ids.length === visibleIds.length && ids.every((id, i) => id === visibleIds[i])) return;
    visibleIds = ids;
    emit();
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

export function useVisibleStudentIds(): string[] {
    return useSyncExternalStore(subscribe, () => visibleIds, () => visibleIds);
}

/** Publishes `ids` while the calling page is mounted. */
export function usePublishStudentList(ids: string[]) {
    const key = ids.join(',');
    useEffect(() => {
        setVisibleStudentIds(key ? key.split(',') : []);
    }, [key]);
    useEffect(() => () => setVisibleStudentIds([]), []);
}

export function useStudentDrawer() {
    const location = useLocation();
    const navigate = useNavigate();
    const currentId = new URLSearchParams(location.search).get(STUDENT_PARAM);

    const open = useCallback((studentId: string) => {
        const params = new URLSearchParams(location.search);
        const alreadyOpen = params.has(STUDENT_PARAM);
        params.set(STUDENT_PARAM, studentId);
        const state = (location.state && typeof location.state === 'object') ? location.state as Record<string, unknown> : {};
        navigate(
            { pathname: location.pathname, search: `?${params.toString()}` },
            // Switching students inside an open drawer doesn't add history entries
            { replace: alreadyOpen, state: { ...state, viewerDrawer: alreadyOpen ? state.viewerDrawer : true } }
        );
    }, [location.pathname, location.search, location.state, navigate]);

    const close = useCallback(() => {
        const state = location.state as { viewerDrawer?: boolean } | null;
        if (state?.viewerDrawer && window.history.length > 1) {
            navigate(-1);
            return;
        }
        const params = new URLSearchParams(location.search);
        params.delete(STUDENT_PARAM);
        const search = params.toString();
        navigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { replace: true });
    }, [location.pathname, location.search, location.state, navigate]);

    return { currentId, open, close };
}
