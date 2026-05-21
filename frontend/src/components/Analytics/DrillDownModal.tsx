import { X } from 'lucide-react';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import { formatDateDMY } from '../../lib/dateUtils';
import { cleanVariant } from '../../lib/types';

interface DrillDownModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    data: EnrollmentWithRelations[];
}

export default function DrillDownModal({ isOpen, onClose, title, data }: DrillDownModalProps) {
    if (!isOpen) return null;

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 dark:border-emerald-500/30';
            case 'confirmed': return 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20 dark:border-sky-500/30';
            case 'invited': return 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20 dark:border-violet-500/30';
            case 'requested': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 dark:border-amber-500/30';
            default: return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20 dark:border-slate-500/30';
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <div 
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" 
                onClick={onClose}
            />
            
            <div className="relative bg-surface border border-border-subtle rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col animate-scaleIn overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-border-subtle bg-surface-elevated">
                    <div>
                        <h2 className="text-lg font-bold text-primary">{title}</h2>
                        <p className="text-sm text-muted mt-1">Found {data.length} records</p>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-5">
                    {data.length === 0 ? (
                        <div className="text-center py-10">
                            <p className="text-muted">No records found for this segment.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-border-subtle text-xs uppercase tracking-wider text-muted">
                                        <th className="pb-3 px-4 font-semibold">Student Name</th>
                                        <th className="pb-3 px-4 font-semibold">Course</th>
                                        <th className="pb-3 px-4 font-semibold">Status</th>
                                        <th className="pb-3 px-4 font-semibold">Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.map((enrollment) => (
                                        <tr 
                                            key={enrollment.id} 
                                            className="border-b border-border-subtle/50 hover:bg-black/5 dark:hover:bg-white/5 transition-colors group"
                                        >
                                            <td className="py-3 px-4">
                                                <div className="font-medium text-primary flex items-center gap-2">
                                                    {enrollment.students?.first_name} {enrollment.students?.last_name}
                                                    {enrollment.is_priority && (
                                                        <span className="w-2 h-2 rounded-full bg-amber-500" title="Priority" />
                                                    )}
                                                </div>
                                                <div className="text-xs text-muted mt-0.5">{enrollment.students?.email}</div>
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="text-sm text-primary">{enrollment.courses?.name}</div>
                                                <div className="text-xs text-muted mt-0.5">
                                                    {cleanVariant(enrollment.courses?.name || '', enrollment.course_variant)}
                                                </div>
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${getStatusColor(enrollment.status)}`}>
                                                    {enrollment.status.charAt(0).toUpperCase() + enrollment.status.slice(1)}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-sm text-muted">
                                                {formatDateDMY(enrollment.created_at)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
