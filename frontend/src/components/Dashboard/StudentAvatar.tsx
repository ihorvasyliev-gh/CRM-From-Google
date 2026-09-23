const PALETTE = [
    'bg-brand-500/15 text-brand-600 dark:text-brand-400',
    'bg-info/15 text-info',
    'bg-success/15 text-success',
    'bg-warning/20 text-amber-700 dark:text-warning',
    'bg-[oklch(var(--status-completed)/0.15)] text-[oklch(var(--status-completed))]',
    'bg-danger/15 text-danger',
];

function initialsOf(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function colorFor(seed: string): string {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    return PALETTE[Math.abs(h) % PALETTE.length];
}

export default function StudentAvatar({ name, seed, size = 'md' }: { name: string; seed?: string; size?: 'sm' | 'md' }) {
    const dims = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs';
    return (
        <span aria-hidden className={`flex items-center justify-center rounded-full font-bold flex-shrink-0 select-none ${dims} ${colorFor(seed || name)}`}>
            {initialsOf(name)}
        </span>
    );
}
