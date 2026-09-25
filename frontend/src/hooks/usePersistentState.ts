import { useState, useEffect, Dispatch, SetStateAction } from 'react';

type StorageKind = 'local' | 'session';

function getStorage(kind: StorageKind): Storage | null {
    try {
        return kind === 'local' ? window.localStorage : window.sessionStorage;
    } catch {
        return null;
    }
}

/**
 * useState that survives navigation / reloads by mirroring the value into Web Storage.
 * `session` storage keeps per-tab working state (filters); `local` keeps preferences.
 * An optional `validate` guard drops stale or malformed stored values.
 */
export function usePersistentState<T>(
    key: string,
    initialValue: T | (() => T),
    { storage = 'session', validate }: { storage?: StorageKind; validate?: (value: unknown) => value is T } = {}
): [T, Dispatch<SetStateAction<T>>] {
    const [value, setValue] = useState<T>(() => {
        const fallback = typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
        const store = getStorage(storage);
        if (!store) return fallback;
        try {
            const raw = store.getItem(key);
            if (raw === null) return fallback;
            const parsed = JSON.parse(raw) as unknown;
            if (validate && !validate(parsed)) return fallback;
            return parsed as T;
        } catch {
            return fallback;
        }
    });

    useEffect(() => {
        const store = getStorage(storage);
        if (!store) return;
        try {
            store.setItem(key, JSON.stringify(value));
        } catch {
            // quota / private mode — persistence is best-effort
        }
    }, [key, value, storage]);

    return [value, setValue];
}
