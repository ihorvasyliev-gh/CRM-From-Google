import { Copy, FileCode2 } from 'lucide-react';
import CertificateTemplatesSection from '../CertificateTemplatesSection';
import Card from '../ui/Card';
import { copyText } from '../Viewer/viewerUtils';

const PLACEHOLDER_REFERENCE = [
    { tag: '{firstName}', desc: 'Learner first name' },
    { tag: '{lastName}', desc: 'Learner last name' },
    { tag: '{fullName}', desc: 'Auto-built from first & last name' },
    { tag: '{courseDate}', desc: 'Date the course was held' },
    { tag: '{courseMonth}', desc: 'Auto-derived month & year' },
    { tag: '{expire}', desc: 'Calculated from validity length' },
    { tag: '{certNo}', desc: 'Auto-incrementing certificate no.' },
    { tag: '{tutor}', desc: 'Tutor / trainer name' },
] as const;

export default function CertificatesTab() {
    return (
        <div className="space-y-4">
            <CertificateTemplatesSection id="settings-certificates" />

            <Card
                title="Word placeholder reference"
                subtitle="Place these tags anywhere inside a .docx template — click any tag to copy it"
                icon={FileCode2}
                tone="neutral"
                divided
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {PLACEHOLDER_REFERENCE.map(({ tag, desc }) => (
                        <button
                            key={tag}
                            type="button"
                            onClick={() => copyText(tag, tag)}
                            title={`Copy ${tag}`}
                            className="group flex items-start justify-between gap-2 p-2.5 rounded-xl bg-surface-elevated/50 border border-border-subtle hover:border-brand-500/40 hover:bg-brand-500/[0.04] text-left transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40"
                        >
                            <div className="min-w-0">
                                <code className="block text-xs font-mono font-semibold text-brand-600 dark:text-brand-400">
                                    {tag}
                                </code>
                                <span className="block text-xs text-muted mt-0.5 leading-snug">{desc}</span>
                            </div>
                            <Copy
                                size={12}
                                aria-hidden="true"
                                className="text-muted opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity shrink-0 mt-0.5"
                            />
                        </button>
                    ))}
                </div>
            </Card>
        </div>
    );
}
