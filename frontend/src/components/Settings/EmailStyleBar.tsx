import { useId, useMemo, useState } from 'react';
import { Check, ChevronDown, Info, Palette, RotateCcw } from 'lucide-react';
import Badge from '../ui/Badge';
import { Button } from '../ui/Button';
import Switch from '../ui/Switch';
import { CustomTooltip } from '../ui/Tooltip';
import { eyebrowCls, fieldCls, labelCls, panelCls, toneChipCls } from '../ui/styles';
import {
    DEFAULT_EMAIL_STYLE,
    EMAIL_FONTS,
    EMAIL_FONT_SIZES,
    EMAIL_LINE_HEIGHTS,
    primaryFontName,
    type EmailTextStyle,
} from '../../lib/emailFormat';

export interface EmailStyleBarProps {
    style: EmailTextStyle;
    includeLogos: boolean;
    onStyleChange: (style: EmailTextStyle) => void;
    onIncludeLogosChange: (include: boolean) => void;
}

const INK_SWATCHES = [
    { hex: '#1e293b', label: 'Slate (default)' },
    { hex: '#0f172a', label: 'Charcoal' },
    { hex: '#111827', label: 'Ink' },
    { hex: '#334155', label: 'Soft Slate' },
    { hex: '#1e3a5f', label: 'Deep Navy' },
] as const;

const BASE_FONT_SIZES = EMAIL_FONT_SIZES.filter(size => size <= 24);

function toColorInputHex(color: string): string {
    const trimmed = color.trim();
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
        return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toLowerCase();
    }
    return DEFAULT_EMAIL_STYLE.textColor;
}

function getFontDisplayName(fontFamily: string): string {
    const matched = EMAIL_FONTS.find(f => primaryFontName(f.value) === primaryFontName(fontFamily));
    if (matched) return matched.label;
    const rawFirst = fontFamily.split(',')[0]?.replace(/["']/g, '').trim();
    return rawFirst || 'Arial';
}

export default function EmailStyleBar({
    style,
    includeLogos,
    onStyleChange,
    onIncludeLogosChange,
}: EmailStyleBarProps) {
    const [expanded, setExpanded] = useState(false);
    const panelId = useId();
    const fontId = useId();
    const sizeId = useId();
    const lineHeightId = useId();
    const colorId = useId();

    const updateStyle = (patch: Partial<EmailTextStyle>) => {
        onStyleChange({ ...style, ...patch });
    };

    const matchedFont = useMemo(
        () => EMAIL_FONTS.find(f => primaryFontName(f.value) === primaryFontName(style.fontFamily)),
        [style.fontFamily],
    );
    const fontSelectValue = matchedFont?.value ?? style.fontFamily;
    const fontLabel = matchedFont?.label ?? getFontDisplayName(style.fontFamily);

    const sizeOptions = useMemo(() => {
        if (BASE_FONT_SIZES.includes(style.fontSize)) return BASE_FONT_SIZES;
        return [...BASE_FONT_SIZES, style.fontSize].sort((a, b) => a - b);
    }, [style.fontSize]);

    const lineHeightOptions = useMemo(() => {
        if (EMAIL_LINE_HEIGHTS.includes(style.lineHeight)) return EMAIL_LINE_HEIGHTS;
        return [...EMAIL_LINE_HEIGHTS, style.lineHeight].sort((a, b) => a - b);
    }, [style.lineHeight]);

    const normalizedColor = toColorInputHex(style.textColor);
    const isDefaultStyle =
        primaryFontName(style.fontFamily) === primaryFontName(DEFAULT_EMAIL_STYLE.fontFamily) &&
        style.fontSize === DEFAULT_EMAIL_STYLE.fontSize &&
        style.lineHeight === DEFAULT_EMAIL_STYLE.lineHeight &&
        normalizedColor === DEFAULT_EMAIL_STYLE.textColor.toLowerCase();

    return (
        <section
            aria-label="Email style and branding"
            className="rounded-2xl bg-surface border border-border-subtle shadow-card overflow-hidden"
        >
            {/* Always-visible summary bar */}
            <div className="px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${toneChipCls.brand}`}>
                        <Palette size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                            <h2 className="text-sm font-semibold text-primary tracking-tight">Style &amp; branding</h2>
                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                                <span
                                    className="inline-flex items-center gap-1.5 px-2 h-5 rounded-full bg-surface-elevated border border-border-subtle text-primary font-medium"
                                    style={{ fontFamily: fontSelectValue }}
                                >
                                    {fontLabel}
                                </span>
                                <span className="inline-flex items-center px-2 h-5 rounded-full bg-surface-elevated border border-border-subtle tabular-nums text-primary font-medium">
                                    {style.fontSize}px
                                </span>
                                <span className="inline-flex items-center px-2 h-5 rounded-full bg-surface-elevated border border-border-subtle tabular-nums text-primary font-medium">
                                    {style.lineHeight}×
                                </span>
                                <span
                                    className="inline-flex items-center gap-1.5 px-2 h-5 rounded-full bg-surface-elevated border border-border-subtle font-mono text-[11px] text-primary"
                                    title={`Text colour: ${style.textColor}`}
                                >
                                    <span
                                        aria-hidden="true"
                                        className="w-2.5 h-2.5 rounded-full ring-1 ring-black/15 dark:ring-white/25 shrink-0"
                                        style={{ backgroundColor: normalizedColor }}
                                    />
                                    {style.textColor}
                                </span>
                                <Badge tone={includeLogos ? 'brand' : 'neutral'} shape="pill">
                                    CCP Logo: {includeLogos ? 'On' : 'Off'}
                                </Badge>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                    {!isDefaultStyle && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onStyleChange({ ...DEFAULT_EMAIL_STYLE })}
                        >
                            <RotateCcw size={13} />
                            Reset style
                        </Button>
                    )}
                    <Button
                        variant={expanded ? 'brand-soft' : 'secondary'}
                        size="sm"
                        aria-expanded={expanded}
                        aria-controls={panelId}
                        onClick={() => setExpanded(prev => !prev)}
                    >
                        <span>{expanded ? 'Done' : 'Customise'}</span>
                        <ChevronDown
                            size={14}
                            className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                        />
                    </Button>
                </div>
            </div>

            {/* Collapsible controls panel */}
            {expanded && (
                <div
                    id={panelId}
                    className="border-t border-border-subtle px-4 sm:px-5 py-4 sm:py-5 bg-surface-elevated/30 animate-fadeIn"
                >
                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-5 items-start">
                        {/* Typography controls */}
                        <div className="space-y-3.5 min-w-0">
                            <p className={eyebrowCls}>Typography</p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="col-span-2">
                                    <label htmlFor={fontId} className={labelCls}>Font</label>
                                    <select
                                        id={fontId}
                                        value={fontSelectValue}
                                        onChange={e => updateStyle({ fontFamily: e.target.value })}
                                        className={fieldCls}
                                        style={{ fontFamily: fontSelectValue }}
                                    >
                                        {EMAIL_FONTS.map(font => (
                                            <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                                                {font.label}
                                            </option>
                                        ))}
                                        {!matchedFont && (
                                            <option value={fontSelectValue}>{fontLabel}</option>
                                        )}
                                    </select>
                                </div>

                                <div>
                                    <label htmlFor={sizeId} className={labelCls}>Size</label>
                                    <select
                                        id={sizeId}
                                        value={style.fontSize}
                                        onChange={e => updateStyle({ fontSize: Number(e.target.value) })}
                                        className={`${fieldCls} tabular-nums`}
                                    >
                                        {sizeOptions.map(n => (
                                            <option key={n} value={n}>{n}px</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label htmlFor={lineHeightId} className={labelCls}>Line spacing</label>
                                    <select
                                        id={lineHeightId}
                                        value={style.lineHeight}
                                        onChange={e => updateStyle({ lineHeight: Number(e.target.value) })}
                                        className={`${fieldCls} tabular-nums`}
                                    >
                                        {lineHeightOptions.map(n => (
                                            <option key={n} value={n}>{n}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label htmlFor={colorId} className={labelCls}>Text colour</label>
                                <div className="flex flex-wrap items-center gap-3">
                                    <div className="inline-flex items-center gap-2 pr-2.5 pl-1.5 py-1 rounded-xl bg-surface border border-border-subtle">
                                        <input
                                            id={colorId}
                                            type="color"
                                            value={normalizedColor}
                                            onChange={e => updateStyle({ textColor: e.target.value })}
                                            className="w-7 h-7 p-0.5 rounded-lg border border-border-subtle bg-surface cursor-pointer shrink-0"
                                        />
                                        <span className="font-mono text-xs text-primary tabular-nums">
                                            {style.textColor}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-1.5" role="group" aria-label="Preset email ink colours">
                                        {INK_SWATCHES.map(swatch => {
                                            const active = normalizedColor === swatch.hex;
                                            return (
                                                <CustomTooltip key={swatch.hex} content={`${swatch.label} (${swatch.hex})`}>
                                                    <button
                                                        type="button"
                                                        aria-label={`${swatch.label} (${swatch.hex})`}
                                                        aria-pressed={active}
                                                        onClick={() => updateStyle({ textColor: swatch.hex })}
                                                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                                                            active
                                                                ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-surface scale-105'
                                                                : 'ring-1 ring-black/15 dark:ring-white/20 hover:scale-105'
                                                        }`}
                                                        style={{ backgroundColor: swatch.hex }}
                                                    >
                                                        {active && <Check size={13} className="text-white" strokeWidth={2.75} />}
                                                    </button>
                                                </CustomTooltip>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Branding control + note */}
                        <div className="space-y-3.5 min-w-0">
                            <p className={eyebrowCls}>Email branding</p>
                            <div className={`${panelCls} bg-surface p-4`}>
                                <Switch
                                    label="Include Cork City Partnership logo banner"
                                    description="Show the CCP & SICAP header banner at the top of every sent email."
                                    checked={includeLogos}
                                    onChange={onIncludeLogosChange}
                                    labelPosition="left"
                                />
                            </div>

                            <p className="flex items-start gap-2 text-xs text-muted leading-relaxed">
                                <Info size={13} className="shrink-0 mt-0.5 text-muted" />
                                <span>
                                    Applies across all email templates and course cards. Text styled individually inside a template keeps its custom formatting.
                                </span>
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
