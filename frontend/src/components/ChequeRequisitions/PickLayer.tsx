import { useMemo, useState, type PointerEvent } from 'react';
import { rectStyle } from '../PdfForms/pdfHooks';
import { rectOf } from '../../lib/chequeReq/extract';
import { unlevelRect } from '../../lib/chequeReq/ocr';
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
}

/** A click that moves less than this (CSS pixels) is not a box being drawn */
const DRAG = 5;

/**
 * Over a page while a value is picked: the text under the pointer is outlined, a click takes
 * it, a box drawn round some text takes all of it (shift adds to what was picked).
 */
export default function PickLayer({ phrases, page, size, angle, scale, pick }: Props) {
    // Where each phrase shows on the page (a levelled scan's back at its angle)
    const shown = useMemo(() => phrases.filter(p => p.page === page).map(p => ({ phrase: p, rect: unlevelRect(rectOf(p), angle, size) })), [phrases, page, angle, size]);
    const [hover, setHover] = useState<Rect | null>(null);
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
        else setHover(hit(p.x, p.y)?.rect ?? null);
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

    const box = drag && { page, x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) };
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
            {shown.filter(s => pick.picked.phrases.includes(s.phrase)).map((s, k) => (
                <div key={k} className="absolute rounded-xs ring-2 ring-brand-500 bg-brand-500/20 pointer-events-none" style={rectStyle(s.rect, scale, size.h)} />
            ))}
            {hover && !drag && <div className="absolute rounded-xs ring-2 ring-brand-500/60 bg-brand-500/10 pointer-events-none" style={rectStyle(hover, scale, size.h)} />}
            {box && <div className="absolute border-2 border-dashed border-brand-500 bg-brand-500/10 pointer-events-none" style={rectStyle(box, scale, size.h)} />}
        </div>
    );
}
