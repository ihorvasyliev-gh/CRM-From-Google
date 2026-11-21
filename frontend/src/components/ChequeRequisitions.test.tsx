import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ChequeRequisitions from './ChequeRequisitions';
import { todayISO } from '../lib/dateUtils';
import { EMPTY_FORM, EMPTY_META, type SavedChequeReq } from '../lib/chequeReq/types';

const mockUseAuth = vi.fn();
const mockUseChequeReqHistory = vi.fn();
const mockSaveMutateAsync = vi.fn();
const mockDeleteMutateAsync = vi.fn();
const mockUpdateStatusMutateAsync = vi.fn();
const mockResetMemoryMutateAsync = vi.fn();
const mockExportChequeReqsToExcel = vi.fn();
const mockRenderChequeReq = vi.fn();
const mockDownloadBlob = vi.fn();

vi.mock('../lib/supabase', () => ({
    supabase: {},
}));

vi.mock('../contexts/AuthContext', () => ({
    useAuth: () => mockUseAuth(),
}));

vi.mock('../hooks/useChequeRequisitions', () => ({
    CHEQUE_REQ_KEY: ['cheque_requisitions'],
    fetchChequeReqHistory: vi.fn(),
    useChequeReqHistory: () => mockUseChequeReqHistory(),
    useSaveChequeReq: () => ({ mutateAsync: mockSaveMutateAsync, isPending: false }),
    useDeleteChequeReq: () => ({ mutateAsync: mockDeleteMutateAsync, isPending: false }),
    useUpdateChequeReqStatus: () => ({ mutateAsync: mockUpdateStatusMutateAsync, isPending: false }),
    useResetSupplierMemory: () => ({ mutateAsync: mockResetMemoryMutateAsync, isPending: false }),
}));

vi.mock('../lib/chequeReq/export', () => ({
    exportChequeReqsToExcel: (...args: unknown[]) => mockExportChequeReqsToExcel(...args),
    renderChequeReqPdf: vi.fn().mockResolvedValue(new Blob(['pdf'])),
    renderChequeReqBatchZip: vi.fn().mockResolvedValue({ blob: new Blob(['zip']), fileName: 'batch.zip' }),
}));

vi.mock('../lib/chequeReq/docx', async importOriginal => ({
    ...(await importOriginal<typeof import('../lib/chequeReq/docx')>()),
    renderChequeReq: (...args: unknown[]) => mockRenderChequeReq(...args),
    renderChequeReqBytes: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
}));

vi.mock('../lib/download', () => ({
    downloadBlob: (...args: unknown[]) => mockDownloadBlob(...args),
}));

vi.mock('./ChequeRequisitions/RequisitionLivePreview', () => ({
    default: () => <div data-testid="live-preview-stub">Live Preview</div>,
}));

const CURRENT_YEAR = todayISO().slice(0, 4);

const sampleRows: SavedChequeReq[] = [
    {
        id: 'req-1',
        supplier_name: 'Brightway Safety Ltd',
        invoice_number: 'INV-1001',
        invoice_date: `${CURRENT_YEAR}-03-10`,
        amount: 3690,
        net_amount: 3000,
        status: 'ready',
        cheque_number: '',
        notes: '',
        form: {
            ...structuredClone(EMPTY_FORM),
            actionNumber: '9.',
            poNumber: 'PO-9001',
            payeeName: 'Brightway Safety Ltd',
            payeeAddress: '12 South Mall, Cork',
            amount: '3,690.00',
            amountQuoted: '3,690.00',
            description: 'Safe Pass training',
            requestedBy: 'Other Coordinator',
            quoteBy: { shop: false, telephone: false, email: true, meeting: false, online: false },
            quoteEmail: 'quotes@brightway.ie',
        },
        meta: {
            ...EMPTY_META,
            invoiceNumber: 'INV-1001',
            invoiceDate: `${CURRENT_YEAR}-03-10`,
            netAmount: 3000,
            supplierVat: 'IE1111111T',
            supplierEmail: 'quotes@brightway.ie',
            status: 'ready',
            places: {
                amount: { rect: { page: 0, x: 400, y: 200, w: 80, h: 12 } },
                poNumber: { rect: { page: 0, x: 100, y: 700, w: 60, h: 12 } },
            },
        },
        created_at: `${CURRENT_YEAR}-03-10T11:00:00Z`,
        updated_at: `${CURRENT_YEAR}-03-10T11:00:00Z`,
    },
    {
        id: 'req-2',
        supplier_name: 'Brightway Safety Ltd',
        invoice_number: 'INV-1002',
        invoice_date: `${CURRENT_YEAR}-05-15`,
        amount: 3075,
        net_amount: 2500,
        status: 'paid',
        cheque_number: 'CHQ-404',
        notes: 'Settled in May run',
        form: {
            ...structuredClone(EMPTY_FORM),
            actionNumber: '9.',
            poNumber: 'PO-9002',
            payeeName: 'Brightway Safety Ltd',
            payeeAddress: '12 South Mall, Cork',
            amount: '3,075.00',
            amountQuoted: '3,075.00',
            description: 'Manual Handling refresher',
            requestedBy: 'Other Coordinator',
            quoteBy: { shop: false, telephone: false, email: true, meeting: false, online: false },
            quoteEmail: 'quotes@brightway.ie',
        },
        meta: {
            ...EMPTY_META,
            invoiceNumber: 'INV-1002',
            invoiceDate: `${CURRENT_YEAR}-05-15`,
            netAmount: 2500,
            supplierVat: 'IE1111111T',
            supplierEmail: 'quotes@brightway.ie',
            status: 'paid',
            chequeNumber: 'CHQ-404',
            notes: 'Settled in May run',
            places: {},
        },
        created_at: `${CURRENT_YEAR}-05-15T10:00:00Z`,
        updated_at: `${CURRENT_YEAR}-05-15T10:00:00Z`,
    },
    {
        id: 'req-3',
        supplier_name: 'Greenleaf Catering',
        invoice_number: 'INV-2050',
        invoice_date: `${CURRENT_YEAR}-06-02`,
        amount: 420,
        net_amount: 420,
        status: 'draft',
        cheque_number: '',
        notes: '',
        form: {
            ...structuredClone(EMPTY_FORM),
            actionNumber: '4.',
            poNumber: 'PO-7744',
            payeeName: 'Greenleaf Catering',
            payeeAddress: '8 Oliver Plunkett St, Cork',
            amount: '420.00',
            amountQuoted: '420.00',
            description: 'Community coffee morning',
            requestedBy: 'Other Coordinator',
            quoteBy: { shop: false, telephone: true, email: false, meeting: false, online: false },
            quotePhone: '021 555 8899',
        },
        meta: {
            ...EMPTY_META,
            invoiceNumber: 'INV-2050',
            invoiceDate: `${CURRENT_YEAR}-06-02`,
            netAmount: 420,
            supplierVat: 'IE2222222W',
            supplierPhone: '021 555 8899',
            status: 'draft',
            places: {},
        },
        created_at: `${CURRENT_YEAR}-06-02T09:00:00Z`,
        updated_at: `${CURRENT_YEAR}-06-02T09:00:00Z`,
    },
];

function renderPage() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <ChequeRequisitions />
        </QueryClientProvider>,
    );
}

describe('ChequeRequisitions', () => {
    beforeEach(() => {
        localStorage.clear();
        mockUseAuth.mockReset().mockReturnValue({
            user: {
                id: 'user-1',
                email: 'niamh@corkcitypartnership.ie',
                user_metadata: { full_name: 'Niamh O’Connor' },
            },
        });
        mockUseChequeReqHistory.mockReset().mockReturnValue({
            data: { rows: sampleRows, available: true },
            isLoading: false,
            error: null,
            refetch: vi.fn(),
        });
        mockSaveMutateAsync.mockReset().mockResolvedValue('saved-new-id');
        mockDeleteMutateAsync.mockReset().mockResolvedValue(undefined);
        mockUpdateStatusMutateAsync.mockReset().mockResolvedValue(undefined);
        mockResetMemoryMutateAsync.mockReset().mockResolvedValue(1);
        mockExportChequeReqsToExcel.mockReset().mockResolvedValue(undefined);
        mockRenderChequeReq.mockReset().mockResolvedValue(new Blob(['docx']));
        mockDownloadBlob.mockReset();
    });

    it('renders the 4 KPI StatTiles and 3 UnderlineTabs (New / Queue, History, Suppliers & €5k)', () => {
        renderPage();

        // 4 KPI StatTiles
        expect(screen.getByText(`Requisitions (${CURRENT_YEAR})`)).toBeInTheDocument();
        expect(screen.getByText('Suppliers near / over €5k')).toBeInTheDocument();
        expect(screen.getByText('3 quotes required')).toBeInTheDocument();
        expect(screen.getByText('Drafts to finish')).toBeInTheDocument();
        expect(screen.getByText('Remembered suppliers')).toBeInTheDocument();
        expect(screen.getByText('1 with learned invoice zones')).toBeInTheDocument();

        // 3 UnderlineTabs
        const tablist = screen.getByRole('tablist', { name: 'Cheque requisition sections' });
        expect(within(tablist).getByRole('tab', { name: /New \/ Queue/ })).toHaveAttribute('aria-selected', 'true');
        expect(within(tablist).getByRole('tab', { name: /History/ })).toHaveTextContent('3');
        expect(within(tablist).getByRole('tab', { name: /Suppliers & €5k/ })).toHaveTextContent('2');
    });

    it('uses signed-in user staffNameOf(user) for requestedBy on a blank requisition instead of another admin’s last saved requestedBy', () => {
        renderPage();

        // Click top-bar "Blank requisition" button (history rows all have requestedBy: "Other Coordinator")
        fireEvent.click(screen.getByRole('button', { name: 'Blank requisition' }));

        expect(screen.getByLabelText('Requested by')).toHaveValue('Niamh O’Connor');
        expect(screen.getByLabelText('Requested by')).not.toHaveValue('Other Coordinator');
        // Action number still conveniently defaults from recent history
        expect(screen.getByLabelText('SICAP action number')).toHaveValue('9.');
    });

    it('History tab supports searching by supplier/invoice/PO, status filtering, exporting Excel, and duplicating as a fresh unsaved draft', async () => {
        renderPage();

        const tablist = screen.getByRole('tablist', { name: 'Cheque requisition sections' });
        fireEvent.click(within(tablist).getByRole('tab', { name: /History/ }));

        const table = screen.getByRole('table');
        expect(within(table).getAllByRole('row')).toHaveLength(4); // header + 3 rows

        // Search by supplier
        const search = screen.getByLabelText('Search requisitions');
        fireEvent.change(search, { target: { value: 'Greenleaf' } });
        expect(within(table).getAllByRole('row')).toHaveLength(2);
        expect(within(table).getByText('Greenleaf Catering')).toBeInTheDocument();

        // Search by invoice number
        fireEvent.change(search, { target: { value: 'INV-1002' } });
        expect(within(table).getAllByRole('row')).toHaveLength(2);
        expect(within(table).getByText('INV-1002')).toBeInTheDocument();

        // Search by PO number
        fireEvent.change(search, { target: { value: 'PO-9001' } });
        expect(within(table).getAllByRole('row')).toHaveLength(2);
        expect(within(table).getByText('INV-1001')).toBeInTheDocument();

        // Clear search and test status filter pills (Draft / Ready / Paid)
        fireEvent.change(search, { target: { value: '' } });
        const statusTabs = screen.getByRole('tablist', { name: 'Filter by requisition status' });

        fireEvent.click(within(statusTabs).getByRole('tab', { name: /Draft/ }));
        expect(within(table).getAllByRole('row')).toHaveLength(2);
        expect(within(table).getByText('Greenleaf Catering')).toBeInTheDocument();

        fireEvent.click(within(statusTabs).getByRole('tab', { name: /Paid/ }));
        expect(within(table).getAllByRole('row')).toHaveLength(2);
        expect(within(table).getByText('INV-1002')).toBeInTheDocument();

        fireEvent.click(within(statusTabs).getByRole('tab', { name: /Ready/ }));
        expect(within(table).getAllByRole('row')).toHaveLength(2);
        expect(within(table).getByText('INV-1001')).toBeInTheDocument();

        // Export Excel triggers exportChequeReqsToExcel with the currently filtered rows
        fireEvent.click(screen.getByRole('button', { name: /Export Excel/ }));
        await waitFor(() =>
            expect(mockExportChequeReqsToExcel).toHaveBeenCalledWith(
                [expect.objectContaining({ id: 'req-1', invoice_number: 'INV-1001' })],
                'all',
            ),
        );

        // Duplicate opens a fresh unsaved draft in the editor
        fireEvent.click(within(table).getByRole('button', { name: 'More actions for Brightway Safety Ltd' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate as new' }));

        expect(screen.getByLabelText('Payee name')).toHaveValue('Brightway Safety Ltd');
        expect(screen.getByLabelText('Invoice number')).toHaveValue('');
        expect(screen.getByLabelText('Requested by')).toHaveValue('Niamh O’Connor');

        // Saving the duplicated draft calls save with id: undefined and status: 'draft'
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() =>
            expect(mockSaveMutateAsync).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: undefined,
                    status: 'draft',
                    form: expect.objectContaining({ payeeName: 'Brightway Safety Ltd' }),
                }),
            ),
        );
    });

    it('Suppliers tab shows €5,000 threshold progress, 3 quotes needed badge, History navigation, New requisition prefill, and Reset zones mutation', async () => {
        renderPage();

        const tablist = screen.getByRole('tablist', { name: 'Cheque requisition sections' });
        fireEvent.click(within(tablist).getByRole('tab', { name: /Suppliers & €5k/ }));

        // Brightway Safety Ltd has €5,500 excl. VAT (>= €5,000) -> 3 quotes needed & progressbar
        const brightwayCard = screen.getByRole('heading', { name: 'Brightway Safety Ltd' }).closest('article')!;
        expect(within(brightwayCard).getByText('3 quotes needed')).toBeInTheDocument();
        expect(within(brightwayCard).getByText('+€500.00 over')).toBeInTheDocument();
        const progress = within(brightwayCard).getByRole('progressbar', {
            name: 'Brightway Safety Ltd annual spend toward €5,000 limit',
        });
        expect(progress).toHaveAttribute('aria-valuenow', '5500');
        expect(progress).toHaveAttribute('aria-valuemax', '5000');

        // Greenleaf Catering has €420 excl. VAT -> Single quote badge
        const greenleafCard = screen.getByRole('heading', { name: 'Greenleaf Catering' }).closest('article')!;
        expect(within(greenleafCard).getByText('Single quote')).toBeInTheDocument();

        // Reset zones opens confirm dialog and invokes resetMemory mutation with Brightway's requisition IDs
        fireEvent.click(within(brightwayCard).getByRole('button', { name: /Reset zones/ }));
        const dialog = await screen.findByRole('alertdialog');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Reset zones' }));
        await waitFor(() =>
            expect(mockResetMemoryMutateAsync).toHaveBeenCalledWith({
                ids: expect.arrayContaining(['req-1', 'req-2']),
            }),
        );

        // Clicking History (2) switches to History tab filtered to Brightway Safety Ltd
        fireEvent.click(within(brightwayCard).getByRole('button', { name: /History \(2\)/ }));
        expect(within(tablist).getByRole('tab', { name: /History/ })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('Supplier: Brightway Safety Ltd')).toBeInTheDocument();
        const table = screen.getByRole('table');
        expect(within(table).getAllByRole('row')).toHaveLength(3); // header + 2 Brightway rows
        expect(within(table).queryByText('Greenleaf Catering')).not.toBeInTheDocument();

        // Switch back to Suppliers tab and click "New requisition" on Greenleaf Catering
        fireEvent.click(within(tablist).getByRole('tab', { name: /Suppliers & €5k/ }));
        const greenleafAgain = screen.getByRole('heading', { name: 'Greenleaf Catering' }).closest('article')!;
        fireEvent.click(within(greenleafAgain).getByRole('button', { name: /New requisition/ }));

        // Editor opens prefilled with Greenleaf's details and signed-in user's Requested by
        expect(screen.getByLabelText('Payee name')).toHaveValue('Greenleaf Catering');
        expect(screen.getByLabelText('Payee address')).toHaveValue('8 Oliver Plunkett St, Cork');
        expect(screen.getByLabelText('SICAP action number')).toHaveValue('4.');
        expect(screen.getByLabelText('Requested by')).toHaveValue('Niamh O’Connor');
        expect(screen.getByRole('checkbox', { name: 'Telephone' })).toBeChecked();
        expect(screen.getByLabelText('Phone no.')).toHaveValue('021 555 8899');
    });
});
