import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface DashboardCardProps {
    title: string;
    icon?: LucideIcon;
    /** Tailwind classes for the icon chip (text + background). */
    iconClassName?: string;
    subtitle?: ReactNode;
    /** Rendered on the right side of the header (badge, link, …). */
    action?: ReactNode;
    children?: ReactNode;
    className?: string;
    bodyClassName?: string;
}

/** Shared surface used by every dashboard widget so headers, spacing and borders stay consistent. */
export default function DashboardCard({
    title,
    icon: Icon,
    iconClassName = 'text-brand-500 bg-brand-500/10',
    subtitle,
    action,
    children,
    className = '',
    bodyClassName = '',
}: DashboardCardProps) {
    return (
        <section className={`rounded-2xl bg-surface border border-border-subtle shadow-card flex flex-col min-w-0 ${className}`}>
            <header className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                    {Icon && (
                        <span className={`flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0 ${iconClassName}`}>
                            <Icon size={16} />
                        </span>
                    )}
                    <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-primary tracking-tight truncate">{title}</h3>
                        {subtitle && <p className="text-[11px] text-muted truncate">{subtitle}</p>}
                    </div>
                </div>
                {action && <div className="flex items-center gap-2 flex-shrink-0">{action}</div>}
            </header>
            <div className={`px-4 sm:px-5 pb-4 sm:pb-5 flex-1 min-h-0 ${bodyClassName}`}>{children}</div>
        </section>
    );
}
