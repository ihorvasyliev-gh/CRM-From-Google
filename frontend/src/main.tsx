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
                        <div className="min-h-screen min-h-[100dvh] bg-[#09090B] text-[#FAFAFA] flex flex-col items-center justify-start sm:justify-center p-4 pt-10 sm:pt-4">
                            <div className="flex items-center justify-center gap-3 mb-8">
                                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-500 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-indigo-500/25">
                                    C
                                </div>
                                <div>
                                    <h1 className="text-lg font-bold tracking-tight">Cork City Partnership</h1>
                                    <p className="text-[10px] text-zinc-500 font-medium -mt-0.5 tracking-wide uppercase">Course Portal</p>
                                </div>
                            </div>
                            <div className="w-full max-w-md bg-[#18181B] rounded-2xl border border-zinc-800 shadow-xl shadow-black/20 overflow-hidden min-h-[440px] flex items-center justify-center p-6">
                                <div className="w-8 h-8 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
                            </div>
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

