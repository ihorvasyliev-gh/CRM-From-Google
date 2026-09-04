import { useSyncExternalStore } from 'react';

let currentMinute = Date.now();
const listeners = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;

function subscribe(callback: () => void) {
    listeners.add(callback);
    if (listeners.size === 1) {
        intervalId = setInterval(() => {
            currentMinute = Date.now();
            listeners.forEach(cb => cb());
        }, 60000);
    }
    return () => {
        listeners.delete(callback);
        if (listeners.size === 0 && intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
    };
}

const noopSubscribe = () => () => {};

export function useNowMinute(enabled: boolean = true): number {
    return useSyncExternalStore(
        enabled ? subscribe : noopSubscribe,
        () => (enabled ? currentMinute : 0),
        () => 0
    );
}
