import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { AuthProvider } from './contexts/AuthContext'
import { lazyWithRetry } from './lib/lazyWithRetry'
import ErrorBoundary from './components/ErrorBoundary'
import { PublicPageFallback, AppFallback } from './components/ui/PageFallbacks'
// Self-hosted variable fonts (bundled under /assets, no third-party request or preload)
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './index.css'

// Early preconnect to Supabase for faster mobile RPC connections
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
if (typeof document !== 'undefined' && supabaseUrl) {
    try {
        const origin = new URL(supabaseUrl).origin
        const link = document.createElement('link')
        link.rel = 'preconnect'
        link.href = origin
        link.crossOrigin = 'anonymous'
        document.head.appendChild(link)
    } catch {
        // ignore
    }
}

// Code-split routes so public confirmation pages don't download heavy admin bundles
const App = lazyWithRetry(() => import('./App.tsx'))
const ConfirmationPage = lazyWithRetry(() => import('./components/ConfirmationPage'))
const StatusUpdatePage = lazyWithRetry(() => import('./components/StatusUpdatePage'))

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes fresh cache for instant tab switches
            gcTime: 1000 * 60 * 30, // 30 minutes cache persistence across navigation
            refetchOnWindowFocus: false, // Prevent lag spikes/CPU drain when switching windows
            retry: (failureCount, error: unknown) => {
                // Don't hammer the API on permission / validation errors — only retry transient failures
                const status = (error as { status?: number; code?: string } | null)?.status;
                if (status && status >= 400 && status < 500) return false;
                return failureCount < 2;
            },
        },
    },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
                <BrowserRouter>
                    <Routes>
                        <Route path="/confirm" element={<Suspense fallback={<PublicPageFallback />}><ConfirmationPage /></Suspense>} />
                        <Route path="/c/:token" element={<Suspense fallback={<PublicPageFallback />}><ConfirmationPage /></Suspense>} />
                        <Route path="/status" element={<Suspense fallback={<PublicPageFallback />}><StatusUpdatePage /></Suspense>} />
                        <Route path="/*" element={
                            <Suspense fallback={<AppFallback />}>
                                <AuthProvider>
                                    <App />
                                </AuthProvider>
                            </Suspense>
                        } />
                    </Routes>
                </BrowserRouter>
                {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
            </QueryClientProvider>
        </ErrorBoundary>
    </React.StrictMode>,
)

