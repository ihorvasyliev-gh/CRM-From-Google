import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LoadedInvoice } from './InvoicePreview';
import type { PickMode } from './PickLayer';
import { invoicePageSizes } from './useOpenInvoice';
import { rectOf } from '../../lib/chequeReq/extract';
import {
    isMetaField,
    isPlaceField,
    MULTI_PICK,
    NOTHING_PICKED,
    pickedMetaValue,
    pickedValue,
    placeOf,
    type Picked,
} from '../../lib/chequeReq/pick';
import type {
    ChequeReqForm,
    ChequeReqMeta,
    FieldFlags,
    FieldSources,
    PickFieldKey,
} from '../../lib/chequeReq/types';

export interface PickingState {
    key: PickFieldKey;
    picked: Picked;
    history: Picked[];
}

export interface PickableRequisition {
    form: ChequeReqForm;
    meta: ChequeReqMeta;
    flags: FieldFlags;
    sources: FieldSources;
    touched: boolean;
}

export const FIELD_LABELS: Record<PickFieldKey, string> = {
    actionNumber: 'SICAP action number',
    nonSicapFunding: 'Non-SICAP funding',
    poNumber: 'PO number',
    payeeName: 'Payee name',
    payeeAddress: 'Payee address',
    amount: 'Payment amount',
    description: 'Description',
    requestedBy: 'Requested by',
    requestedDate: 'Requested date',
    approvedBy: 'Approved by',
    approvedDate: 'Approved date',
    quoteDate: 'Date of quote',
    amountQuoted: 'Amount quoted',
    shopName: 'Shop name',
    quotePhone: 'Quote phone',
    quoteEmail: 'Quote email',
    quoteContact: 'Quote contact',
    quoteWebsite: 'Quote website',
    invoiceNumber: 'Invoice number',
    invoiceDate: 'Invoice date',
    dueDate: 'Due date',
    netAmount: 'Net excl. VAT',
};

export interface UseInvoicePickerOptions<T extends PickableRequisition> {
    invoice: LoadedInvoice | null;
    /** Whether picked field locations should be saved for future invoices from the same supplier */
    rememberPlace: boolean;
    updateActive: (updater: (item: T) => T) => void;
    onStartPick?: () => void;
    onCompleteSinglePick?: (key: PickFieldKey) => void;
}

export interface UseInvoicePickerResult {
    picking: PickingState | null;
    pickingKey: PickFieldKey | undefined;
    pickMode: PickMode | undefined;
    startPick: (key: PickFieldKey) => void;
    stopPick: () => void;
}

/**
 * Manages the interactive invoice field-picking state machine (single-click, multi-piece undoable
 * picks, place memory for future invoices, and PickLayer binding).
 */
export function useInvoicePicker<T extends PickableRequisition>({
    invoice,
    rememberPlace,
    updateActive,
    onStartPick,
    onCompleteSinglePick,
}: UseInvoicePickerOptions<T>): UseInvoicePickerResult {
    const [picking, setPicking] = useState<PickingState | null>(null);

    const invoiceRef = useRef(invoice);
    const onStartPickRef = useRef(onStartPick);
    const onCompleteSinglePickRef = useRef(onCompleteSinglePick);
    useLayoutEffect(() => {
        invoiceRef.current = invoice;
        onStartPickRef.current = onStartPick;
        onCompleteSinglePickRef.current = onCompleteSinglePick;
    });

    const startPick = useCallback((key: PickFieldKey) => {
        setPicking(p => (p?.key === key ? null : { key, picked: NOTHING_PICKED, history: [] }));
        onStartPickRef.current?.();
    }, []);

    const stopPick = useCallback(() => {
        setPicking(null);
    }, []);

    const applyPickedToItem = useCallback(
        (key: PickFieldKey, picked: Picked) => {
            const inv = invoiceRef.current;
            if (!inv) return;
            const rects = picked.phrases.map(rectOf);

            if (isMetaField(key)) {
                const value = pickedMetaValue(key, picked.texts);
                updateActive(item => ({
                    ...item,
                    meta: { ...item.meta, [key]: value } as ChequeReqMeta,
                    sources: rects.length ? { ...item.sources, [key]: rects } : item.sources,
                    touched: true,
                }));
                return;
            }

            const value = pickedValue(key, picked.texts);
            const place =
                rememberPlace && isPlaceField(key) && value
                    ? placeOf(key, picked.phrases, inv.phrases, invoicePageSizes(inv)?.[picked.phrases[0]?.page ?? 0])
                    : null;

            updateActive(item => {
                const nextForm = { ...item.form, [key]: value };
                if (key === 'amount' && item.form.amountQuoted === item.form.amount) {
                    nextForm.amountQuoted = value;
                }
                const nextPlaces = { ...item.meta.places };
                if (isPlaceField(key)) {
                    if (place) nextPlaces[key] = place;
                    else delete nextPlaces[key];
                }
                const nextMeta: ChequeReqMeta = isPlaceField(key)
                    ? { ...item.meta, places: nextPlaces, ...(key === 'description' ? { item: value } : {}) }
                    : item.meta;
                const nextFlags: FieldFlags = { ...item.flags };
                if (value) {
                    nextFlags[key] = {
                        level: 'found',
                        note: place
                            ? 'Picked on the invoice: the supplier’s next invoice is read in the same place'
                            : 'Picked on the invoice',
                        source: rects,
                    };
                } else {
                    delete nextFlags[key];
                }
                const nextSources: FieldSources = rects.length ? { ...item.sources, [key]: rects } : item.sources;
                return {
                    ...item,
                    form: nextForm,
                    meta: nextMeta,
                    flags: nextFlags,
                    sources: nextSources,
                    touched: true,
                };
            });
        },
        [rememberPlace, updateActive],
    );

    const handlePick = useCallback(
        (picked: Picked) => {
            if (!picking) return;
            const { key } = picking;
            const multi = !isMetaField(key) && MULTI_PICK.has(key);
            setPicking(multi ? { key, picked, history: [...picking.history, picking.picked] } : null);
            applyPickedToItem(key, picked);
            if (!multi) {
                onCompleteSinglePickRef.current?.(key);
            }
        },
        [picking, applyPickedToItem],
    );

    const handlePickUndo = useCallback(() => {
        if (!picking || picking.history.length === 0) return;
        const previous = picking.history[picking.history.length - 1];
        setPicking({
            key: picking.key,
            picked: previous,
            history: picking.history.slice(0, -1),
        });
        applyPickedToItem(picking.key, previous);
    }, [picking, applyPickedToItem]);

    const pickMode = useMemo<PickMode | undefined>(() => {
        if (!picking) return undefined;
        const multi = !isMetaField(picking.key) && MULTI_PICK.has(picking.key);
        return {
            label: FIELD_LABELS[picking.key],
            multi,
            picked: picking.picked,
            onPick: handlePick,
            onDone: stopPick,
            onUndo: multi && picking.history.length > 0 ? handlePickUndo : undefined,
            count: picking.picked.texts.length,
        };
    }, [picking, handlePick, stopPick, handlePickUndo]);

    return {
        picking,
        pickingKey: picking?.key,
        pickMode,
        startPick,
        stopPick,
    };
}
