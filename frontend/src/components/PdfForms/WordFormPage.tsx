import { memo, type MouseEvent } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Check, Link2, X } from 'lucide-react';
import { PdfPage } from './pdfView';
import { rectStyle } from './pdfHooks';
import { CRM_LABELS, type FieldDef, type FieldValues } from '../../lib/pdfToDocx/fields';
import { DEFAULT_VALUE_SIZE, fitSize } from '../../lib/pdfToDocx/fill';

interface WordFormPageProps {
    doc: PDFDocumentProxy;
    page: number;
    size: { w: number; h: number };
    width: number;
    fields: FieldDef[];
    values: FieldValues;
    mark: 'tick' | 'cross';
    /** Show where every field is, even empty ones */
    outlines: boolean;
    /** Fields can be removed, and a click on the page adds one */
    editing: boolean;
    onChange: (id: string, value: string | boolean) => void;
    onRemove: (id: string) => void;
    /** A click on the page while editing, in PDF points (origin bottom-left) */
    onAddAt: (page: number, x: number, y: number) => void;
}

/** One page of the converted form, with every field ready to type into or tick */
function WordFormPage({ doc, page, size, width, fields, values, mark, outlines, editing, onChange, onRemove, onAddAt }: WordFormPageProps) {
    const onPageClick = (e: MouseEvent<HTMLDivElement>, scale: number) => {
        if (!editing || e.target !== e.currentTarget) return;
        const box = e.currentTarget.getBoundingClientRect();
        onAddAt(page, (e.clientX - box.left) / scale, size.h - (e.clientY - box.top) / scale);
    };

    return (
        <PdfPage
            doc={doc}
            page={page}
            size={size}
            width={width}
            className="mx-auto"
            overlay={scale => (
                <div
                    className={`absolute inset-0 ${editing ? 'cursor-crosshair' : ''}`}
                    onClick={e => onPageClick(e, scale)}
                    data-testid={`word-page-${page}`}
                >
                    {fields.map(f => {
                        const style = rectStyle(f.rect, scale, size.h);
                        const title = f.kind === 'text' && f.crm ? `${f.label} · from the CRM: ${CRM_LABELS[f.crm]}` : f.label;
                        const remove = editing && (
                            <button
                                type="button"
                                onClick={() => onRemove(f.id)}
                                aria-label={`Remove the field “${f.label || 'field'}”`}
                                title="Remove this field"
                                className="absolute -top-2 -right-2 z-10 w-4 h-4 rounded-full bg-danger text-white flex items-center justify-center shadow"
                            >
                                <X size={10} />
                            </button>
                        );
                        if (f.kind === 'check') {
                            const on = values[f.id] === true;
                            return (
                                <div key={f.id} className="absolute" style={style}>
                                    <button
                                        type="button"
                                        role="checkbox"
                                        aria-checked={on}
                                        aria-label={f.label || 'Checkbox'}
                                        title={f.label}
                                        onClick={() => onChange(f.id, !on)}
                                        className={`absolute inset-0 flex items-center justify-center rounded-[1px] transition-colors ${
                                            on ? 'text-[#0d0d1a]' : outlines || editing ? 'bg-brand-500/15 hover:bg-brand-500/30' : 'hover:bg-brand-500/20'
                                        }`}
                                    >
                                        {on && (mark === 'cross' ? <X size={Math.max(8, f.rect.h * scale)} strokeWidth={3} /> : <Check size={Math.max(8, f.rect.h * scale)} strokeWidth={3} />)}
                                    </button>
                                    {remove}
                                </div>
                            );
                        }
                        const value = typeof values[f.id] === 'string' ? (values[f.id] as string) : '';
                        const fontSize = fitSize(value, f.rect.w, f.rect.h, f.multiline, DEFAULT_VALUE_SIZE) * scale;
                        const common = {
                            value,
                            'aria-label': f.label || 'Answer',
                            title,
                            placeholder: editing || outlines ? f.label : '',
                            className: `absolute inset-0 w-full h-full bg-transparent text-[#0d0d1a] placeholder:text-brand-600/50 border-0 outline-none rounded-[2px] px-[1px] ${
                                f.align === 'center' ? 'text-center' : ''
                            } ${outlines || editing ? 'bg-brand-500/8 ring-1 ring-brand-500/35' : 'hover:bg-brand-500/8'} focus:bg-white/80 focus:ring-2 focus:ring-brand-500`,
                            style: { fontSize, lineHeight: 1.15, fontFamily: 'Arial, Arimo, "Liberation Sans", sans-serif' },
                        };
                        return (
                            <div key={f.id} className="absolute" style={style}>
                                {f.multiline ? (
                                    <textarea {...common} onChange={e => onChange(f.id, e.target.value)} className={`${common.className} resize-none leading-tight`} />
                                ) : (
                                    <input type="text" {...common} onChange={e => onChange(f.id, e.target.value)} />
                                )}
                                {f.crm && (outlines || editing) && (
                                    <span className="pointer-events-none absolute -top-1.5 -left-1.5 w-3.5 h-3.5 rounded-full bg-brand-500 text-white flex items-center justify-center" aria-hidden>
                                        <Link2 size={8} />
                                    </span>
                                )}
                                {remove}
                            </div>
                        );
                    })}
                </div>
            )}
        />
    );
}

export default memo(WordFormPage);
