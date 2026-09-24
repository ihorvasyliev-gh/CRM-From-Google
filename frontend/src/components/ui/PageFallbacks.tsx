/** Suspense fallbacks shown while a route's code chunk is loading. */

// Public confirmation pages are always dark-branded (forced .dark subtree → dark theme tokens)
export function PublicPageFallback() {
    return (
        <div className="dark min-h-screen min-h-[100dvh] bg-background text-primary flex flex-col items-center justify-start sm:justify-center p-4 pt-10 sm:pt-4">
            <div className="flex items-center justify-center gap-3 mb-8">
                <div className="w-10 h-10 bg-gradient-to-br from-brand-500 via-brand-600 to-purple-500 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-brand-500/25">
                    C
                </div>
                <div>
                    <h1 className="text-lg font-bold tracking-tight">Cork City Partnership</h1>
                    <p className="text-[10px] text-muted/80 font-medium -mt-0.5 tracking-wide uppercase">Course Portal</p>
                </div>
            </div>
            <div className="w-full max-w-md bg-surface rounded-2xl border border-border-subtle shadow-xl shadow-black/20 overflow-hidden min-h-[440px] flex items-center justify-center p-6">
                <div className="w-8 h-8 rounded-full border-2 border-brand-500/20 border-t-brand-500 animate-spin" />
            </div>
        </div>
    );
}

// Admin/viewer app follows the user's theme (index.html applies it before first paint)
export function AppFallback() {
    return (
        <div className="min-h-screen min-h-[100dvh] bg-background flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-brand-500/20 border-t-brand-500 animate-spin" />
        </div>
    );
}
