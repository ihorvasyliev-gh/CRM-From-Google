import { useState } from 'react';
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

    // If viewer, FAB opens Quick Search directly
    if (isViewer) {
        return (
            <button
                onClick={onOpenCommandPalette}
                className="lg:hidden fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+4.25rem)] z-30 w-12 h-12 rounded-2xl bg-brand-500 hover:bg-brand-600 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-brand-500/30 transition-all"
                title="Quick Search"
                aria-label="Quick Search"
            >
                <Search size={20} />
            </button>
        );
    }

    return (
        <div className="lg:hidden fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+4.25rem)] z-30">
            {/* Speed Dial Backdrop */}
            {open && (
                <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-xs z-10 animate-fadeIn"
                    onClick={() => setOpen(false)}
                />
            )}

            <div className="relative z-20 flex flex-col items-end gap-2.5">
                {/* Speed Dial Menu Items */}
                {open && (
                    <div className="flex flex-col items-end gap-2 mb-1 animate-slideUp">
                        <button
                            onClick={() => {
                                setOpen(false);
                                onOpenCommandPalette();
                            }}
                            className="flex items-center gap-2.5 px-3.5 py-2 bg-surface-elevated text-primary border border-border-subtle rounded-xl shadow-float text-xs font-semibold hover:bg-surface active:scale-95 transition-all"
                        >
                            <span>Quick Search</span>
                            <div className="w-8 h-8 rounded-lg bg-brand-500/10 text-brand-500 flex items-center justify-center">
                                <Search size={16} />
                            </div>
                        </button>

                        {onOpenEnrollment && (
                            <button
                                onClick={() => {
                                    setOpen(false);
                                    onOpenEnrollment();
                                }}
                                className="flex items-center gap-2.5 px-3.5 py-2 bg-surface-elevated text-primary border border-border-subtle rounded-xl shadow-float text-xs font-semibold hover:bg-surface active:scale-95 transition-all"
                            >
                                <span>New Enrollment</span>
                                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                                    <GraduationCap size={16} />
                                </div>
                            </button>
                        )}

                        <button
                            onClick={() => {
                                setOpen(false);
                                onOpenAddStudent();
                            }}
                            className="flex items-center gap-2.5 px-3.5 py-2 bg-surface-elevated text-primary border border-border-subtle rounded-xl shadow-float text-xs font-semibold hover:bg-surface active:scale-95 transition-all"
                        >
                            <span>Add Student</span>
                            <div className="w-8 h-8 rounded-lg bg-brand-500/10 text-brand-500 flex items-center justify-center">
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
                            : 'bg-gradient-to-tr from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 shadow-brand-500/30'
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
