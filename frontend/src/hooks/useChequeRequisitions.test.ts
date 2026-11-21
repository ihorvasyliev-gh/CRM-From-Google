import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    CHEQUE_REQ_KEY,
    fetchChequeReqHistory,
    useResetSupplierMemory,
    useSaveChequeReq,
    useUpdateChequeReqStatus,
    type ChequeReqHistory,
} from './useChequeRequisitions';
import { supabase } from '../lib/supabase';
import { EMPTY_FORM, EMPTY_META, type SavedChequeReq } from '../lib/chequeReq/types';

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: vi.fn(),
    },
}));

function makeQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
}

function createWrapper(queryClient: QueryClient) {
    return ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client: queryClient }, children);
}

function makeSavedRow(overrides: Partial<SavedChequeReq> = {}): SavedChequeReq {
    return {
        id: 'req-1',
        supplier_name: 'Acme Training Ltd',
        invoice_number: 'INV-100',
        invoice_date: '2026-04-10',
        amount: 1230,
        net_amount: 1000,
        form: { ...EMPTY_FORM, payeeName: 'Acme Training Ltd', amount: '1,230.00' },
        meta: { ...EMPTY_META, invoiceNumber: 'INV-100', invoiceDate: '2026-04-10', netAmount: 1000 },
        created_at: '2026-04-10T10:00:00Z',
        updated_at: '2026-04-10T10:00:00Z',
        ...overrides,
    };
}

describe('fetchChequeReqHistory', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('normalizes status, cheque_number, and notes from top-level columns or meta fallback', async () => {
        const rawRows = [
            // Migration 95 columns present (columns take precedence and mirror back into meta)
            {
                id: 'r-col',
                supplier_name: 'Column Supplier',
                invoice_number: 'INV-1',
                invoice_date: '2026-04-01',
                amount: '4260.50',
                net_amount: '3463.82',
                status: 'paid',
                cheque_number: 'CHQ-9001',
                notes: 'Cleared on Friday',
                form: { payeeName: 'Column Supplier', amount: '4,260.50' },
                meta: { invoiceNumber: 'INV-1', status: 'ready', chequeNumber: 'OLD' },
                created_at: '2026-04-02T10:00:00Z',
                updated_at: '2026-04-02T10:00:00Z',
            },
            // Pre-migration 95 row (no top-level columns; values stored inside meta)
            {
                id: 'r-meta',
                supplier_name: 'Meta Supplier',
                invoice_number: 'INV-2',
                invoice_date: '2026-04-02',
                amount: null,
                net_amount: null,
                form: { payeeName: 'Meta Supplier' },
                meta: { invoiceNumber: 'INV-2', status: 'draft', chequeNumber: 'EFT-42', notes: 'Waiting on PO' },
                created_at: '2026-04-01T10:00:00Z',
                updated_at: '2026-04-01T10:00:00Z',
            },
            // Legacy row without status/chequeNumber/notes in either place -> defaults
            {
                id: 'r-default',
                supplier_name: 'Legacy Supplier',
                invoice_number: null,
                invoice_date: null,
                amount: 500,
                net_amount: 500,
                form: {},
                meta: {},
                created_at: '2026-03-01T10:00:00Z',
                updated_at: '2026-03-01T10:00:00Z',
            },
        ];

        const range = vi.fn().mockResolvedValue({ data: rawRows, error: null });
        const orderId = vi.fn().mockReturnValue({ range });
        const orderCreated = vi.fn().mockReturnValue({ order: orderId });
        const select = vi.fn().mockReturnValue({ order: orderCreated });
        vi.mocked(supabase.from).mockReturnValue({ select } as never);

        const result = await fetchChequeReqHistory();

        expect(supabase.from).toHaveBeenCalledWith('cheque_requisitions');
        expect(orderCreated).toHaveBeenCalledWith('created_at', { ascending: false });
        expect(orderId).toHaveBeenCalledWith('id', { ascending: false });
        expect(range).toHaveBeenCalledWith(0, 999);

        expect(result.available).toBe(true);
        expect(result.rows).toHaveLength(3);

        // Top-level columns win and mirror into meta
        expect(result.rows[0]).toMatchObject({
            id: 'r-col',
            amount: 4260.5,
            net_amount: 3463.82,
            status: 'paid',
            cheque_number: 'CHQ-9001',
            notes: 'Cleared on Friday',
        });
        expect(result.rows[0].meta).toMatchObject({
            invoiceNumber: 'INV-1',
            status: 'paid',
            chequeNumber: 'CHQ-9001',
            notes: 'Cleared on Friday',
            places: {},
        });

        // Meta fallback works pre-migration 95
        expect(result.rows[1]).toMatchObject({
            id: 'r-meta',
            amount: null,
            net_amount: null,
            status: 'draft',
            cheque_number: 'EFT-42',
            notes: 'Waiting on PO',
        });
        expect(result.rows[1].meta).toMatchObject({
            status: 'draft',
            chequeNumber: 'EFT-42',
            notes: 'Waiting on PO',
        });

        // Legacy defaults
        expect(result.rows[2]).toMatchObject({
            id: 'r-default',
            status: 'ready',
            cheque_number: '',
            notes: '',
        });
        expect(result.rows[2].meta).toMatchObject({
            status: 'ready',
            chequeNumber: '',
            notes: '',
        });
    });

    it('paginates across 1,000-row chunks without silently truncating', async () => {
        const page0 = Array.from({ length: 1000 }, (_, i) => makeSavedRow({ id: `row-${i}` }));
        const page1 = [makeSavedRow({ id: 'row-1000' }), makeSavedRow({ id: 'row-1001' })];

        const range = vi.fn((from: number) => {
            if (from === 0) return Promise.resolve({ data: page0, error: null });
            if (from === 1000) return Promise.resolve({ data: page1, error: null });
            return Promise.resolve({ data: [], error: null });
        });
        const orderId = vi.fn().mockReturnValue({ range });
        const orderCreated = vi.fn().mockReturnValue({ order: orderId });
        const select = vi.fn().mockReturnValue({ order: orderCreated });
        vi.mocked(supabase.from).mockReturnValue({ select } as never);

        const result = await fetchChequeReqHistory();

        expect(result.available).toBe(true);
        expect(result.rows).toHaveLength(1002);
        expect(range).toHaveBeenCalledWith(0, 999);
        expect(range).toHaveBeenCalledWith(1000, 1999);
    });

    it.each(['PGRST205', '42P01'])('returns available: false gracefully when table is missing (%s)', async (code) => {
        const range = vi.fn().mockResolvedValue({
            data: null,
            error: { code, message: 'relation "public.cheque_requisitions" does not exist' },
        });
        const orderId = vi.fn().mockReturnValue({ range });
        const orderCreated = vi.fn().mockReturnValue({ order: orderId });
        const select = vi.fn().mockReturnValue({ order: orderCreated });
        vi.mocked(supabase.from).mockReturnValue({ select } as never);

        const result = await fetchChequeReqHistory();

        expect(result).toEqual({ rows: [], available: false });
    });

    it('rethrows non-missing-table errors', async () => {
        const range = vi.fn().mockResolvedValue({
            data: null,
            error: { code: '42501', message: 'permission denied' },
        });
        const orderId = vi.fn().mockReturnValue({ range });
        const orderCreated = vi.fn().mockReturnValue({ order: orderId });
        const select = vi.fn().mockReturnValue({ order: orderCreated });
        vi.mocked(supabase.from).mockReturnValue({ select } as never);

        await expect(fetchChequeReqHistory()).rejects.toMatchObject({ code: '42501' });
    });
});

describe('useSaveChequeReq', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('mirrors status, chequeNumber, notes into meta and writes top-level columns', async () => {
        const payloads: Record<string, unknown>[] = [];
        vi.mocked(supabase.from).mockReturnValue({
            insert: vi.fn((payload: Record<string, unknown>) => {
                payloads.push(payload);
                return {
                    select: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({ data: { id: 'new-1' }, error: null }),
                    }),
                };
            }),
        } as never);

        const queryClient = makeQueryClient();
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
        const { result } = renderHook(() => useSaveChequeReq(), { wrapper: createWrapper(queryClient) });

        const id = await result.current.mutateAsync({
            form: { ...EMPTY_FORM, payeeName: '  Brightway Safety  ', amount: '450.00' },
            meta: { ...EMPTY_META, invoiceNumber: 'INV-77', invoiceDate: '2026-04-12', netAmount: 365.85 },
            status: 'draft',
            chequeNumber: '  CHQ-77  ',
            notes: 'Hold until signed',
        });

        expect(id).toBe('new-1');
        expect(payloads).toHaveLength(1);
        expect(payloads[0]).toMatchObject({
            supplier_name: 'Brightway Safety',
            invoice_number: 'INV-77',
            invoice_date: '2026-04-12',
            amount: 450,
            net_amount: 365.85,
            status: 'draft',
            cheque_number: 'CHQ-77',
            notes: 'Hold until signed',
        });
        expect(payloads[0].meta).toMatchObject({
            invoiceNumber: 'INV-77',
            status: 'draft',
            chequeNumber: 'CHQ-77',
            notes: 'Hold until signed',
        });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: CHEQUE_REQ_KEY });
    });

    it.each([
        { code: 'PGRST204', message: "Could not find the 'status' column of 'cheque_requisitions' in the schema cache" },
        { code: '42703', message: 'column "status" of relation "cheque_requisitions" does not exist' },
    ])('falls back to migration-88 base columns when migration 95 columns are missing ($code)', async (missingColError) => {
        const payloads: Record<string, unknown>[] = [];
        vi.mocked(supabase.from).mockReturnValue({
            insert: vi.fn((payload: Record<string, unknown>) => {
                payloads.push(payload);
                const isFirst = payloads.length === 1;
                return {
                    select: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue(
                            isFirst
                                ? { data: null, error: missingColError }
                                : { data: { id: 'saved-fallback' }, error: null }
                        ),
                    }),
                };
            }),
        } as never);

        const queryClient = makeQueryClient();
        const { result } = renderHook(() => useSaveChequeReq(), { wrapper: createWrapper(queryClient) });

        const id = await result.current.mutateAsync({
            form: { ...EMPTY_FORM, payeeName: 'Acme Ltd', amount: '100.00' },
            meta: { ...EMPTY_META, invoiceNumber: 'INV-9' },
            status: 'paid',
            chequeNumber: 'CHQ-9',
            notes: 'Paid early',
        });

        expect(id).toBe('saved-fallback');
        expect(payloads).toHaveLength(2);
        // First attempt includes migration-95 columns
        expect(payloads[0]).toHaveProperty('status', 'paid');
        expect(payloads[0]).toHaveProperty('cheque_number', 'CHQ-9');
        expect(payloads[0]).toHaveProperty('notes', 'Paid early');
        // Fallback retry omits migration-95 columns but keeps them mirrored in meta
        expect(payloads[1]).not.toHaveProperty('status');
        expect(payloads[1]).not.toHaveProperty('cheque_number');
        expect(payloads[1]).not.toHaveProperty('notes');
        expect(payloads[1].meta).toMatchObject({
            status: 'paid',
            chequeNumber: 'CHQ-9',
            notes: 'Paid early',
        });
    });

    it('returns null without retrying when table is missing (PGRST205)', async () => {
        const insert = vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { code: 'PGRST205', message: "Could not find the table 'public.cheque_requisitions' in the schema cache" },
                }),
            }),
        });
        vi.mocked(supabase.from).mockReturnValue({ insert } as never);

        const queryClient = makeQueryClient();
        const { result } = renderHook(() => useSaveChequeReq(), { wrapper: createWrapper(queryClient) });

        const id = await result.current.mutateAsync({
            form: { ...EMPTY_FORM, payeeName: 'Acme Ltd', amount: '100.00' },
            meta: { ...EMPTY_META },
        });

        expect(id).toBeNull();
        expect(insert).toHaveBeenCalledTimes(1);
    });
});

describe('useUpdateChequeReqStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('updates status, cheque_number, notes and mirrored meta preserving existing meta fields from cache', async () => {
        const patches: Record<string, unknown>[] = [];
        const eq = vi.fn().mockResolvedValue({ error: null });
        const update = vi.fn((patch: Record<string, unknown>) => {
            patches.push(patch);
            return { eq };
        });
        vi.mocked(supabase.from).mockReturnValue({ update } as never);

        const queryClient = makeQueryClient();
        const existingRow = makeSavedRow({
            id: 'req-42',
            meta: {
                ...EMPTY_META,
                invoiceNumber: 'INV-42',
                supplierVat: 'IE1234567A',
                places: { poNumber: { rect: { page: 0, x: 10, y: 20, w: 30, h: 12 } } },
                status: 'ready',
                notes: 'Initial note',
            },
        });
        queryClient.setQueryData<ChequeReqHistory>(CHEQUE_REQ_KEY, { rows: [existingRow], available: true });
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

        const { result } = renderHook(() => useUpdateChequeReqStatus(), { wrapper: createWrapper(queryClient) });

        await result.current.mutateAsync({
            id: 'req-42',
            status: 'paid',
            chequeNumber: '  CHQ-420  ',
        });

        expect(patches).toHaveLength(1);
        expect(patches[0]).toMatchObject({
            status: 'paid',
            cheque_number: 'CHQ-420',
        });
        expect(patches[0]).not.toHaveProperty('notes');
        expect(patches[0].meta).toMatchObject({
            invoiceNumber: 'INV-42',
            supplierVat: 'IE1234567A',
            places: { poNumber: { rect: { page: 0, x: 10, y: 20, w: 30, h: 12 } } },
            status: 'paid',
            chequeNumber: 'CHQ-420',
            notes: 'Initial note',
        });
        expect(eq).toHaveBeenCalledWith('id', 'req-42');
        expect(invalidate).toHaveBeenCalledWith({ queryKey: CHEQUE_REQ_KEY });
    });

    it('fetches existing meta on cold cache and falls back to meta-only update before migration 95', async () => {
        const patches: Record<string, unknown>[] = [];
        vi.mocked(supabase.from).mockReturnValue({
            select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                        data: { meta: { invoiceNumber: 'INV-COLD', supplierDomain: 'acme' } },
                        error: null,
                    }),
                }),
            }),
            update: vi.fn((patch: Record<string, unknown>) => {
                patches.push(patch);
                const isFirst = patches.length === 1;
                return {
                    eq: vi.fn().mockResolvedValue(
                        isFirst
                            ? { error: { code: '42703', message: 'column "notes" does not exist' } }
                            : { error: null }
                    ),
                };
            }),
        } as never);

        const queryClient = makeQueryClient();
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
        const { result } = renderHook(() => useUpdateChequeReqStatus(), { wrapper: createWrapper(queryClient) });

        await result.current.mutateAsync({
            id: 'req-cold',
            status: 'paid',
            chequeNumber: 'EFT-99',
            notes: 'Settled in batch',
        });

        expect(patches).toHaveLength(2);
        expect(patches[0]).toMatchObject({ status: 'paid', cheque_number: 'EFT-99', notes: 'Settled in batch' });
        expect(patches[1]).toEqual({
            meta: expect.objectContaining({
                invoiceNumber: 'INV-COLD',
                supplierDomain: 'acme',
                status: 'paid',
                chequeNumber: 'EFT-99',
                notes: 'Settled in batch',
            }),
        });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: CHEQUE_REQ_KEY });
    });
});

describe('useResetSupplierMemory', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('clears meta.places on rows passed via { ids } while preserving other meta and skipping empty-places rows', async () => {
        const updated: Array<{ id: string; meta: Record<string, unknown> }> = [];
        vi.mocked(supabase.from).mockReturnValue({
            select: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({
                    data: [
                        {
                            id: 'r-remote',
                            meta: {
                                invoiceNumber: 'INV-REMOTE',
                                places: { amount: { rect: { page: 0, x: 5, y: 5, w: 40, h: 10 } } },
                            },
                        },
                    ],
                    error: null,
                }),
            }),
            update: vi.fn((patch: { meta: Record<string, unknown> }) => ({
                eq: vi.fn((_col: string, id: string) => {
                    updated.push({ id, meta: patch.meta });
                    return Promise.resolve({ error: null });
                }),
            })),
        } as never);

        const queryClient = makeQueryClient();
        queryClient.setQueryData<ChequeReqHistory>(CHEQUE_REQ_KEY, {
            available: true,
            rows: [
                makeSavedRow({
                    id: 'r-cached-learned',
                    meta: {
                        ...EMPTY_META,
                        invoiceNumber: 'INV-C1',
                        supplierVat: 'IE999',
                        places: { poNumber: { rect: { page: 0, x: 1, y: 2, w: 3, h: 4 } } },
                    },
                }),
                makeSavedRow({
                    id: 'r-cached-empty',
                    meta: { ...EMPTY_META, invoiceNumber: 'INV-C2', places: {} },
                }),
            ],
        });
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

        const { result } = renderHook(() => useResetSupplierMemory(), { wrapper: createWrapper(queryClient) });
        const count = await result.current.mutateAsync({ ids: ['r-cached-learned', 'r-cached-empty', 'r-remote'] });

        expect(count).toBe(2);
        expect(updated).toHaveLength(2);
        expect(updated.find(u => u.id === 'r-cached-learned')?.meta).toMatchObject({
            invoiceNumber: 'INV-C1',
            supplierVat: 'IE999',
            places: {},
        });
        expect(updated.find(u => u.id === 'r-remote')?.meta).toMatchObject({
            invoiceNumber: 'INV-REMOTE',
            places: {},
        });
        expect(updated.find(u => u.id === 'r-cached-empty')).toBeUndefined();
        expect(invalidate).toHaveBeenCalledWith({ queryKey: CHEQUE_REQ_KEY });
    });

    it('clears meta.places when passed { rows } directly without extra SELECT queries', async () => {
        const updated: Array<{ id: string; meta: Record<string, unknown> }> = [];
        const select = vi.fn();
        vi.mocked(supabase.from).mockReturnValue({
            select,
            update: vi.fn((patch: { meta: Record<string, unknown> }) => ({
                eq: vi.fn((_col: string, id: string) => {
                    updated.push({ id, meta: patch.meta });
                    return Promise.resolve({ error: null });
                }),
            })),
        } as never);

        const queryClient = makeQueryClient();
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
        const { result } = renderHook(() => useResetSupplierMemory(), { wrapper: createWrapper(queryClient) });

        const rows = [
            makeSavedRow({
                id: 'r-direct',
                meta: {
                    ...EMPTY_META,
                    invoiceNumber: 'INV-DIRECT',
                    places: { description: { rect: { page: 0, x: 10, y: 10, w: 50, h: 12 } } },
                },
            }),
        ];

        const count = await result.current.mutateAsync({ rows });

        expect(count).toBe(1);
        expect(select).not.toHaveBeenCalled();
        expect(updated).toHaveLength(1);
        expect(updated[0].id).toBe('r-direct');
        expect(updated[0].meta).toMatchObject({ invoiceNumber: 'INV-DIRECT', places: {} });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: CHEQUE_REQ_KEY });
    });
});
