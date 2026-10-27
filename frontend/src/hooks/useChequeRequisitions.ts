import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { netOfPayment } from '../lib/chequeReq/draft';
import { parseAmount } from '../lib/chequeReq/parse';
import { EMPTY_FORM, EMPTY_META, type ChequeReqForm, type ChequeReqMeta, type SavedChequeReq } from '../lib/chequeReq/types';

// Requisitions that were downloaded live in public.cheque_requisitions (migration 88, admins only).
export const CHEQUE_REQ_KEY = ['cheque_requisitions'] as const;

export interface ChequeReqHistory {
    rows: SavedChequeReq[];
    /** false until migration 88 is applied: requisitions still work, they just aren't kept */
    available: boolean;
}

function isMissingTable(error: { code?: string } | null): boolean {
    return error?.code === 'PGRST205' || error?.code === '42P01';
}

function normalize(row: SavedChequeReq): SavedChequeReq {
    const form = (row.form ?? {}) as Partial<ChequeReqForm>;
    return {
        ...row,
        amount: row.amount === null ? null : Number(row.amount),
        net_amount: row.net_amount === null ? null : Number(row.net_amount),
        form: {
            ...EMPTY_FORM,
            ...form,
            quoteBy: { ...EMPTY_FORM.quoteBy, ...(form.quoteBy ?? {}) },
            checklist: { ...EMPTY_FORM.checklist, ...(form.checklist ?? {}) },
        },
        meta: { ...EMPTY_META, ...((row.meta ?? {}) as Partial<ChequeReqMeta>) },
    };
}

export async function fetchChequeReqHistory(): Promise<ChequeReqHistory> {
    const { data, error } = await supabase.from('cheque_requisitions').select('*').order('created_at', { ascending: false }).limit(1000);
    if (error) {
        if (isMissingTable(error)) return { rows: [], available: false };
        throw error;
    }
    return { rows: ((data ?? []) as SavedChequeReq[]).map(normalize), available: true };
}

export function useChequeReqHistory() {
    return useQuery({ queryKey: CHEQUE_REQ_KEY, queryFn: fetchChequeReqHistory });
}

export interface SaveChequeReqInput {
    id?: string;
    form: ChequeReqForm;
    meta: ChequeReqMeta;
}

/** Keep a downloaded requisition (or update the one already kept). Resolves to its id, or null before migration 88. */
export function useSaveChequeReq() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, form, meta }: SaveChequeReqInput): Promise<string | null> => {
            const row = {
                supplier_name: form.payeeName.trim(),
                invoice_number: meta.invoiceNumber.trim() || null,
                invoice_date: meta.invoiceDate || null,
                amount: parseAmount(form.amount),
                net_amount: netOfPayment(parseAmount(form.amount), meta.netAmount),
                form,
                meta,
            };
            const query = id
                ? supabase.from('cheque_requisitions').update(row).eq('id', id).select('id').single()
                : supabase.from('cheque_requisitions').insert(row).select('id').single();
            const { data, error } = await query;
            if (error) {
                if (isMissingTable(error)) return null;
                throw error;
            }
            return (data as { id: string }).id;
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
