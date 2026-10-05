import { Extension, type Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle, Color, BackgroundColor, FontFamily, FontSize } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

const BLOCK_TYPES = ['paragraph', 'heading'];
/** Blocks whose own inline styles (margins, sizes, colours of the old templates) are kept as-is. */
const STYLED_TYPES = ['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'blockquote'];
/** Handled by dedicated paragraph/heading attributes (alignment, line height, indent) — not kept in their blockStyle. */
const OWN_PROPS = new Set(['text-align', 'line-height', 'margin-left']);
const INDENT_PX = 24;
const MAX_INDENT = 8;

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        blockFormat: {
            /** Line height of the selected paragraphs/headings, e.g. '1.5' (null = email default) */
            setLineHeight: (lineHeight: string | null) => ReturnType;
            /** Shift the selected paragraphs/headings right (+1) or left (-1) */
            changeIndent: (delta: 1 | -1) => ReturnType;
            /** Drop line height, indent and any other paragraph-level styles of the selection */
            clearBlockFormat: () => ReturnType;
        };
    }
}

/**
 * Block-level formatting stored as inline styles: line height and left indent on <p>/<h*>, plus
 * whatever other inline style a paragraph or list already had, so templates round-trip unchanged.
 */
const BlockFormat = Extension.create({
    name: 'blockFormat',

    addGlobalAttributes() {
        return [{
            types: STYLED_TYPES,
            attributes: {
                // Declared first so the dedicated attributes below win over a `margin` shorthand
                blockStyle: {
                    default: null,
                    parseHTML: el => {
                        // Paragraphs/headings have dedicated attributes for some properties; lists keep all
                        const own = /^(P|H\d)$/.test(el.tagName) ? OWN_PROPS : new Set<string>();
                        const kept = (el.getAttribute('style') || '')
                            .split(';')
                            .map(d => d.trim())
                            .filter(d => d && !own.has(d.slice(0, d.indexOf(':')).trim().toLowerCase()));
                        return kept.length ? kept.join('; ') : null;
                    },
                    renderHTML: attrs => (attrs.blockStyle ? { style: attrs.blockStyle } : {}),
                },
            },
        }, {
            types: BLOCK_TYPES,
            attributes: {
                lineHeight: {
                    default: null,
                    parseHTML: el => el.style.lineHeight || null,
                    renderHTML: attrs => (attrs.lineHeight ? { style: `line-height: ${attrs.lineHeight}` } : {}),
                },
                indent: {
                    default: 0,
                    parseHTML: el => {
                        const px = parseFloat(el.style.marginLeft);
                        return px > 0 ? Math.min(MAX_INDENT, Math.round(px / INDENT_PX)) : 0;
                    },
                    renderHTML: attrs => (attrs.indent ? { style: `margin-left: ${attrs.indent * INDENT_PX}px` } : {}),
                },
            },
        }];
    },

    addCommands() {
        return {
            setLineHeight: lineHeight => ({ commands }) =>
                BLOCK_TYPES.map(type => commands.updateAttributes(type, { lineHeight })).some(Boolean),
            changeIndent: delta => ({ tr, state, dispatch }) => {
                const { from, to } = state.selection;
                let changed = false;
                state.doc.nodesBetween(from, to, (node, pos) => {
                    if (!BLOCK_TYPES.includes(node.type.name)) return true;
                    const next = Math.max(0, Math.min(MAX_INDENT, (node.attrs.indent || 0) + delta));
                    if (next !== node.attrs.indent) {
                        changed = true;
                        if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
                    }
                    return false;
                });
                return changed;
            },
            clearBlockFormat: () => ({ commands }) =>
                STYLED_TYPES.map(type => commands.resetAttributes(type, ['blockStyle', ...(BLOCK_TYPES.includes(type) ? ['lineHeight', 'indent'] : [])])).some(Boolean),
        };
    },
});

const TAG_RE = /\{[a-zA-Z]+\}/g;

function tagDecorations(doc: PMNode): DecorationSet {
    const decorations: Decoration[] = [];
    doc.descendants((node, pos) => {
        if (!node.isText || !node.text) return;
        for (const m of node.text.matchAll(TAG_RE)) {
            const start = pos + (m.index ?? 0);
            decorations.push(Decoration.inline(start, start + m[0].length, { class: 'email-tag' }));
        }
    });
    return DecorationSet.create(doc, decorations);
}

/** Highlights {placeholders} so they stand out from the text around them. */
const TagHighlight = Extension.create({
    name: 'tagHighlight',
    addProseMirrorPlugins() {
        const key = new PluginKey<DecorationSet>('tagHighlight');
        return [
            new Plugin<DecorationSet>({
                key,
                state: {
                    init: (_, { doc }) => tagDecorations(doc),
                    apply: (tr, old) => (tr.docChanged ? tagDecorations(tr.doc) : old),
                },
                props: {
                    decorations: state => key.getState(state),
                },
            }),
        ];
    },
});

const PLACEHOLDER_URL = /^\{[a-zA-Z]+\}$/;

/** Everything the email template editor supports. */
export function createEmailExtensions(placeholder = ''): Extensions {
    return [
        StarterKit.configure({
            heading: { levels: [1, 2, 3] },
            code: false,
            codeBlock: false,
            // An extra empty line at the end would show up as a blank line in the email
            trailingNode: false,
            link: {
                openOnClick: false,
                autolink: true,
                defaultProtocol: 'https',
                // Template links may point at a placeholder such as {statusLink}
                isAllowedUri: (url, ctx) => PLACEHOLDER_URL.test(url) || ctx.defaultValidate(url),
            },
        }),
        TextStyle,
        Color,
        BackgroundColor,
        FontFamily,
        FontSize,
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        TableKit.configure({ table: { resizable: false } }),
        Placeholder.configure({ placeholder }),
        BlockFormat,
        TagHighlight,
    ];
}
