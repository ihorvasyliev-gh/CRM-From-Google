import { RotateCcw, Type } from 'lucide-react';
import Card from '../ui/Card';
import { Button } from '../ui/Button';
import { fieldCls, labelCls, panelCls } from '../ui/styles';
import {
    DEFAULT_EMAIL_STYLE, EMAIL_FONTS, EMAIL_FONT_SIZES, EMAIL_LINE_HEIGHTS, lineHeightPx, primaryFontName, type EmailTextStyle,
} from '../../lib/emailFormat';

interface Props {
    id?: string;
    value: EmailTextStyle;
    onChange: (style: EmailTextStyle) => void;
}

/** Settings → base font, size, line spacing and colour of every email. */
export default function EmailStyleSection({ id, value, onChange }: Props) {
    const set = (patch: Partial<EmailTextStyle>) => onChange({ ...value, ...patch });
    const fontValue = EMAIL_FONTS.find(f => primaryFontName(f.value) === primaryFontName(value.fontFamily))?.value ?? value.fontFamily;
    const isDefault = JSON.stringify(value) === JSON.stringify(DEFAULT_EMAIL_STYLE);

    return (
        <Card
            id={id}
            className="scroll-mt-20"
            title="Email text style"
            subtitle="Default font, size and colour of the text in every email"
            icon={Type}
            divided
            action={!isDefault && (
                <Button variant="ghost" size="sm" onClick={() => onChange(DEFAULT_EMAIL_STYLE)}>
                    <RotateCcw size={13} />
                    Default style
                </Button>
            )}
        >
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 items-start">
                <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                        <label htmlFor="email-font" className={labelCls}>Font</label>
                        <select
                            id="email-font"
                            value={fontValue}
                            onChange={e => set({ fontFamily: e.target.value })}
                            className={fieldCls}
                            style={{ fontFamily: fontValue }}
                        >
                            {EMAIL_FONTS.map(f => <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>)}
                            {!EMAIL_FONTS.some(f => f.value === fontValue) && <option value={fontValue}>{fontValue}</option>}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="email-size" className={labelCls}>Size</label>
                        <select id="email-size" value={value.fontSize} onChange={e => set({ fontSize: Number(e.target.value) })} className={fieldCls}>
                            {EMAIL_FONT_SIZES.filter(n => n <= 24).map(n => <option key={n} value={n}>{n}px</option>)}
                            {!EMAIL_FONT_SIZES.includes(value.fontSize) && <option value={value.fontSize}>{value.fontSize}px</option>}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="email-line-height" className={labelCls}>Line spacing</label>
                        <select id="email-line-height" value={value.lineHeight} onChange={e => set({ lineHeight: Number(e.target.value) })} className={fieldCls}>
                            {EMAIL_LINE_HEIGHTS.map(n => <option key={n} value={n}>{n}</option>)}
                            {!EMAIL_LINE_HEIGHTS.includes(value.lineHeight) && <option value={value.lineHeight}>{value.lineHeight}</option>}
                        </select>
                    </div>
                    <div className="col-span-2">
                        <label htmlFor="email-color" className={labelCls}>Text colour</label>
                        <div className="flex items-center gap-2">
                            <input
                                id="email-color"
                                type="color"
                                value={/^#[0-9a-f]{6}$/i.test(value.textColor) ? value.textColor : '#000000'}
                                onChange={e => set({ textColor: e.target.value })}
                                className="w-9 h-9 p-0.5 rounded-lg border border-border-subtle bg-surface cursor-pointer shrink-0"
                            />
                            <span className="font-mono text-xs text-muted">{value.textColor}</span>
                        </div>
                    </div>
                    <p className="col-span-2 text-[11px] text-muted leading-relaxed">
                        Used for the text of all emails and the course cards. Text given its own font, size or colour in a template keeps it.
                    </p>
                </div>

                <div className={`${panelCls} p-3`}>
                    <div className="rounded-lg border border-border-subtle bg-white px-4 py-3" style={{ fontFamily: value.fontFamily, fontSize: value.fontSize, lineHeight: `${lineHeightPx(value)}px`, color: value.textColor }}>
                        <p style={{ margin: '0 0 10px 0' }}>Hello,</p>
                        <p style={{ margin: 0 }}>We are delighted to invite you to join our upcoming course. Please review the details below and <strong>confirm your attendance</strong>.</p>
                    </div>
                </div>
            </div>
        </Card>
    );
}
