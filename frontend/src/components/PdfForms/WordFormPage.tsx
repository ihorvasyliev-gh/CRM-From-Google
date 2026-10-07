import { memo, type MouseEvent, type SyntheticEvent } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Check, X } from 'lucide-react';
import { PdfPage } from './pdfView';
import { rectStyle } from './pdfHooks';
import type { FieldDef, FieldValues } from '../../lib/pdfToDocx/fields';
import { valueSize } from '../../lib/pdfToDocx/fill';

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
    /** Where the cursor is in a blank, so a placeholder can go there */
    onCursor: (id: string, start: number, end: number) => void;
}

const HAS_PLACEHOLDER = /\{[^{}]+\}/;

/** One page of the converted form, with every field ready to type into or tick */
function WordFormPage({ doc, page, size, width, fields, values, mark, outlines, editing, onChange, onRemove, onAddAt, onCursor }: WordFormPageProps) {
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
                        const title = f.label;
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
                        const fontSize = valueSize(value, f) * scale;
                        const cursor = (e: SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                            onCursor(f.id, e.currentTarget.selectionStart ?? value.length, e.currentTarget.selectionEnd ?? value.length);
                        // A filled-in date blank ("__/__/20__") is not printed under the date in the Word file
                        const covers = !!f.blank && !!value.trim();
                        const common = {
                            value,
                            'aria-label': f.label || 'Answer',
                            title,
                            placeholder: editing || outlines ? (f.placeholder ? `${f.label} · {${f.placeholder}}` : f.label) : '',
                            onFocus: cursor,
                            onSelect: cursor,
                            onKeyUp: cursor,
                            onClick: cursor,
                            className: `absolute inset-0 w-full h-full ${covers ? 'bg-white' : 'bg-transparent'} ${HAS_PLACEHOLDER.test(value) ? 'text-brand-700' : 'text-[#0d0d1a]'} placeholder:text-brand-600/50 border-0 outline-none rounded-[2px] px-[1px] ${
                                f.align === 'center' ? 'text-center' : ''
                            } ${outlines || editing ? `${covers ? '' : 'bg-brand-500/8 '}ring-1 ring-brand-500/35` : 'hover:bg-brand-500/8'} focus:bg-white/80 focus:ring-2 focus:ring-brand-500`,
                            style: { fontSize, lineHeight: 1.15, fontFamily: 'Arial, Arimo, "Liberation Sans", sans-serif' },
                        };
                        return (
                            <div key={f.id} className="absolute" style={style}>
                                {covers && f.blank && (
                                    // The printed blank under a filled-in date is left out of the Word file: hide it here too
                                    <div
                                        aria-hidden
                                        className="absolute bg-white pointer-events-none"
                                        style={{ ...rectStyle(f.blank, scale, size.h), left: (f.blank.x - f.rect.x) * scale, top: (f.rect.y + f.rect.h - f.blank.y - f.blank.h) * scale }}
                                    />
                                )}
                                {f.multiline ? (
                                    <textarea {...common} onChange={e => onChange(f.id, e.target.value)} className={`${common.className} resize-none leading-tight`} />
                                ) : (
                                    <input type="text" {...common} onChange={e => onChange(f.id, e.target.value)} />
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
