import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { AuthProvider } from './contexts/AuthContext'
import App from './App.tsx'
import ConfirmationPage from './components/ConfirmationPage'
import StatusUpdatePage from './components/StatusUpdatePage'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: Infinity, // Rely on real-time subscriptions for updates, no background polling
            gcTime: 1000 * 60 * 2, // 2 minutes (lower from 5 mins to clear unused cache faster to save RAM)
            refetchOnWindowFocus: false, // Prevent lag spikes/CPU drain when switching windows
        },
    },
})


ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
                <BrowserRouter>
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
                </BrowserRouter>
                {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
            </QueryClientProvider>
        </ErrorBoundary>
    </React.StrictMode>,
)
