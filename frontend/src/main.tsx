import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { AuthProvider } from './contexts/AuthContext'
import { lazyWithRetry } from './lib/lazyWithRetry'
import ErrorBoundary from './components/ErrorBoundary'
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
        },
    },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
                <BrowserRouter>
                    <Suspense fallback={
                        <div className="min-h-screen min-h-[100dvh] bg-[#09090B] flex items-center justify-center p-4">
                            <div className="w-8 h-8 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
                        </div>
                    }>
                        <Routes>
                            <Route path="/confirm" element={<ConfirmationPage />} />
                            <Route path="/c/:token" element={<ConfirmationPage />} />
                            <Route path="/status" element={<StatusUpdatePage />} />
                            <Route path="/*" element={
                                <AuthProvider>
                                    <App />
                                </AuthProvider>
                            } />
                        </Routes>
                    </Suspense>
                </BrowserRouter>
                {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
            </QueryClientProvider>
        </ErrorBoundary>
    </React.StrictMode>,
)

