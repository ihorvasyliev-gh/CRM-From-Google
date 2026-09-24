/**
 * Chart vocabulary shared by every recharts graph: one palette (CSS variables, so light/dark
 * follow the theme), one tooltip, and common axis / grid props.
 */

export const CHART = {
    brand: 'var(--chart-brand)',
    violet: 'var(--chart-violet)',
    sky: 'var(--chart-sky)',
    emerald: 'var(--chart-emerald)',
    amber: 'var(--chart-amber)',
    rose: 'var(--chart-rose)',
    pink: 'var(--chart-pink)',
    orange: 'var(--chart-orange)',
    neutral: 'var(--chart-neutral)',
    // Pipeline statuses
    requested: 'var(--color-requested)',
    invited: 'var(--color-invited)',
    confirmed: 'var(--color-confirmed)',
    completed: 'var(--color-completed)',
    grid: 'var(--color-chart-border)',
    text: 'var(--color-chart-text)',
} as const;

/** Ordered categorical palette for pies / multi-series charts. */
export const CHART_SERIES = [CHART.brand, CHART.violet, CHART.pink, CHART.rose, CHART.orange, CHART.sky, CHART.emerald, CHART.neutral];

export const gridProps = {
    strokeDasharray: '3 3',
    stroke: CHART.grid,
    opacity: 0.6,
} as const;

export const axisTick = { fill: CHART.text, fontSize: 11 } as const;

export const axisProps = {
    tick: axisTick,
    tickLine: false,
    axisLine: false,
} as const;

export const tooltipCursor = { fill: CHART.grid, opacity: 0.35 } as const;

interface TooltipEntry {
    name?: string;
    value?: number | string;
    color?: string;
    fill?: string;
    payload?: { fill?: string; color?: string };
}

/** Recharts `content` renderer — pass as `<Tooltip content={<ChartTooltip />} />`. */
export function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string | number }) {
    if (!active || !payload || !payload.length) return null;
    return (
        <div className="bg-surface/95 px-3 py-2.5 rounded-xl shadow-float border border-border-subtle min-w-[140px]">
            {label !== undefined && label !== '' && <p className="text-xs font-semibold text-primary mb-1.5">{label}</p>}
            <div className="space-y-1">
                {payload.map((entry, index) => (
                    <p key={index} className="text-xs flex items-center gap-2">
                        <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: entry.color || entry.fill || entry.payload?.fill || entry.payload?.color }}
                        />
                        <span className="text-muted flex-1">{entry.name}</span>
                        <span className="text-primary font-semibold tabular-nums">{entry.value}</span>
                    </p>
                ))}
            </div>
        </div>
    );
}

/** Small legend dot + label, for hand-built legends. */
export function LegendItem({ color, label }: { color: string; label: string }) {
    return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            {label}
        </span>
    );
}
