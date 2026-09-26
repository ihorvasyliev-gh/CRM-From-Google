import { useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, UserMinus, X } from 'lucide-react';
import { IconButton } from '../ui/Button';
import { calloutCls } from '../ui/styles';
import type { GenerationResult } from '../../lib/documentUtils';

const SHOWN_FAILURES = 5;

/** What a generation run made and everything that went wrong, readable at any length. */
export default function GenerationReport({ result, fileName, onDismiss }: { result: GenerationResult; fileName: string; onDismiss: () => void }) {
    const [showAll, setShowAll] = useState(false);
    const failedExtras = result.extras.filter(x => !x.ok);
    const madeExtras = result.extras.filter(x => x.ok);
    const hasProblems = result.failedTemplates.length > 0 || result.failedDocs.length > 0 || failedExtras.length > 0;
    const hasWarnings = result.unknownTags.length > 0 || result.skipped.length > 0;
    const downloaded = result.totalDocs > 0 || madeExtras.length > 0;
    const tone = hasProblems ? 'danger' : hasWarnings ? 'warning' : 'success';
    const Icon = hasProblems ? AlertCircle : hasWarnings ? AlertTriangle : CheckCircle2;
    const iconCls = { danger: 'text-status-rejected', warning: 'text-status-requested', success: 'text-status-confirmed' }[tone];
    const failures = showAll ? result.failedDocs : result.failedDocs.slice(0, SHOWN_FAILURES);

    return (
        <div role="status" className={`${calloutCls[tone]} mt-4 p-3.5 text-xs`}>
            <div className="flex items-start gap-2.5">
                <Icon size={16} className={`${iconCls} shrink-0 mt-px`} />
                <div className="min-w-0 flex-1 space-y-2.5">
                    <div>
                        <p className="text-[13px] font-semibold text-primary">
                            {downloaded ? (hasProblems ? 'Downloaded, with problems' : 'Downloaded') : 'Nothing was generated'}
                        </p>
                        {downloaded && <p className="text-muted break-all">{fileName}</p>}
                    </div>

                    <ul className="space-y-0.5 text-primary">
                        <li>{result.totalDocs} document{result.totalDocs !== 1 ? 's' : ''} from {result.successTemplates.length}/{result.totalTemplates} Word template{result.totalTemplates !== 1 ? 's' : ''}</li>
                        {madeExtras.map(x => <li key={x.label}>{x.label}{x.files > 1 ? ` (${x.files} pages)` : ''}</li>)}
                    </ul>

                    {hasProblems && (
                        <div>
                            <p className="font-semibold text-status-rejected mb-1">Problems</p>
                            <ul className="space-y-1 list-disc pl-4">
                                {result.failedTemplates.map(f => <li key={f.name}><strong>{f.name}</strong>: {f.error}</li>)}
                                {failedExtras.map(x => <li key={x.label}><strong>{x.label}</strong>: {x.error}</li>)}
                                {failures.map((d, i) => <li key={`${d.template}-${d.student}-${i}`}><strong>{d.student}</strong> ({d.template}): {d.error}</li>)}
                            </ul>
                            {result.failedDocs.length > SHOWN_FAILURES && (
                                <button type="button" onClick={() => setShowAll(!showAll)} className="mt-1 font-semibold text-brand-600 dark:text-brand-400 hover:underline">
                                    {showAll ? 'Show fewer' : `Show all ${result.failedDocs.length} failed documents`}
                                </button>
                            )}
                        </div>
                    )}

                    {result.unknownTags.length > 0 && (
                        <div>
                            <p className="font-semibold text-status-requested mb-1">Printed blank — unknown placeholders</p>
                            <ul className="space-y-0.5 list-disc pl-4">
                                {result.unknownTags.map(u => (
                                    <li key={u.template}>
                                        <strong>{u.template}</strong>: {u.tags.map(t => <code key={t} className="font-mono mr-1">{`{${t}}`}</code>)}
                                    </li>
                                ))}
                            </ul>
                            <p className="text-muted mt-1">Fix the spelling in Word, or add them under Custom variables.</p>
                        </div>
                    )}

                    {result.skipped.length > 0 && (
                        <p className="flex items-start gap-1.5">
                            <UserMinus size={13} className="shrink-0 mt-px text-status-requested" />
                            <span>
                                Left out {result.skipped.length} whose enrollment changed since the list was loaded: {result.skipped.join(', ')}. The list has been refreshed.
                            </span>
                        </p>
                    )}
                </div>
                <IconButton size="sm" label="Dismiss report" onClick={onDismiss} className="-mt-1 -mr-1">
                    <X size={14} />
                </IconButton>
            </div>
        </div>
    );
}
