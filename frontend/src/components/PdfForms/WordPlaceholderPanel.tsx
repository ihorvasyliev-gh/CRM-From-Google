import { useState } from 'react';
import { AlertTriangle, Braces, ChevronDown, MousePointerClick, Wand2 } from 'lucide-react';
import Card from '../ui/Card';
import { Button } from '../ui/Button';
import { eyebrowCls } from '../ui/styles';
import { PLACEHOLDER_CATEGORIES } from '../../lib/documentRender';
import type { TemplateVariable } from '../../lib/types';

interface WordPlaceholderPanelProps {
    /** The blank being typed into: a placeholder clicked here goes into it */
    active: { label: string } | null;
    onInsert: (tag: string) => void;
    /** Custom variables from Documents ({expire}…) */
    customVars: TemplateVariable[];
    /** How many blanks have a placeholder to suggest */
    suggestions: number;
    onSuggest: () => void;
    problems: { unknown: string[]; broken: string[] };
}

/** The Documents placeholders, to put in the form's blanks */
export default function WordPlaceholderPanel({ active, onInsert, customVars, suggestions, onSuggest, problems }: WordPlaceholderPanelProps) {
    const [open, setOpen] = useState<Record<string, boolean>>({ [PLACEHOLDER_CATEGORIES[0].title]: true });
    const categories = [
        ...PLACEHOLDER_CATEGORIES,
        ...(customVars.length ? [{ title: 'Custom variables', items: customVars.map(v => ({ key: v.var_key, desc: v.kind === 'date' ? 'Date (custom)' : v.var_value || 'Custom' })) }] : []),
    ];

    return (
        <Card title="Placeholders" icon={Braces} subtitle="Filled in by Documents for each student">
            <p className="text-xs text-muted mb-3 flex gap-1.5">
                <MousePointerClick size={13} className="shrink-0 mt-px" />
                {active ? (
                    <span>
                        Click a placeholder to put it in <b className="text-primary">{active.label || 'this blank'}</b>.
                    </span>
                ) : (
                    <span>Click a blank on the form, then a placeholder here. You can also type one, e.g. {'{firstName}'}.</span>
                )}
            </p>

            {suggestions > 0 && (
                <Button variant="brand-soft" size="sm" className="w-full mb-3" onClick={onSuggest} title="Put the matching placeholder in every blank whose label says what it is">
                    <Wand2 size={13} /> Suggest placeholders ({suggestions})
                </Button>
            )}

            {(problems.unknown.length > 0 || problems.broken.length > 0) && (
                <div role="alert" className="mb-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-primary space-y-1">
                    {problems.unknown.length > 0 && (
                        <p className="flex gap-1.5">
                            <AlertTriangle size={13} className="shrink-0 mt-px text-warning" />
                            <span>Documents doesn’t know {problems.unknown.map(t => `{${t}}`).join(', ')}: it will print nothing there.</span>
                        </p>
                    )}
                    {problems.broken.length > 0 && (
                        <p className="flex gap-1.5">
                            <AlertTriangle size={13} className="shrink-0 mt-px text-warning" />
                            <span>A brace is missing in: {problems.broken.join(', ')}. Documents will refuse the template.</span>
                        </p>
                    )}
                </div>
            )}

            <div className="space-y-1">
                {categories.map(cat => {
                    const shown = open[cat.title] ?? false;
                    return (
                        <div key={cat.title}>
                            <button
                                type="button"
                                onClick={() => setOpen(o => ({ ...o, [cat.title]: !shown }))}
                                aria-expanded={shown}
                                className={`w-full flex items-center justify-between py-1.5 ${eyebrowCls}`}
                            >
                                {cat.title}
                                <ChevronDown size={13} className={`transition-transform ${shown ? 'rotate-180' : ''}`} />
                            </button>
                            {shown && (
                                <ul className="pb-2">
                                    {cat.items.map(item => (
                                        <li key={item.key}>
                                            <button
                                                type="button"
                                                // Keep the blank focused, so the placeholder lands where its cursor is
                                                onMouseDown={e => e.preventDefault()}
                                                onClick={() => onInsert(item.key)}
                                                title={`Put {${item.key}} in the blank`}
                                                className="w-full flex items-center gap-2 text-left text-[13px] px-1.5 py-1 -mx-1.5 rounded-lg hover:bg-surface-elevated transition-colors"
                                            >
                                                <code className="text-brand-600 dark:text-brand-400 bg-brand-500/10 px-1.5 py-0.5 rounded-sm font-mono text-xs shrink-0">{`{${item.key}}`}</code>
                                                <span className="text-muted truncate">{item.desc}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}
