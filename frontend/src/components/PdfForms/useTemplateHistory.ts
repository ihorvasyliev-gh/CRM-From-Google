import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FormField } from '../../lib/pdfForms/types';

export const DEFAULT_MAX_HISTORY = 100;
export const DEFAULT_COALESCE_MS = 700;

export interface UseTemplateHistoryOptions {
    /** Maximum number of undo snapshots retained (default: 100) */
    maxHistory?: number;
    /** Coalesce successive edits within this many ms into a single snapshot (default: 700; 0 disables coalescing) */
    coalesceMs?: number;
    /** Invoked after commit, undo, or redo produces a new present state */
    onChange?: () => void;
    /** Bind global Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, and Ctrl/Cmd+Y shortcuts (default: false) */
    bindShortcuts?: boolean;
}

export interface UseTemplateHistoryResult<T> {
    present: T;
    past: T[];
    future: T[];
    canUndo: boolean;
    canRedo: boolean;
    commit: (next: T | ((prev: T) => T)) => void;
    undo: () => void;
    redo: () => void;
    reset: (next: T) => void;
}

interface HistoryState<T> {
    past: T[];
    present: T;
    future: T[];
    lastEdit: number;
    revision: number;
}

function appendPast<T>(past: T[], snapshot: T, maxHistory: number): T[] {
    if (maxHistory <= 0) return [];
    const next = [...past, snapshot];
    return next.length > maxHistory ? next.slice(next.length - maxHistory) : next;
}

/**
 * Undo/redo snapshot stack for template editing.
 * Quick successive edits within `coalesceMs` (dragging, nudging, typing) collapse into one snapshot.
 */
export function useTemplateHistory<T = FormField[]>(
    initial: T,
    options: UseTemplateHistoryOptions = {},
): UseTemplateHistoryResult<T> {
    const {
        maxHistory = DEFAULT_MAX_HISTORY,
        coalesceMs = DEFAULT_COALESCE_MS,
        onChange,
        bindShortcuts = false,
    } = options;

    const [state, setState] = useState<HistoryState<T>>(() => ({
        past: [],
        present: initial,
        future: [],
        lastEdit: 0,
        revision: 0,
    }));

    const onChangeRef = useRef(onChange);
    useLayoutEffect(() => {
        onChangeRef.current = onChange;
    });

    const lastNotifiedRevRef = useRef(0);
    useEffect(() => {
        if (state.revision === 0) {
            lastNotifiedRevRef.current = 0;
            return;
        }
        if (state.revision !== lastNotifiedRevRef.current) {
            lastNotifiedRevRef.current = state.revision;
            onChangeRef.current?.();
        }
    }, [state.revision]);

    const commit = useCallback(
        (next: T | ((prev: T) => T)) => {
            const now = Date.now();
            setState(prev => {
                const value = typeof next === 'function' ? (next as (p: T) => T)(prev.present) : next;
                if (Object.is(value, prev.present)) return prev;
                const shouldSnapshot = coalesceMs <= 0 || now - prev.lastEdit > coalesceMs;
                return {
                    past: shouldSnapshot ? appendPast(prev.past, prev.present, maxHistory) : prev.past,
                    present: value,
                    future: [],
                    lastEdit: now,
                    revision: prev.revision + 1,
                };
            });
        },
        [coalesceMs, maxHistory],
    );

    const undo = useCallback(() => {
        setState(prev => {
            if (prev.past.length === 0) return prev;
            return {
                past: prev.past.slice(0, -1),
                present: prev.past[prev.past.length - 1],
                future: [prev.present, ...prev.future],
                lastEdit: 0,
                revision: prev.revision + 1,
            };
        });
    }, []);

    const redo = useCallback(() => {
        setState(prev => {
            if (prev.future.length === 0) return prev;
            return {
                past: appendPast(prev.past, prev.present, maxHistory),
                present: prev.future[0],
                future: prev.future.slice(1),
                lastEdit: 0,
                revision: prev.revision + 1,
            };
        });
    }, [maxHistory]);

    const reset = useCallback((next: T) => {
        setState({
            past: [],
            present: next,
            future: [],
            lastEdit: 0,
            revision: 0,
        });
    }, []);

    useEffect(() => {
        if (!bindShortcuts) return;
        const onKey = (e: KeyboardEvent) => {
            const target = e.target;
            if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) {
                return;
            }
            if (!(e.ctrlKey || e.metaKey)) return;
            const key = e.key.toLowerCase();
            if (key === 'z') {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
            } else if (key === 'y') {
                e.preventDefault();
                redo();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [bindShortcuts, undo, redo]);

    return {
        present: state.present,
        past: state.past,
        future: state.future,
        canUndo: state.past.length > 0,
        canRedo: state.future.length > 0,
        commit,
        undo,
        redo,
        reset,
    };
}
