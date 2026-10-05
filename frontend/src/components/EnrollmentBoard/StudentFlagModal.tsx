import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { StudentFlag } from '../../lib/types';

interface StudentFlagModalProps {
    target: { studentId: string; studentName: string } | null;
    flags: StudentFlag[];
    courses: { id: string; name: string }[];
    onAddFlag: (courseId: string, comment: string) => void;
    onRemoveFlag: (flagId: string) => void;
    onClose: () => void;
}

/** Flags a student as not having passed a course (with a comment), and lists or removes the existing flags. */
export default function StudentFlagModal({ target, flags, courses, onAddFlag, onRemoveFlag, onClose }: StudentFlagModalProps) {
    // Mounted per opening, so the form starts empty each time
    const [flagCourseId, setFlagCourseId] = useState('');
    const [flagComment, setFlagComment] = useState('');
    if (!target) return null;
    return (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/40 backdrop-blur-xs animate-fadeIn" onClick={() => onClose()}>
            <div
                className="bg-surface rounded-2xl shadow-float border border-border-subtle p-6 w-full max-w-md mx-4 animate-scaleIn"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center gap-3 mb-5">
                    <div className="p-2.5 bg-orange-500/10 rounded-xl text-orange-500">
                        <AlertTriangle size={22} />
                    </div>
                    <div>
                        <h3 className="font-bold text-primary">Student Flags</h3>
                        <p className="text-xs text-muted mt-0.5">
                            Manage flags for {target.studentName}
                        </p>
                    </div>
                </div>

                {/* Existing flags */}
                {(() => {
                    const existing = flags;
                    if (existing.length === 0) return null;
                    return (
                        <div className="mb-5">
                            <label className="block text-xs font-medium text-muted mb-2">Existing flags</label>
                            <div className="space-y-1.5">
                                {existing.map(flag => (
                                    <div key={flag.id} className="flex items-start gap-2 bg-orange-500/5 border border-orange-500/20 rounded-lg px-3 py-2">
                                        <AlertTriangle size={13} className="text-orange-400 mt-0.5 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold text-primary">{flag.courses?.name || 'Unknown course'}</p>
                                            {flag.comment && (
                                                <p className="text-[11px] text-muted mt-0.5">{flag.comment}</p>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => onRemoveFlag(flag.id)}
                                            className="p-1 text-muted hover:text-red-500 hover:bg-red-500/10 rounded-md transition-all shrink-0"
                                            aria-label="Remove flag"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })()}

                {/* Add new flag */}
                <div className="border-t border-border-subtle pt-4">
                    <label className="block text-xs font-medium text-muted mb-2">Add new flag</label>
                    <select
                        id="flag-course"
                        name="flagCourse"
                        value={flagCourseId}
                        onChange={e => setFlagCourseId(e.target.value)}
                        className="w-full px-4 py-2.5 border border-border-subtle rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 bg-surface mb-2"
                    >
                        <option value="">Select course...</option>
                        {courses.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>

                    <textarea
                        id="flag-comment"
                        name="flagComment"
                        value={flagComment}
                        onChange={e => setFlagComment(e.target.value)}
                        placeholder="Reason (optional)..."
                        className="w-full px-4 py-3 border border-border-subtle rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 bg-surface min-h-[80px] resize-none"
                    />

                    <div className="flex gap-3 mt-4">
                        <button
                            onClick={() => onClose()}
                            className="flex-1 px-4 py-2.5 text-sm font-medium text-muted hover:text-primary bg-surface-elevated hover:bg-surface border border-border-subtle rounded-xl transition-all"
                        >
                            Close
                        </button>
                        <button
                            onClick={() => {
                                if (!flagCourseId) return;
                                onAddFlag(flagCourseId, flagComment);
                                setFlagCourseId('');
                                setFlagComment('');
                            }}
                            disabled={!flagCourseId}
                            className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-xl transition-all shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Add Flag
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
