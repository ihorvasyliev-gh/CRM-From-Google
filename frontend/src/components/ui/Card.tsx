import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { toneChipCls, type Tone } from './styles';

export interface CardProps {
    title?: ReactNode;
    icon?: LucideIcon;
    /** Colour of the icon chip. Ignored when `iconClassName` is given. */
    tone?: Tone;
    /** Tailwind classes for the icon chip (text + background). */
    iconClassName?: string;
    subtitle?: ReactNode;
    /** Rendered on the right side of the header (badge, link, buttons…). */
    action?: ReactNode;
    children?: ReactNode;
    className?: string;
    bodyClassName?: string;
    /** Draw a divider between header and body (useful above tables / lists). */
    divided?: boolean;
    /** Remove body padding (tables, lists that run edge to edge). */
    flush?: boolean;
    id?: string;
}

/**
 * The app's single surface: rounded-2xl card with an optional header
 * (icon chip · title · subtitle · action) — the language the dashboard introduced.
 */
export default function Card({
    title,
    icon: Icon,
    tone = 'brand',
    iconClassName,
    subtitle,
    action,
    children,
    className = '',
    bodyClassName = '',
    divided = false,
    flush = false,
    id,
}: CardProps) {
    const hasHeader = title !== undefined || action !== undefined;
    const bodyPad = flush ? '' : hasHeader ? 'px-4 sm:px-5 pb-4 sm:pb-5' : 'p-4 sm:p-5';
    return (
        <section id={id} className={`rounded-2xl bg-surface border border-border-subtle shadow-card flex flex-col min-w-0 ${className}`}>
            {hasHeader && (
                <header
                    className={`flex items-center justify-between gap-3 px-4 sm:px-5 ${
                        divided ? 'py-3.5 border-b border-border-subtle' : 'pt-4 pb-3'
                    } ${flush && !divided ? 'pb-4' : ''}`}
                >
                    <div className="flex items-center gap-2.5 min-w-0">
                        {Icon && (
                            <span className={`flex items-center justify-center w-8 h-8 rounded-xl shrink-0 ${iconClassName ?? toneChipCls[tone]}`}>
                                <Icon size={16} />
                            </span>
                        )}
                        <div className="min-w-0">
                            {title !== undefined && <h3 className="text-sm font-semibold text-primary tracking-tight truncate">{title}</h3>}
                            {subtitle && <p className="text-[11px] text-muted truncate">{subtitle}</p>}
                        </div>
                    </div>
                    {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
                </header>
            )}
            <div className={`${bodyPad} ${divided && !flush ? 'pt-4' : ''} flex-1 min-h-0 ${bodyClassName}`}>{children}</div>
        </section>
    );
}

/**
 * Heading for a region of a page (an analytics tab, a settings section):
 * larger icon chip, title, one-line description and actions on the right.
 */
export function SectionHeader({
    icon: Icon,
    tone = 'brand',
    title,
    description,
    actions,
    className = '',
}: {
    icon?: LucideIcon;
    tone?: Tone;
    title: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
    className?: string;
}) {
    return (
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${className}`}>
            <div className="flex items-center gap-3 min-w-0">
                {Icon && (
                    <span className={`flex items-center justify-center w-10 h-10 rounded-xl shrink-0 ${toneChipCls[tone]}`}>
                        <Icon size={20} />
                    </span>
                )}
                <div className="min-w-0">
                    <h3 className="text-base font-semibold text-primary tracking-tight">{title}</h3>
                    {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
                </div>
            </div>
            {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
        </div>
    );
}

/** Horizontal page toolbar surface (title/count · search · actions). */
export function Toolbar({ children, className = '' }: { children: ReactNode; className?: string }) {
    return (
        <div className={`rounded-2xl bg-surface border border-border-subtle shadow-card p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center gap-3 ${className}`}>
            {children}
        </div>
    );
}
