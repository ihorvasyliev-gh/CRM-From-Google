import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { AuthProvider } from './contexts/AuthContext'
import App from './App.tsx'
import ConfirmationPage from './components/ConfirmationPage'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

const queryClient = new QueryClient()

if (import.meta.env.PROD) {
    // Disable React DevTools
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const globalHook = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (typeof globalHook === 'object') {
        const noop = () => { };
        for (const key in globalHook) {
            globalHook[key] = typeof globalHook[key] === 'function' ? noop : null;
        }
    }

    // Disable console logs as an extra measure
    const noop = () => { };
    ['log', 'debug', 'info', 'warn', 'error'].forEach((method) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (console as any)[method] = noop;
    });

    // Disable right-click
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    // Disable common DevTools keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (
            e.key === 'F12' ||
            (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
            (e.ctrlKey && e.key === 'U')
        ) {
            e.preventDefault();
        }
    });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
                <BrowserRouter>
                    <Routes>
                        <Route path="/confirm" element={<ConfirmationPage />} />
                        <Route path="/c/:token" element={<ConfirmationPage />} />
                        <Route path="/*" element={
                            <AuthProvider>
                                <App />
                            </AuthProvider>
                        } />
                    </Routes>
                </BrowserRouter>
                <ReactQueryDevtools initialIsOpen={false} />
            </QueryClientProvider>
        </ErrorBoundary>
    </React.StrictMode>,
)
