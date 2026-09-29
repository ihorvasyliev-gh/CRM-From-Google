import { useEffect, useImperativeHandle, useMemo, useRef, type CSSProperties, type Ref } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Selection } from '@tiptap/pm/state';
import { createEmailExtensions } from './extensions';
import EditorToolbar from './EditorToolbar';
import { lineHeightPx, prepareEditorHtml, type EmailTextStyle } from '../../lib/emailFormat';

export interface EmailEditorHandle {
    /**
     * Insert a {placeholder} at the cursor (at the end if the editor was never focused).
     * Block placeholders (cards, buttons) go on a line of their own.
     */
    insertTag: (tag: string, options?: { block?: boolean }) => void;
    focus: () => void;
}

interface Props {
    value: string;
    /** Called on every edit made in the editor (not when `value` is replaced from outside). */
    onChange: (html: string) => void;
    /** Base text style of the email, so the editor looks like the sent message. */
    textStyle: EmailTextStyle;
    /** 'card': text inside the course card of invitations (tighter paragraphs and lists) */
    variant?: 'email' | 'card';
    placeholder?: string;
    /** Editable area height limits, px */
    minHeight?: number;
    maxHeight?: number;
    ariaLabel?: string;
    ref?: Ref<EmailEditorHandle>;
}

/** Rich-text editor for email templates: fonts, sizes, colours, alignment, lists, tables… */
export default function EmailEditor({ value, onChange, textStyle, variant = 'email', placeholder, minHeight = 160, maxHeight = 480, ariaLabel = 'Email body', ref }: Props) {
    const onChangeRef = useRef(onChange);
    useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
    // Last HTML this editor produced (or was given), to tell outside changes from our own echo
    const lastHtml = useRef(value);
    const everFocused = useRef(false);

    const editor = useEditor({
        extensions: createEmailExtensions(placeholder),
        content: prepareEditorHtml(value),
        editorProps: {
            attributes: { class: `email-editor-content${variant === 'card' ? ' email-editor-card' : ''}`, role: 'textbox', 'aria-multiline': 'true', 'aria-label': ariaLabel },
        },
        onFocus: () => { everFocused.current = true; },
        onUpdate: ({ editor: e }) => {
            const html = e.getHTML();
            lastHtml.current = html;
            onChangeRef.current(html);
        },
    });

    // The value was replaced from outside (reset to defaults, another template loaded)
    useEffect(() => {
        if (!editor || value === lastHtml.current) return;
        lastHtml.current = value;
        editor.commands.setContent(prepareEditorHtml(value), { emitUpdate: false });
    }, [editor, value]);

    useImperativeHandle(ref, () => ({
        insertTag: (tag, options) => {
            if (!editor) return;
            const { doc, selection } = editor.state;
            // Before the first click into the editor the cursor sits at the very start
            const sel = everFocused.current ? selection : Selection.atEnd(doc);
            const $from = sel.$from;
            const lineIsEmpty = $from.parent.isTextblock && $from.parent.content.size === 0;
            if (options?.block && !lineIsEmpty) {
                // A line of its own, after the current top-level block
                editor.chain().focus().insertContentAt($from.after(1), { type: 'paragraph', content: [{ type: 'text', text: tag }] }).run();
            } else {
                editor.chain().focus().insertContentAt({ from: sel.from, to: sel.to }, tag).run();
            }
        },
        focus: () => { editor?.commands.focus(); },
    }), [editor]);

    const cssVars = useMemo(() => ({
        '--ee-font': textStyle.fontFamily,
        '--ee-size': `${textStyle.fontSize}px`,
        '--ee-color': textStyle.textColor,
        '--ee-lh': `${lineHeightPx(textStyle)}px`,
        '--ee-min-h': `${minHeight}px`,
        '--ee-max-h': `${maxHeight}px`,
    }) as CSSProperties, [textStyle, minHeight, maxHeight]);

    return (
        <div className="email-editor w-full bg-surface border border-border-subtle rounded-xl focus-within:ring-2 focus-within:ring-brand-500/20 focus-within:border-brand-500 transition-colors" style={cssVars}>
            {editor && <EditorToolbar editor={editor} textStyle={textStyle} />}
            <EditorContent editor={editor} className="email-editor-scroll rounded-b-xl" />
        </div>
    );
}
