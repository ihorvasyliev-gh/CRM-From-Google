import { useState } from 'react';
import { useModalBehavior } from '../hooks/useModalBehavior';
import { usePresence } from '../hooks/usePresence';
import { Plus, UserPlus, Search, GraduationCap, X } from 'lucide-react';

interface MobileFloatingActionsProps {
    onOpenAddStudent: () => void;
    onOpenCommandPalette: () => void;
    onOpenEnrollment?: () => void;
    isViewer: boolean;
}

export default function MobileFloatingActions({
    onOpenAddStudent,
    onOpenCommandPalette,
    onOpenEnrollment,
    isViewer
}: MobileFloatingActionsProps) {
    const [open, setOpen] = useState(false);
    useModalBehavior(open, () => setOpen(false));
    // The menu and its backdrop fade out instead of vanishing
    const { mounted, closing, ref } = usePresence(open);

    // Viewers have Search in the bottom dock; a FAB would only cover list rows and the bulk action bar
    if (isViewer) return null;

    return (
        <div className="lg:hidden fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+4.25rem)] z-30">
            {/* Speed Dial Backdrop */}
            {mounted && (
                <div
                    ref={ref}
                    className={`fixed inset-0 bg-black/40 z-10 ${closing ? 'animate-fadeOut pointer-events-none' : 'animate-fadeIn'}`}
                    onClick={() => setOpen(false)}
                />
            )}

            <div className="relative z-20 flex flex-col items-end gap-2.5">
                {/* Speed Dial Menu Items */}
                {mounted && (
                    <div inert={closing} className={`flex flex-col items-end gap-2 mb-1 ${closing ? 'animate-fadeOut pointer-events-none' : 'animate-slideUp'}`}>
                        <button
                            onClick={() => {
                                setOpen(false);
                                onOpenCommandPalette();
                            }}
                            className="flex items-center gap-2.5 px-3.5 py-2 bg-surface text-primary border border-border-subtle rounded-xl shadow-float text-xs font-semibold hover:bg-surface active:scale-95 transition-all"
                        >
                            <span>Quick Search</span>
                            <div className="w-8 h-8 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                                <Search size={16} />
                            </div>
                        </button>

                        {onOpenEnrollment && (
                            <button
                                onClick={() => {
                                    setOpen(false);
                                    onOpenEnrollment();
                                }}
                                className="flex items-center gap-2.5 px-3.5 py-2 bg-surface text-primary border border-border-subtle rounded-xl shadow-float text-xs font-semibold hover:bg-surface active:scale-95 transition-all"
                            >
                                <span>New Enrollment</span>
                                <div className="w-8 h-8 rounded-lg bg-success/15 text-status-confirmed flex items-center justify-center">
                                    <GraduationCap size={16} />
                                </div>
                            </button>
                        )}

                        <button
                            onClick={() => {
                                setOpen(false);
                                onOpenAddStudent();
                            }}
                            className="flex items-center gap-2.5 px-3.5 py-2 bg-surface text-primary border border-border-subtle rounded-xl shadow-float text-xs font-semibold hover:bg-surface active:scale-95 transition-all"
                        >
                            <span>Add Student</span>
                            <div className="w-8 h-8 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                                <UserPlus size={16} />
                            </div>
                        </button>
                    </div>
                )}

                {/* Primary Trigger Button */}
                <button
                    onClick={() => setOpen(prev => !prev)}
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg transition-all duration-300 active:scale-95 ${
                        open
                            ? 'bg-surface-elevated text-primary border border-border-subtle shadow-float rotate-90'
                            : 'bg-brand-500 hover:bg-brand-600 shadow-brand-500/30'
                    }`}
                    title={open ? 'Close quick actions' : 'Open quick actions'}
                    aria-label="Quick Actions"
                >
                    {open ? <X size={20} /> : <Plus size={22} strokeWidth={2.5} />}
                </button>
            </div>
        </div>
    );
}
