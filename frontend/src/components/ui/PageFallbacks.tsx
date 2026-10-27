/** Suspense fallbacks shown while a route's code chunk is loading. */

// Pages opened from our emails: the same logo and card as the page that is loading
// (they follow the phone's light/dark setting, which index.html applies before first paint)
export function PublicPageFallback() {
    return (
        <div className="min-h-screen min-h-dvh bg-background flex flex-col items-center p-4 sm:p-6">
            <div className="w-full max-w-md my-auto py-2 sm:py-4">
                <div className="rounded-2xl bg-white px-5 py-3.5 shadow-card ring-1 ring-black/5 mb-4">
                    <img src="/logos-banner-sm.webp" alt="Cork City Partnership · SICAP" width={800} height={154} className="w-full h-auto" />
                </div>
                <div className="bg-surface rounded-2xl border border-border-subtle shadow-card min-h-[360px] flex items-center justify-center p-6">
                    <div role="status" aria-label="Loading" className="w-8 h-8 rounded-full border-2 border-brand-500/20 border-t-brand-500 animate-spin" />
                </div>
            </div>
        </div>
    );
}

// Admin/viewer app follows the user's theme (index.html applies it before first paint)
export function AppFallback() {
    return (
        <div className="min-h-screen min-h-dvh bg-background flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-brand-500/20 border-t-brand-500 animate-spin" />
        </div>
    );
}
