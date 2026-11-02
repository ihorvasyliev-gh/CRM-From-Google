import { showToast } from '../toast';

/**
 * The text on the clipboard, for a Paste button. The browser may ask first; if it says no (or
 * can't), the person is told to paste with the keyboard or the right mouse button instead.
 */
export async function readClipboard(): Promise<string | null> {
    try {
        if (!navigator.clipboard?.readText) throw new Error('No clipboard');
        const text = await navigator.clipboard.readText();
        if (!text.trim()) {
            showToast('There is nothing to paste: copy the names first.', 'info');
            return null;
        }
        return text;
    } catch {
        showToast('The browser did not let the page read what you copied. Click in the box and press Ctrl+V (⌘V on a Mac), or right-click and choose Paste.', 'info');
        return null;
    }
}
