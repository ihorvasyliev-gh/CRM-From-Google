import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import {
    Undo2, Redo2, Bold, Italic, Underline, Strikethrough, Baseline, Highlighter,
    TextAlignStart, TextAlignCenter, TextAlignEnd, TextAlignJustify, List, ListOrdered,
    ListIndentIncrease, ListIndentDecrease, TextQuote, SeparatorHorizontal, Link, Unlink,
    Table, RemoveFormatting, BetweenHorizontalStart, BetweenHorizontalEnd, BetweenVerticalStart,
    BetweenVerticalEnd, TableCellsMerge, TableCellsSplit, PanelTop, Rows2, Columns2, Trash, X,
} from 'lucide-react';
import { EMAIL_FONTS, EMAIL_FONT_SIZES, EMAIL_LINE_HEIGHTS, primaryFontName, type EmailTextStyle } from '../../lib/emailFormat';

/** Email-friendly palette (hex only — Outlook ignores rgb()/named colours in some places). */
const PALETTE = [
    '#000000', '#1e293b', '#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#ffffff',
    '#7f1d1d', '#b91c1c', '#dc2626', '#ea580c', '#d97706', '#ca8a04', '#15803d', '#16a34a',
    '#0f766e', '#0369a1', '#0284c7', '#1d4ed8', '#4338ca', '#6d28d9', '#a21caf', '#be185d',
    '#fee2e2', '#ffedd5', '#fef9c3', '#dcfce7', '#cffafe', '#dbeafe', '#ede9fe', '#fce7f3',
];

const selectCls = 'h-7 max-w-[9.5rem] pl-2 pr-6 rounded-lg border border-border-subtle bg-surface text-xs text-primary cursor-pointer hover:border-border-strong focus:outline-hidden focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';

function Btn({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={active}
            disabled={disabled}
            // Keep the editor selection while clicking the toolbar
            onMouseDown={e => e.preventDefault()}
            onClick={onClick}
            className={`inline-flex items-center justify-center w-7 h-7 rounded-lg shrink-0 transition-colors disabled:opacity-35 disabled:pointer-events-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                active ? 'text-brand-600 dark:text-brand-400 bg-brand-500/12' : 'text-muted hover:text-primary hover:bg-surface-elevated'
            }`}
        >
            {children}
        </button>
    );
}

function TextBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
    return (
        <button
            type="button"
            title={label}
            disabled={disabled}
            onMouseDown={e => e.preventDefault()}
            onClick={onClick}
            className={`inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-medium shrink-0 transition-colors disabled:opacity-35 disabled:pointer-events-none ${
                danger ? 'text-status-rejected hover:bg-danger/10' : 'text-muted hover:text-primary hover:bg-surface-elevated'
            }`}
        >
            {children}
        </button>
    );
}

const Sep = () => <span className="w-px h-5 bg-border-subtle mx-0.5 shrink-0" aria-hidden />;

/** Small popover anchored under a toolbar button; closes on outside click or Escape. */
function Popover({ trigger, open, onOpenChange, children }: { trigger: ReactNode; open: boolean; onOpenChange: (o: boolean) => void; children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onOpenChange(false); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onOpenChange(false); } };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey, true);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey, true);
        };
    }, [open, onOpenChange]);
    return (
        <div ref={ref} className="relative">
            {trigger}
            {open && (
                <div className="absolute left-0 top-full mt-1 z-50 p-2.5 rounded-xl border border-border-subtle bg-surface shadow-float animate-popoverScaleIn">
                    {children}
                </div>
            )}
        </div>
    );
}

function ColorButton({ label, icon, value, onPick, onClear, clearLabel }: {
    label: string; icon: ReactNode; value: string; onPick: (c: string) => void; onClear: () => void; clearLabel: string;
}) {
    const [open, setOpen] = useState(false);
    const pick = (c: string) => { onPick(c); setOpen(false); };
    return (
        <Popover
            open={open}
            onOpenChange={setOpen}
            trigger={
                <button
                    type="button"
                    title={label}
                    aria-label={label}
                    aria-expanded={open}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => setOpen(o => !o)}
                    className="relative inline-flex flex-col items-center justify-center w-7 h-7 rounded-lg text-muted hover:text-primary hover:bg-surface-elevated"
                >
                    {icon}
                    <span className="absolute bottom-1 left-1.5 right-1.5 h-[3px] rounded-full border border-black/10" style={{ background: value || 'transparent' }} />
                </button>
            }
        >
            <div className="w-[212px] space-y-2">
                <div className="grid grid-cols-8 gap-1">
                    {PALETTE.map(c => (
                        <button
                            key={c}
                            type="button"
                            title={c}
                            aria-label={c}
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => pick(c)}
                            className={`w-5 h-5 rounded-md border ${value.toLowerCase() === c ? 'ring-2 ring-brand-500 ring-offset-1 ring-offset-surface' : ''} border-black/15 hover:scale-110 transition-transform`}
                            style={{ background: c }}
                        />
                    ))}
                </div>
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-border-subtle">
                    <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer">
                        <input
                            type="color"
                            value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
                            onChange={e => onPick(e.target.value)}
                            className="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer"
                        />
                        Custom…
                    </label>
                    <button
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => { onClear(); setOpen(false); }}
                        className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-primary"
                    >
                        <X size={12} /> {clearLabel}
                    </button>
                </div>
            </div>
        </Popover>
    );
}

function LinkButton({ editor, active, href }: { editor: Editor; active: boolean; href: string }) {
    const [open, setOpen] = useState(false);
    const [url, setUrl] = useState('');
    const apply = () => {
        const target = url.trim();
        if (!target) {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
        } else if (editor.state.selection.empty && !active) {
            // Nothing selected: insert the address itself as the link text
            editor.chain().focus().insertContent({ type: 'text', text: target, marks: [{ type: 'link', attrs: { href: target } }] }).run();
        } else {
            editor.chain().focus().extendMarkRange('link').setLink({ href: target }).run();
        }
        setOpen(false);
    };
    return (
        <Popover
            open={open}
            onOpenChange={setOpen}
            trigger={
                <Btn label={active ? 'Edit link' : 'Add link'} active={active} onClick={() => { setUrl(href); setOpen(o => !o); }}>
                    <Link size={15} />
                </Btn>
            }
        >
            <form
                className="flex items-center gap-1.5 w-[280px]"
                onSubmit={e => { e.preventDefault(); apply(); }}
            >
                <input
                    autoFocus
                    type="text"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="https://… or {statusLink}"
                    aria-label="Link address"
                    className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border border-border-subtle bg-surface text-xs text-primary focus:outline-hidden focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
                <button type="submit" className="h-8 px-2.5 rounded-lg bg-brand-500 text-white text-xs font-semibold hover:bg-brand-600">Apply</button>
            </form>
        </Popover>
    );
}

/** Formatting toolbar of the email editor. */
export default function EditorToolbar({ editor, textStyle }: { editor: Editor; textStyle: EmailTextStyle }) {
    const s = useEditorState({
        editor,
        selector: ({ editor: e }) => {
            const ts = e.getAttributes('textStyle');
            const block = e.isActive('heading', { level: 1 }) ? 'h1' : e.isActive('heading', { level: 2 }) ? 'h2' : e.isActive('heading', { level: 3 }) ? 'h3' : 'p';
            return {
                bold: e.isActive('bold'),
                italic: e.isActive('italic'),
                underline: e.isActive('underline'),
                strike: e.isActive('strike'),
                block,
                fontFamily: (ts.fontFamily as string) || '',
                fontSize: (ts.fontSize as string) || '',
                color: (ts.color as string) || '',
                background: (ts.backgroundColor as string) || '',
                align: (['center', 'right', 'justify'] as const).find(a => e.isActive({ textAlign: a })) || 'left',
                lineHeight: ((block === 'p' ? e.getAttributes('paragraph') : e.getAttributes('heading')).lineHeight as string) || '',
                bulletList: e.isActive('bulletList'),
                orderedList: e.isActive('orderedList'),
                inList: e.isActive('listItem'),
                blockquote: e.isActive('blockquote'),
                link: e.isActive('link'),
                href: (e.getAttributes('link').href as string) || '',
                inTable: e.isActive('table'),
                canUndo: e.can().undo(),
                canRedo: e.can().redo(),
                canMerge: e.can().mergeCells(),
                canSplit: e.can().splitCell(),
            };
        },
    });

    const chain = () => editor.chain().focus();

    // Font list: match the stack by its first family, so legacy stacks still show their name
    const fontValue = EMAIL_FONTS.find(f => primaryFontName(f.value) === primaryFontName(s.fontFamily))?.value ?? s.fontFamily;
    const baseFontLabel = EMAIL_FONTS.find(f => primaryFontName(f.value) === primaryFontName(textStyle.fontFamily))?.label ?? 'Default';
    const sizePx = /^\d+(\.\d+)?px$/.test(s.fontSize) ? String(Math.round(parseFloat(s.fontSize))) : s.fontSize;

    const setBlock = (v: string) => {
        if (v === 'p') chain().setParagraph().run();
        else chain().setHeading({ level: Number(v[1]) as 1 | 2 | 3 }).run();
    };
    const indent = (delta: 1 | -1) => {
        if (s.inList) {
            if (delta > 0) chain().sinkListItem('listItem').run();
            else chain().liftListItem('listItem').run();
        } else chain().changeIndent(delta).run();
    };

    return (
        <div className="sticky top-0 z-10 rounded-t-xl border-b border-border-subtle bg-surface-elevated/80 backdrop-blur-sm">
            <div className="flex flex-wrap items-center gap-0.5 px-1.5 py-1.5" role="toolbar" aria-label="Formatting">
                <Btn label="Undo (Ctrl+Z)" disabled={!s.canUndo} onClick={() => chain().undo().run()}><Undo2 size={15} /></Btn>
                <Btn label="Redo (Ctrl+Shift+Z)" disabled={!s.canRedo} onClick={() => chain().redo().run()}><Redo2 size={15} /></Btn>
                <Sep />
                <select aria-label="Text style" title="Text style" value={s.block} onChange={e => setBlock(e.target.value)} className={selectCls}>
                    <option value="p">Normal text</option>
                    <option value="h1">Heading 1</option>
                    <option value="h2">Heading 2</option>
                    <option value="h3">Heading 3</option>
                </select>
                <select
                    aria-label="Font"
                    title="Font"
                    value={fontValue}
                    onChange={e => (e.target.value ? chain().setFontFamily(e.target.value).run() : chain().unsetFontFamily().run())}
                    className={selectCls}
                    style={{ fontFamily: fontValue || textStyle.fontFamily }}
                >
                    <option value="">{baseFontLabel} (default)</option>
                    {EMAIL_FONTS.map(f => <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>)}
                    {fontValue && !EMAIL_FONTS.some(f => f.value === fontValue) && <option value={fontValue}>{primaryFontName(fontValue) || fontValue}</option>}
                </select>
                <select
                    aria-label="Font size"
                    title="Font size"
                    value={sizePx}
                    onChange={e => (e.target.value ? chain().setFontSize(`${e.target.value}px`).run() : chain().unsetFontSize().run())}
                    className={`${selectCls} w-[6.5rem]`}
                >
                    <option value="">{textStyle.fontSize} (default)</option>
                    {EMAIL_FONT_SIZES.map(n => <option key={n} value={String(n)}>{n}</option>)}
                    {sizePx && !EMAIL_FONT_SIZES.includes(Number(sizePx)) && <option value={sizePx}>{sizePx}</option>}
                </select>
                <Sep />
                <Btn label="Bold (Ctrl+B)" active={s.bold} onClick={() => chain().toggleBold().run()}><Bold size={15} /></Btn>
                <Btn label="Italic (Ctrl+I)" active={s.italic} onClick={() => chain().toggleItalic().run()}><Italic size={15} /></Btn>
                <Btn label="Underline (Ctrl+U)" active={s.underline} onClick={() => chain().toggleUnderline().run()}><Underline size={15} /></Btn>
                <Btn label="Strikethrough" active={s.strike} onClick={() => chain().toggleStrike().run()}><Strikethrough size={15} /></Btn>
                <ColorButton
                    label="Text colour"
                    icon={<Baseline size={15} className="-mt-1" />}
                    value={s.color}
                    onPick={c => chain().setColor(c).run()}
                    onClear={() => chain().unsetColor().run()}
                    clearLabel="Default"
                />
                <ColorButton
                    label="Highlight colour"
                    icon={<Highlighter size={15} className="-mt-1" />}
                    value={s.background}
                    onPick={c => chain().setBackgroundColor(c).run()}
                    onClear={() => chain().unsetBackgroundColor().run()}
                    clearLabel="None"
                />
                <Sep />
                <Btn label="Align left" active={s.align === 'left'} onClick={() => chain().unsetTextAlign().run()}><TextAlignStart size={15} /></Btn>
                <Btn label="Align centre" active={s.align === 'center'} onClick={() => chain().setTextAlign('center').run()}><TextAlignCenter size={15} /></Btn>
                <Btn label="Align right" active={s.align === 'right'} onClick={() => chain().setTextAlign('right').run()}><TextAlignEnd size={15} /></Btn>
                <Btn label="Justify" active={s.align === 'justify'} onClick={() => chain().setTextAlign('justify').run()}><TextAlignJustify size={15} /></Btn>
                <select
                    aria-label="Line spacing"
                    title="Line spacing"
                    value={s.lineHeight}
                    onChange={e => chain().setLineHeight(e.target.value || null).run()}
                    className={`${selectCls} w-[5.5rem]`}
                >
                    <option value="">↕ {textStyle.lineHeight}</option>
                    {EMAIL_LINE_HEIGHTS.map(n => <option key={n} value={String(n)}>↕ {n}</option>)}
                    {s.lineHeight && !EMAIL_LINE_HEIGHTS.map(String).includes(s.lineHeight) && <option value={s.lineHeight}>↕ {s.lineHeight}</option>}
                </select>
                <Sep />
                <Btn label="Bulleted list" active={s.bulletList} onClick={() => chain().toggleBulletList().run()}><List size={15} /></Btn>
                <Btn label="Numbered list" active={s.orderedList} onClick={() => chain().toggleOrderedList().run()}><ListOrdered size={15} /></Btn>
                <Btn label="Decrease indent" onClick={() => indent(-1)}><ListIndentDecrease size={15} /></Btn>
                <Btn label="Increase indent" onClick={() => indent(1)}><ListIndentIncrease size={15} /></Btn>
                <Sep />
                <Btn label="Quote" active={s.blockquote} onClick={() => chain().toggleBlockquote().run()}><TextQuote size={15} /></Btn>
                <Btn label="Divider line" onClick={() => chain().setHorizontalRule().run()}><SeparatorHorizontal size={15} /></Btn>
                <LinkButton editor={editor} active={s.link} href={s.href} />
                {s.link && <Btn label="Remove link" onClick={() => chain().extendMarkRange('link').unsetLink().run()}><Unlink size={15} /></Btn>}
                <Btn label="Insert table" active={s.inTable} onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table size={15} /></Btn>
                <Sep />
                <Btn label="Clear formatting" onClick={() => chain().unsetAllMarks().unsetTextAlign().clearBlockFormat().run()}><RemoveFormatting size={15} /></Btn>
            </div>

            {s.inTable && (
                <div className="flex flex-wrap items-center gap-0.5 px-1.5 pb-1.5 -mt-0.5" role="toolbar" aria-label="Table">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted px-1.5">Table</span>
                    <TextBtn label="Insert row above" onClick={() => chain().addRowBefore().run()}><BetweenHorizontalStart size={13} /> Row above</TextBtn>
                    <TextBtn label="Insert row below" onClick={() => chain().addRowAfter().run()}><BetweenHorizontalEnd size={13} /> Row below</TextBtn>
                    <TextBtn label="Insert column left" onClick={() => chain().addColumnBefore().run()}><BetweenVerticalStart size={13} /> Col left</TextBtn>
                    <TextBtn label="Insert column right" onClick={() => chain().addColumnAfter().run()}><BetweenVerticalEnd size={13} /> Col right</TextBtn>
                    <TextBtn label="Delete row" onClick={() => chain().deleteRow().run()}><Rows2 size={13} /> Delete row</TextBtn>
                    <TextBtn label="Delete column" onClick={() => chain().deleteColumn().run()}><Columns2 size={13} /> Delete col</TextBtn>
                    <TextBtn label="Toggle header row" onClick={() => chain().toggleHeaderRow().run()}><PanelTop size={13} /> Header</TextBtn>
                    <TextBtn label="Merge selected cells" disabled={!s.canMerge} onClick={() => chain().mergeCells().run()}><TableCellsMerge size={13} /> Merge</TextBtn>
                    <TextBtn label="Split cell" disabled={!s.canSplit} onClick={() => chain().splitCell().run()}><TableCellsSplit size={13} /> Split</TextBtn>
                    <TextBtn label="Delete table" danger onClick={() => chain().deleteTable().run()}><Trash size={13} /> Delete table</TextBtn>
                </div>
            )}
        </div>
    );
}
