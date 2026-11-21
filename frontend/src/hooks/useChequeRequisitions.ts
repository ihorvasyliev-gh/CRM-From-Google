import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { fetchAllPages } from '../lib/queries';
import { netOfPayment } from '../lib/chequeReq/draft';
import { parseAmount } from '../lib/chequeReq/parse';
import {
    EMPTY_FORM,
    EMPTY_META,
    type ChequeReqForm,
    type ChequeReqMeta,
    type ChequeReqStatus,
    type SavedChequeReq,
} from '../lib/chequeReq/types';

// Requisitions that were downloaded (or saved as drafts) live in public.cheque_requisitions (migrations 88 & 95, admins only).
export const CHEQUE_REQ_KEY = ['cheque_requisitions'] as const;

export interface ChequeReqHistory {
    rows: SavedChequeReq[];
    /** false until migration 88 is applied: requisitions still work, they just aren't kept */
    available: boolean;
}

const VALID_STATUSES: ReadonlySet<string> = new Set<ChequeReqStatus>(['draft', 'ready', 'paid']);

function toValidStatus(value: unknown): ChequeReqStatus | undefined {
    return typeof value === 'string' && VALID_STATUSES.has(value) ? (value as ChequeReqStatus) : undefined;
}

function isMissingTable(error: { code?: string } | null): boolean {
    return error?.code === 'PGRST205' || error?.code === '42P01';
}

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
    if (!error) return false;
    if (error.code === 'PGRST204' || error.code === '42703') return true;
    const message = (error.message ?? '').toLowerCase();
    if (message.includes('schema cache')) return true;
    if (message.includes('column') && !message.includes('constraint') && !message.includes('violates')) return true;
    return false;
}

function normalize(row: SavedChequeReq): SavedChequeReq {
    const form = (row.form ?? {}) as Partial<ChequeReqForm>;
    const rawMeta = (row.meta ?? {}) as Partial<ChequeReqMeta>;
    const status: ChequeReqStatus = toValidStatus(row.status) ?? toValidStatus(rawMeta.status) ?? 'ready';
    const cheque_number = row.cheque_number ?? rawMeta.chequeNumber ?? '';
    const notes = row.notes ?? rawMeta.notes ?? '';
    const meta: ChequeReqMeta = {
        ...EMPTY_META,
        ...rawMeta,
        places: { ...(rawMeta.places ?? {}) },
        status,
        chequeNumber: cheque_number,
        notes,
    };
    return {
        ...row,
        amount: row.amount == null ? null : Number(row.amount),
        net_amount: row.net_amount == null ? null : Number(row.net_amount),
        status,
        cheque_number,
        notes,
        form: {
            ...EMPTY_FORM,
            ...form,
            quoteBy: { ...EMPTY_FORM.quoteBy, ...(form.quoteBy ?? {}) },
            checklist: { ...EMPTY_FORM.checklist, ...(form.checklist ?? {}) },
        },
        meta,
    };
}

export async function fetchChequeReqHistory(): Promise<ChequeReqHistory> {
    try {
        const data = await fetchAllPages<SavedChequeReq>((from, to) =>
            supabase
                .from('cheque_requisitions')
                .select('*')
                .order('created_at', { ascending: false })
                .order('id', { ascending: false })
                .range(from, to)
        );
        return { rows: data.map(normalize), available: true };
    } catch (error) {
        if (isMissingTable(error as { code?: string } | null)) return { rows: [], available: false };
        throw error;
    }
}

export function useChequeReqHistory() {
    return useQuery({ queryKey: CHEQUE_REQ_KEY, queryFn: fetchChequeReqHistory });
}

export interface SaveChequeReqInput {
    id?: string;
    form: ChequeReqForm;
    meta: ChequeReqMeta;
    status?: ChequeReqStatus;
    chequeNumber?: string;
    notes?: string;
}

/** Keep a requisition (draft, ready or paid) or update the one already kept. Resolves to its id, or null before migration 88. */
export function useSaveChequeReq() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, form, meta, status, chequeNumber, notes }: SaveChequeReqInput): Promise<string | null> => {
            const resolvedStatus: ChequeReqStatus = toValidStatus(status) ?? toValidStatus(meta.status) ?? 'ready';
            const resolvedChequeNumber = (chequeNumber ?? meta.chequeNumber ?? '').trim();
            const resolvedNotes = notes ?? meta.notes ?? '';
            const nextMeta: ChequeReqMeta = {
                ...meta,
                status: resolvedStatus,
                chequeNumber: resolvedChequeNumber,
                notes: resolvedNotes,
            };

            const amount = parseAmount(form.amount);
            const baseRow = {
                supplier_name: form.payeeName.trim(),
                invoice_number: meta.invoiceNumber.trim() || null,
                invoice_date: meta.invoiceDate || null,
                amount,
                net_amount: netOfPayment(amount, meta.netAmount),
                form,
                meta: nextMeta,
            };
            const fullRow = {
                ...baseRow,
                status: resolvedStatus,
                cheque_number: resolvedChequeNumber,
                notes: resolvedNotes,
            };

            const write = (payload: Record<string, unknown>) =>
                id
                    ? supabase.from('cheque_requisitions').update(payload).eq('id', id).select('id').single()
                    : supabase.from('cheque_requisitions').insert(payload).select('id').single();

            let { data, error } = await write(fullRow);
            if (error) {
                if (isMissingTable(error)) return null;
                if (isMissingColumn(error)) {
                    ({ data, error } = await write(baseRow));
                    if (error) {
                        if (isMissingTable(error)) return null;
                        throw error;
                    }
                } else {
                    throw error;
                }
            }
            return (data as { id: string }).id;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: CHEQUE_REQ_KEY }),
    });
}

export interface UpdateChequeReqStatusInput {
    id: string;
    status?: ChequeReqStatus;
    chequeNumber?: string;
    notes?: string;
    /** Optional existing meta so other metadata fields are preserved without an extra SELECT */
    meta?: ChequeReqMeta;
}

/** Update status, cheque reference and/or internal notes on a saved requisition, falling back to `meta` JSONB before migration 95. */
export function useUpdateChequeReqStatus() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, status, chequeNumber, notes, meta }: UpdateChequeReqStatusInput): Promise<void> => {
            if (status === undefined && chequeNumber === undefined && notes === undefined) return;

            let existingMeta: Partial<ChequeReqMeta> | undefined =
                meta ?? queryClient.getQueryData<ChequeReqHistory>(CHEQUE_REQ_KEY)?.rows.find(r => r.id === id)?.meta;

            if (!existingMeta) {
                const { data, error } = await supabase
                    .from('cheque_requisitions')
                    .select('meta')
                    .eq('id', id)
                    .single();
                if (error) {
                    if (isMissingTable(error)) return;
                    throw error;
                }
                existingMeta = ((data as { meta?: Partial<ChequeReqMeta> } | null)?.meta ?? {}) as Partial<ChequeReqMeta>;
            }

            const trimmedChequeNumber = chequeNumber !== undefined ? chequeNumber.trim() : undefined;
            const nextMeta: ChequeReqMeta = {
                ...EMPTY_META,
                ...existingMeta,
                places: { ...(existingMeta.places ?? {}) },
                ...(status !== undefined ? { status } : {}),
                ...(trimmedChequeNumber !== undefined ? { chequeNumber: trimmedChequeNumber } : {}),
                ...(notes !== undefined ? { notes } : {}),
            };

            const fullPatch: Record<string, unknown> = { meta: nextMeta };
            if (status !== undefined) fullPatch.status = status;
            if (trimmedChequeNumber !== undefined) fullPatch.cheque_number = trimmedChequeNumber;
            if (notes !== undefined) fullPatch.notes = notes;

            let { error } = await supabase.from('cheque_requisitions').update(fullPatch).eq('id', id);
            if (error) {
                if (isMissingTable(error)) return;
                if (isMissingColumn(error)) {
                    ({ error } = await supabase.from('cheque_requisitions').update({ meta: nextMeta }).eq('id', id));
                    if (error) {
                        if (isMissingTable(error)) return;
                        throw error;
                    }
                } else {
                    throw error;
                }
            }
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: CHEQUE_REQ_KEY }),
    });
}

export type ResetSupplierMemoryInput =
    | { ids: string[] }
    | { rows: SavedChequeReq[] };

/** Clear learned pick coordinates (`meta.places = {}`) on the given requisitions so a supplier's layout memory resets cleanly. */
export function useResetSupplierMemory() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input: ResetSupplierMemoryInput): Promise<number> => {
            const targets: Array<{ id: string; meta: ChequeReqMeta }> = [];

            if ('rows' in input) {
                for (const row of input.rows) {
                    if (row.id) {
                        targets.push({ id: row.id, meta: { ...EMPTY_META, ...(row.meta ?? {}) } });
                    }
                }
            } else {
                const uniqueIds = Array.from(new Set(input.ids.filter(Boolean)));
                if (uniqueIds.length === 0) return 0;

                const cachedById = new Map(
                    (queryClient.getQueryData<ChequeReqHistory>(CHEQUE_REQ_KEY)?.rows ?? []).map(r => [r.id, r])
                );
                const missingIds: string[] = [];
                for (const id of uniqueIds) {
                    const cached = cachedById.get(id);
                    if (cached) targets.push({ id, meta: { ...EMPTY_META, ...(cached.meta ?? {}) } });
                    else missingIds.push(id);
                }

                const CHUNK = 150;
                for (let i = 0; i < missingIds.length; i += CHUNK) {
                    const { data, error } = await supabase
                        .from('cheque_requisitions')
                        .select('id, meta')
                        .in('id', missingIds.slice(i, i + CHUNK));
                    if (error) {
                        if (isMissingTable(error)) return 0;
                        throw error;
                    }
                    for (const row of (data ?? []) as Array<{ id: string; meta?: Partial<ChequeReqMeta> }>) {
                        targets.push({ id: row.id, meta: { ...EMPTY_META, ...(row.meta ?? {}) } });
                    }
                }
            }

            const toUpdate = targets.filter(t => Object.keys(t.meta.places ?? {}).length > 0);
            if (toUpdate.length === 0) return 0;

            const CONCURRENCY = 10;
            for (let i = 0; i < toUpdate.length; i += CONCURRENCY) {
                const batch = toUpdate.slice(i, i + CONCURRENCY);
                await Promise.all(
                    batch.map(async ({ id, meta }) => {
                        const nextMeta: ChequeReqMeta = { ...meta, places: {} };
                        const { error } = await supabase
                            .from('cheque_requisitions')
                            .update({ meta: nextMeta })
                            .eq('id', id);
                        if (error && !isMissingTable(error)) throw error;
                    })
                );
            }

            return toUpdate.length;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: CHEQUE_REQ_KEY }),
    });
}

export function useDeleteChequeReq() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('cheque_requisitions').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: CHEQUE_REQ_KEY }),
    });
}
