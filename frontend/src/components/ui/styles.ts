/**
 * Shared class strings for the design system.
 *
 * Use the React primitives in this folder (Card, Button, Modal…) where they fit; these
 * constants cover the places where a component would be overkill (a single input, a table
 * header cell) so every page still draws from the same visual vocabulary.
 */

/** Text-like inputs, selects and textareas. Add a height (`h-9`) for single-line fields. */
export const inputCls =
    'w-full px-3 bg-surface border border-border-subtle rounded-xl text-sm text-primary placeholder:text-muted/70 ' +
    'focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors ' +
    'disabled:opacity-60 disabled:cursor-not-allowed';

/** Single-line input (36px). */
export const fieldCls = `${inputCls} h-9`;

/** Native select with room for the custom chevron. */
export const selectCls = `${inputCls} h-9 pr-8 appearance-none cursor-pointer font-medium`;

/** Multi-line text. */
export const textareaCls = `${inputCls} py-2 leading-relaxed resize-y`;

/** Form field label. */
export const labelCls = 'block text-xs font-semibold text-muted mb-1.5';

/** Small uppercase section label ("eyebrow"). */
export const eyebrowCls = 'text-[11px] font-semibold uppercase tracking-wider text-muted';

/** Table wrapper: horizontal scroll inside a card. */
export const tableWrapCls = 'w-full overflow-x-auto';
export const tableCls = 'w-full text-sm text-left';
export const theadCls = 'bg-surface-elevated/60 border-b border-border-subtle';
export const thCls = 'px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap';
export const tbodyCls = 'divide-y divide-border-subtle';
export const trCls = 'transition-colors hover:bg-surface-elevated/50';
export const tdCls = 'px-4 py-3 align-middle';

/** Inner panel inside a card (a grouped block, a stat, a preview frame). */
export const panelCls = 'rounded-xl bg-surface-elevated/60 border border-border-subtle';

/** Card surface without header chrome. */
export const cardCls = 'rounded-2xl bg-surface border border-border-subtle shadow-card';

/** Inline callouts. */
export const calloutCls = {
    info: 'rounded-xl border border-info/25 bg-info/10 text-primary',
    success: 'rounded-xl border border-success/25 bg-success/10 text-primary',
    warning: 'rounded-xl border border-warning/30 bg-warning/10 text-primary',
    danger: 'rounded-xl border border-danger/25 bg-danger/10 text-primary',
    brand: 'rounded-xl border border-brand-500/20 bg-brand-500/[0.07] text-primary',
} as const;

/** Icon colour for callouts / icon chips (readable in both themes). */
export const toneTextCls = {
    brand: 'text-brand-600 dark:text-brand-400',
    info: 'text-status-invited',
    success: 'text-status-confirmed',
    warning: 'text-status-requested',
    danger: 'text-status-rejected',
    completed: 'text-status-completed',
    neutral: 'text-muted',
} as const;

/** Icon chip backgrounds, paired with `toneTextCls`. */
export const toneChipCls = {
    brand: 'bg-brand-500/10 text-brand-600 dark:text-brand-400',
    info: 'bg-info/15 text-status-invited',
    success: 'bg-success/15 text-status-confirmed',
    warning: 'bg-warning/15 text-status-requested',
    danger: 'bg-danger/15 text-status-rejected',
    completed: 'bg-completed/15 text-status-completed',
    neutral: 'bg-surface-elevated text-muted',
} as const;

export type Tone = keyof typeof toneChipCls;
