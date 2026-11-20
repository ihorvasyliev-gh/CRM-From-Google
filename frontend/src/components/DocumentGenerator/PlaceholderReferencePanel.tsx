import { useEffect, useMemo, useRef, useState } from 'react';
import { Braces, Check, Copy, Info, Search, Settings2 } from 'lucide-react';
import Card from '../ui/Card';
import { Button } from '../ui/Button';
import SearchInput from '../ui/SearchInput';
import { Segmented } from '../ui/Tabs';
import { EmptyState } from '../ui/States';
import { eyebrowCls, panelCls } from '../ui/styles';
import { PlaceholderButton } from './shared';
import { variableSummary } from './helpers';
import { copyText } from '../Viewer/viewerUtils';
import {
    ATTENDANCE_SLOTS, LABEL_SLOTS, PLACEHOLDER_CATEGORIES, SHEET_LOOP, SHEET_PLACEHOLDER_CATEGORIES,
    SICAP_PAGE_LOOP, SICAP_PLACEHOLDER_CATEGORIES, SICAP_SLOTS,
} from '../../lib/documentUtils';
import type { TemplateVariable } from '../../lib/types';

type Tab = 'documents' | 'sheets' | 'sicap';

export interface PlaceholderReferencePanelProps {
    customVars: TemplateVariable[];
    onOpenSettingsGeneral?: () => void;
}

function LoopSnippetCard({
    title,
    hint,
    displaySnippet,
    copySnippet,
}: {
    title: string;
    hint: string;
    displaySnippet: string;
    copySnippet: string;
}) {
    const [copied, setCopied] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (timerRef.current) clearTimeout(timerRef.current);
    }, []);

    async function handleCopy() {
        const ok = await copyText(copySnippet, title);
        if (!ok) return;
        setCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), 1500);
    }

    return (
        <div className={`${panelCls} p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
            <div className="min-w-0 space-y-1">
                <p className="text-xs font-semibold text-primary">{title}</p>
                <p className="text-xs text-muted">{hint}</p>
                <pre className="mt-1.5 inline-block max-w-full overflow-x-auto rounded-lg bg-surface border border-border-subtle px-2.5 py-1.5 font-mono text-xs text-brand-600 dark:text-brand-400">
                    {displaySnippet}
                </pre>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void handleCopy()} className="self-start sm:self-center shrink-0">
                {copied ? (
                    <>
                        <Check size={13} className="text-status-confirmed" />
                        <span className="text-status-confirmed">Copied</span>
                    </>
                ) : (
                    <>
                        <Copy size={13} />
                        Copy
                    </>
                )}
            </Button>
        </div>
    );
}

/** Searchable catalogue of every built-in and custom placeholder, grouped by template type. */
export default function PlaceholderReferencePanel({ customVars, onOpenSettingsGeneral }: PlaceholderReferencePanelProps) {
    const [tab, setTab] = useState<Tab>('documents');
    const [query, setQuery] = useState('');

    const q = query.trim().toLowerCase();

    const filteredCategories = useMemo(() => {
        const base = {
            documents: PLACEHOLDER_CATEGORIES,
            sheets: SHEET_PLACEHOLDER_CATEGORIES,
            sicap: SICAP_PLACEHOLDER_CATEGORIES,
        }[tab];
        if (!q) return base;
        return base
            .map(cat => ({
                ...cat,
                items: cat.items.filter(
                    item => item.key.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q),
                ),
            }))
            .filter(cat => cat.items.length > 0);
    }, [tab, q]);

    const filteredCustomVars = useMemo(() => {
        if (!q) return customVars;
        return customVars.filter(v => {
            const summary = variableSummary(v).toLowerCase();
            return v.var_key.toLowerCase().includes(q) || summary.includes(q);
        });
    }, [customVars, q]);

    const hasMatches = filteredCategories.length > 0 || filteredCustomVars.length > 0;

    return (
        <Card
            title="Available variables"
            subtitle="Click a placeholder to copy it, then paste it into your Word template"
            icon={Braces}
            tone="brand"
            divided
        >
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <Segmented<Tab>
                        ariaLabel="Template type"
                        value={tab}
                        onChange={setTab}
                        options={[
                            { value: 'documents', label: 'Word documents' },
                            { value: 'sheets', label: 'Attendance & labels' },
                            { value: 'sicap', label: 'SICAP course form' },
                        ]}
                    />
                    <SearchInput
                        wrapperClassName="w-full sm:w-64"
                        className="h-9!"
                        placeholder="Filter placeholders…"
                        aria-label="Filter placeholders"
                        value={query}
                        onChange={setQuery}
                    />
                </div>

                {tab === 'sheets' && (
                    <LoopSnippetCard
                        title="Repeating table row loop"
                        hint={`Numbered slots run up to ${ATTENDANCE_SLOTS} on attendance sheets and ${LABEL_SLOTS} on labels (overflow adds pages). Or repeat one table row for every participant:`}
                        displaySnippet={`{#${SHEET_LOOP}}{n}. {fullName}{/${SHEET_LOOP}}`}
                        copySnippet={`{#${SHEET_LOOP}}{n}. {fullName}{/${SHEET_LOOP}}`}
                    />
                )}

                {tab === 'sicap' && (
                    <LoopSnippetCard
                        title="Participant page loop"
                        hint={`One form per course date. Wrap the participant page between these tags (each on its own line) to repeat for every ${SICAP_SLOTS} participants using {fullName1} … {fullName${SICAP_SLOTS}}:`}
                        displaySnippet={`{#${SICAP_PAGE_LOOP}}…{/${SICAP_PAGE_LOOP}}`}
                        copySnippet={`{#${SICAP_PAGE_LOOP}}\n\n{/${SICAP_PAGE_LOOP}}`}
                    />
                )}

                {hasMatches ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                        {filteredCategories.map(cat => (
                            <div key={cat.title}>
                                <p className={`${eyebrowCls} mb-2`}>{cat.title}</p>
                                <div className="space-y-1">
                                    {cat.items.map(item => (
                                        <PlaceholderButton key={item.key} tag={item.key} desc={item.desc} />
                                    ))}
                                </div>
                            </div>
                        ))}
                        {filteredCustomVars.length > 0 && (
                            <div>
                                <p className={`${eyebrowCls} mb-2`}>Custom Variables</p>
                                <div className="space-y-1">
                                    {filteredCustomVars.map(v => (
                                        <PlaceholderButton
                                            key={v.id}
                                            tag={v.var_key}
                                            tone="custom"
                                            desc={variableSummary(v) || <em>empty</em>}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <EmptyState
                        bare
                        icon={<Search size={20} />}
                        title="No matching placeholders"
                        description={`Nothing in this template type matches "${query.trim()}".`}
                        action={
                            <Button variant="secondary" size="sm" onClick={() => setQuery('')}>
                                Clear filter
                            </Button>
                        }
                    />
                )}

                {/* Compact {staffName} info bar */}
                <div className={`${panelCls} px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted`}>
                    <span className="flex items-center gap-1.5 min-w-0">
                        <Info size={13} className="shrink-0 text-brand-600 dark:text-brand-400" />
                        <span>
                            <code className="text-brand-600 dark:text-brand-400 bg-brand-500/10 px-1.5 py-0.5 rounded-sm font-mono">{'{staffName}'}</code>{' '}
                            uses the signed-in staff member&apos;s display name.
                        </span>
                    </span>
                    {onOpenSettingsGeneral && (
                        <Button variant="ghost" size="sm" onClick={onOpenSettingsGeneral} className="h-7! text-xs text-brand-600 dark:text-brand-400">
                            <Settings2 size={13} />
                            Set in Settings → General
                        </Button>
                    )}
                </div>
            </div>
        </Card>
    );
}
