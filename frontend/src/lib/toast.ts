/**
 * The app's toast bus: every page, modal and hook shows feedback through it, and the one
 * <GlobalToaster /> mounted by the app shell displays it.
 */

export interface ToastData {
    message: string;
    type: 'success' | 'error' | 'info';
    action?: {
        label: string;
        onClick: () => void;
    };
    duration?: number;
}

type Listener = (toast: ToastData) => void;
const listeners = new Set<Listener>();

/** Shows a toast. Hooks and helpers take it as a parameter, so tests can capture what they report. */
export type ShowToast = (message: string, type: ToastData['type'], options?: Pick<ToastData, 'action' | 'duration'>) => void;

/** ShowToast through the app's toast bus. */
export const showToast: ShowToast = (message, type, options) => notify({ message, type, ...options });

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
