// localStorage access that never throws: storage can be blocked (privacy modes, disabled site data)

/** The stored value, or null where there is none or storage is blocked. */
export function readStorage(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

/** Stores a value; silently does nothing where storage is blocked. */
export function writeStorage(key: string, value: string): void {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // storage blocked: the setting just isn't remembered
    }
}
