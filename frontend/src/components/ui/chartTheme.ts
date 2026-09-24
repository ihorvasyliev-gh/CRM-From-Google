/**
 * Chart vocabulary shared by every recharts graph: one palette (CSS variables, so light/dark
 * follow the theme) and common axis / grid props.
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
