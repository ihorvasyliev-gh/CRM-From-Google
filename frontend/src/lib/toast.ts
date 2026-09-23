import type { ToastData } from '../components/Toast';

/**
 * Tiny global toast bus. Lets code that lives outside a page component
 * (App-level modals, hooks, utilities) show feedback through <GlobalToaster />.
 */

type Listener = (toast: ToastData) => void;
const listeners = new Set<Listener>();

export function subscribeToasts(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

export function notify(toast: ToastData): void {
    listeners.forEach(l => l(toast));
}

export const toast = {
    success: (message: string, options?: Omit<ToastData, 'message' | 'type'>) => notify({ message, type: 'success', ...options }),
    error: (message: string, options?: Omit<ToastData, 'message' | 'type'>) => notify({ message, type: 'error', ...options }),
    info: (message: string, options?: Omit<ToastData, 'message' | 'type'>) => notify({ message, type: 'info', ...options }),
};
