import { useMemo, useState, type CSSProperties, type PointerEvent } from 'react';
import { rectStyle } from '../PdfForms/pdfHooks';
import { rectOf } from '../../lib/chequeReq/extract';
import { unlevelRect, type Rotation } from '../../lib/chequeReq/ocr';
import { covers, pickedOf, type Picked } from '../../lib/chequeReq/pick';
import type { Phrase, Rect } from '../../lib/pdfForms/types';

/** A field's value being picked on the invoice */
export interface PickMode {
    /** The field, as the person knows it: "Payment amount" */
    label: string;
    /** Several pieces of text make it (an address): each click adds one, or takes it out again */
    multi: boolean;
    picked: Picked;
    onPick: (picked: Picked) => void;
    onDone: () => void;
    /** Optional handler to undo the last picked item in multi-pick mode */
    onUndo?: () => void;
    /** Optional explicit count of picked items */
    count?: number;
}

interface Props {
    /** The invoice's text, on all pages */
    phrases: Phrase[];
    page: number;
    /** The page in the units its text was read in, and how far off level the picture is */
    size: { w: number; h: number };
    angle: number;
    /** CSS pixels per unit */
    scale: number;
    pick: PickMode;
    /** Clockwise rotation applied to the page when its phrases were read */
    rotation?: Rotation;
}

interface ShownPhrase {
    phrase: Phrase;
    rect: Rect;
}

/** A click that moves less than this (CSS pixels) is not a box being drawn */
const DRAG = 5;

/**
 * Over a page while a value is picked: the text under the pointer is outlined with a crisp
 * preview tooltip, a click takes it, a box drawn round some text takes all of it (shift adds
 * to what was picked).
 */
export default function PickLayer({ phrases, page, size, angle, scale, pick }: Props) {
    // Where each phrase shows on the page (a levelled scan's back at its angle)
    const shown = useMemo<ShownPhrase[]>(
        () => phrases.filter(p => p.page === page).map(p => ({ phrase: p, rect: unlevelRect(rectOf(p), angle, size) })),
        [phrases, page, angle, size],
    );
    const [hover, setHover] = useState<ShownPhrase | null>(null);
    const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

    const at = (e: PointerEvent<HTMLDivElement>) => {
        const box = e.currentTarget.getBoundingClientRect();
        return { x: (e.clientX - box.left) / scale, y: size.h - (e.clientY - box.top) / scale };
    };
    const hit = (x: number, y: number) => {
        const pad = 3 / scale;
        return shown.find(({ rect: r }) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad);
    };

    const take = (chosen: Phrase[], add: boolean) => {
        const before = pick.picked.phrases;
        let next = chosen;
        if (pick.multi || add) {
            // Clicking a picked piece again takes it out
            next = chosen.length === 1 && before.includes(chosen[0]) ? before.filter(p => p !== chosen[0]) : [...before, ...chosen.filter(p => !before.includes(p))];
        }
        pick.onPick(pickedOf(next));
    };

    const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        const p = at(e);
        setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    };
    const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
        const p = at(e);
        if (drag) setDrag({ ...drag, x1: p.x, y1: p.y });
        else setHover(hit(p.x, p.y) ?? null);
    };
    const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
        if (!drag) return;
        const p = at(e);
        setDrag(null);
        if (Math.abs(p.x - drag.x0) * scale > DRAG || Math.abs(p.y - drag.y0) * scale > DRAG) {
            const area = { page, x: Math.min(drag.x0, p.x), y: Math.min(drag.y0, p.y), w: Math.abs(p.x - drag.x0), h: Math.abs(p.y - drag.y0) };
            const inside = shown.filter(s => covers(area, s.rect)).map(s => s.phrase);
            if (inside.length) take(inside, e.shiftKey);
        } else {
            const found = hit(p.x, p.y);
            if (found) take([found.phrase], e.shiftKey);
        }
    };

    const pickedIndex = useMemo(() => {
        const map = new Map<Phrase, number>();
        pick.picked.phrases.forEach((phrase, idx) => map.set(phrase, idx + 1));
        return map;
    }, [pick.picked.phrases]);

    const box = useMemo(
        () =>
            drag
                ? {
                    page,
                    x: Math.min(drag.x0, drag.x1),
                    y: Math.min(drag.y0, drag.y1),
                    w: Math.abs(drag.x1 - drag.x0),
                    h: Math.abs(drag.y1 - drag.y0),
                }
                : null,
        [drag, page],
    );
    const draggingBox = Boolean(drag && (Math.abs(drag.x1 - drag.x0) * scale > DRAG || Math.abs(drag.y1 - drag.y0) * scale > DRAG));

    const dragHits = useMemo(
        () => (draggingBox && box ? shown.filter(s => covers(box, s.rect) && !pickedIndex.has(s.phrase)) : []),
        [draggingBox, box, shown, pickedIndex],
    );

    const tooltipStyle: CSSProperties | undefined = useMemo(() => {
        if (!hover || drag) return undefined;
        const topPx = (size.h - hover.rect.y - hover.rect.h) * scale;
        const bottomPx = (size.h - hover.rect.y) * scale;
        const leftPx = hover.rect.x * scale;
        const rightPx = (hover.rect.x + hover.rect.w) * scale;
        const pageWidthPx = size.w * scale;
        const placeAbove = topPx >= 28;
        const alignRight = pageWidthPx > 200 && leftPx > pageWidthPx - 180;
        return {
            top: placeAbove ? topPx - 6 : bottomPx + 6,
            transform: placeAbove ? 'translateY(-100%)' : undefined,
            ...(alignRight
                ? { right: Math.max(4, pageWidthPx - rightPx) }
                : { left: Math.max(4, leftPx) }),
        };
    }, [hover, drag, scale, size.h, size.w]);

    return (
        <div
            data-testid={`pick-page-${page}`}
            className="absolute inset-0 z-10 cursor-crosshair touch-manipulation"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDrag(null)}
            onPointerLeave={() => setHover(null)}
        >
            {/* Picked phrase highlights (with subtle 1, 2, 3 order badges in multi-pick mode) */}
            {shown.map((s, k) => {
                const order = pickedIndex.get(s.phrase);
                if (!order) return null;
                return (
                    <div
                        key={k}
                        className="absolute rounded-xs ring-2 ring-brand-500 bg-brand-500/20 pointer-events-none"
                        style={rectStyle(s.rect, scale, size.h)}
                    >
                        {pick.multi && (
                            <span
                                aria-hidden="true"
                                className="absolute -top-2 -left-2 min-w-4 h-4 px-1 rounded-full bg-brand-600 text-white text-[10px] font-bold leading-4 text-center shadow-xs ring-1 ring-white/90 tabular-nums"
                            >
                                {order}
                            </span>
                        )}
                    </div>
                );
            })}

            {/* Live highlight for phrases inside an active drag selection box */}
            {dragHits.map((s, k) => (
                <div
                    key={`drag-${k}`}
                    className="absolute rounded-xs ring-1 ring-brand-500/70 bg-brand-500/15 pointer-events-none"
                    style={rectStyle(s.rect, scale, size.h)}
                />
            ))}

            {/* Hover outline + floating miniature preview tooltip */}
            {hover && !drag && (
                <>
                    <div
                        className="absolute rounded-xs ring-2 ring-brand-500/80 bg-brand-500/12 pointer-events-none transition-all duration-75"
                        style={rectStyle(hover.rect, scale, size.h)}
                    />
                    {tooltipStyle && (
                        <div
                            aria-hidden="true"
                            className="absolute z-20 max-w-[220px] truncate rounded-md bg-neutral-900/95 dark:bg-neutral-100/95 text-white dark:text-neutral-900 px-2 py-0.5 text-[11px] font-medium shadow-float pointer-events-none whitespace-nowrap"
                            style={tooltipStyle}
                        >
                            {hover.phrase.text}
                        </div>
                    )}
                </>
            )}

            {/* Drag-box marquee */}
            {box && (
                <div
                    className="absolute border-2 border-dashed border-brand-500 bg-brand-500/10 rounded-xs pointer-events-none"
                    style={rectStyle(box, scale, size.h)}
                />
            )}
        </div>
    );
}
