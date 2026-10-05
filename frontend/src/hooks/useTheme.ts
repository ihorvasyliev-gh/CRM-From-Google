import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { readStorage, writeStorage } from '../lib/storage';

/**
 * Light / dark theme: starts from the saved choice (key 'theme', also read by public/theme-init.js
 * before first paint) or the system preference, and applies it to <html>.
 */
export function useTheme() {
    const [darkMode, setDarkMode] = useState(() => {
        const saved = readStorage('theme');
        if (saved) return saved === 'dark';
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    });

    // Apply dark mode class to root element (+ keep the mobile browser chrome colour in sync)
    useEffect(() => {
        document.documentElement.classList.toggle('dark', darkMode);
        // index.html pins a light boot background for light-theme users; React owns theming from here
        document.documentElement.removeAttribute('data-boot-theme');
        document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', darkMode ? '#09090b' : '#f3f5f8');
        writeStorage('theme', darkMode ? 'dark' : 'light');
    }, [darkMode]);

    const toggleDarkMode = useCallback(() => {
        const root = document.documentElement;
        const next = !root.classList.contains('dark');
        // Swap the class synchronously so the view transition snapshots the finished theme
        // (a plain setState would commit after the snapshot and cross-fade to the old one).
        const apply = () => {
            root.classList.toggle('dark', next);
            flushSync(() => setDarkMode(next));
        };
        // Suppress the per-element colour transitions while the theme flips
        root.classList.add('theme-switching');
        const done = () => requestAnimationFrame(() => root.classList.remove('theme-switching'));
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
        if (doc.startViewTransition && !reduceMotion) {
            doc.startViewTransition(apply).finished.finally(done);
        } else {
            apply();
            done();
        }
    }, []);

    return { darkMode, toggleDarkMode };
}
