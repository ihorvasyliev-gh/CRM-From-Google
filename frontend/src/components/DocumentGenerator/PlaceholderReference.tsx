import { useState } from 'react';
import { Braces, ChevronDown, Info } from 'lucide-react';
import Card from '../ui/Card';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/Tabs';
import { eyebrowCls } from '../ui/styles';
import { PlaceholderButton } from './shared';
import {
    ATTENDANCE_SLOTS, LABEL_SLOTS, PLACEHOLDER_CATEGORIES, SHEET_LOOP, SHEET_PLACEHOLDER_CATEGORIES,
} from '../../lib/documentUtils';
import type { TemplateVariable } from '../../lib/types';

type Tab = 'documents' | 'sheets';

/** Every placeholder a template can use, by template type. Click one to copy it. */
export default function PlaceholderReference({ customVars }: { customVars: TemplateVariable[] }) {
    const [open, setOpen] = useState(true);
    const [tab, setTab] = useState<Tab>('documents');
    const categories = tab === 'documents' ? PLACEHOLDER_CATEGORIES : SHEET_PLACEHOLDER_CATEGORIES;

    return (
        <Card
            title="Available variables"
            subtitle="Click a placeholder to copy it, then paste it into your Word template"
            icon={Braces}
            divided={open}
            action={
                <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>
                    {open ? 'Hide' : 'Show'}
                    <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                </Button>
            }
            bodyClassName={open ? '' : 'p-0!'}
        >
            {open && (
                <div className="space-y-4">
                    <Segmented<Tab>
                        ariaLabel="Template type"
                        value={tab}
                        onChange={setTab}
                        options={[
                            { value: 'documents', label: 'Word documents (per student)' },
                            { value: 'sheets', label: 'Attendance sheet & labels' },
                        ]}
                    />
                    {tab === 'sheets' && (
                        <p className="text-[11px] text-muted flex items-start gap-1.5">
                            <Info size={13} className="shrink-0 mt-px" />
                            <span>
                                Numbered slots go up to {ATTENDANCE_SLOTS} on the attendance sheet and {LABEL_SLOTS} on labels ({'{fullName1}'} … {`{fullName${ATTENDANCE_SLOTS}}`});
                                bigger groups continue on extra pages. Or repeat one table row for everyone with{' '}
                                <code className="font-mono text-primary">{`{#${SHEET_LOOP}}{n}. {fullName}{/${SHEET_LOOP}}`}</code>.
                            </span>
                        </p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                        {categories.map(cat => (
                            <div key={cat.title}>
                                <p className={`${eyebrowCls} mb-2`}>{cat.title}</p>
                                <div className="space-y-1">
                                    {cat.items.map(item => <PlaceholderButton key={item.key} tag={item.key} desc={item.desc} />)}
                                </div>
                            </div>
                        ))}
                        {customVars.length > 0 && (
                            <div>
                                <p className={`${eyebrowCls} mb-2`}>Custom Variables</p>
                                <div className="space-y-1">
                                    {customVars.map(v => (
                                        <PlaceholderButton key={v.id} tag={v.var_key} tone="custom" desc={v.var_value || <em>empty</em>} />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </Card>
    );
}
