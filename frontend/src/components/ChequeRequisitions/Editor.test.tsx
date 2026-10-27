import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ChequeReqEditor, { type EditorSession } from './Editor';
import { EMPTY_FORM, EMPTY_META, type SavedChequeReq } from '../../lib/chequeReq/types';

const keep = vi.fn();
const renderChequeReq = vi.fn();
vi.mock('../../lib/chequeReq/docx', async importOriginal => ({
    ...(await importOriginal<typeof import('../../lib/chequeReq/docx')>()),
    renderChequeReq: (...args: unknown[]) => renderChequeReq(...args),
}));
const downloadBlob = vi.fn();
vi.mock('../../lib/download', () => ({ downloadBlob: (...args: unknown[]) => downloadBlob(...args) }));

function session(over: Partial<EditorSession['draft']> = {}): EditorSession {
    return {
        key: 's',
        invoice: null,
        facts: { hasText: false, supplier: {}, items: [], people: [], mentionsSicap: false },
        draft: {
            form: { ...EMPTY_FORM, payeeName: 'Brightway Safety', amount: '450.00', amountQuoted: '450.00', actionNumber: '9.' },
            flags: {
                poNumber: { level: 'missing', note: 'No PO number on the invoice' },
                payeeName: { level: 'check', note: 'Best guess from the invoice' },
                actionNumber: { level: 'memory', note: 'As on your requisition for INV-0090' },
            },
            meta: { ...EMPTY_META, invoiceNumber: 'INV-0101', invoiceDate: '2026-10-21', netAmount: 450 },
            ...over,
        },
    };
}

const earlier: SavedChequeReq = {
    id: 'old',
    supplier_name: 'Brightway Safety',
    invoice_number: 'INV-0101',
    invoice_date: '2026-10-21',
    amount: 450,
    net_amount: 450,
    form: { ...EMPTY_FORM, payeeName: 'Brightway Safety' },
    meta: { ...EMPTY_META },
    created_at: '2026-10-21T10:00:00Z',
    updated_at: '2026-10-21T10:00:00Z',
};

describe('ChequeReqEditor', () => {
    beforeEach(() => {
        localStorage.clear();
        keep.mockReset().mockResolvedValue('new-id');
        renderChequeReq.mockReset().mockResolvedValue(new Blob(['docx']));
        downloadBlob.mockReset();
    });

    it('marks guesses and missing values until they are edited or accepted', () => {
        render(<ChequeReqEditor session={session()} history={[]} historyAvailable keep={keep} onBack={vi.fn()} />);
        expect(screen.getByText('2 to check')).toBeInTheDocument();
        expect(screen.getByText('No PO number on the invoice')).toBeInTheDocument();
        expect(screen.getByText('As on your requisition for INV-0090')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('PO number'), { target: { value: '9001' } });
        expect(screen.queryByText('No PO number on the invoice')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Looks right' }));
        expect(screen.queryByText('Best guess from the invoice')).not.toBeInTheDocument();
        expect(screen.getByText('Ready')).toBeInTheDocument();
    });

    it('keeps the amount quoted with the payment amount', () => {
        render(<ChequeReqEditor session={session()} history={[]} historyAvailable keep={keep} onBack={vi.fn()} />);
        fireEvent.change(screen.getByLabelText('Payment amount'), { target: { value: '500.00' } });
        expect(screen.getByLabelText('Amount quoted')).toHaveValue('500.00');
    });

    it('asks before downloading with fields still marked, then downloads and keeps it', async () => {
        render(<ChequeReqEditor session={session()} history={[]} historyAvailable keep={keep} onBack={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /Download the requisition/ }));
        const dialog = await screen.findByRole('alertdialog');
        expect(within(dialog).getByText(/PO number, Payee name/)).toBeInTheDocument();
        expect(renderChequeReq).not.toHaveBeenCalled();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Download anyway' }));
        await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'SICAP Invoice INV-0101.docx'));
        expect(renderChequeReq).toHaveBeenCalledWith(expect.objectContaining({ payeeName: 'Brightway Safety', actionNumber: '9.' }));
        await waitFor(() => expect(keep).toHaveBeenCalledWith(expect.objectContaining({ id: undefined, meta: expect.objectContaining({ invoiceNumber: 'INV-0101' }) })));
        // The action number is remembered for the next requisition
        expect(JSON.parse(localStorage.getItem('cheque_req_defaults')!)).toMatchObject({ actionNumber: '9.' });
    });

    it('downloads at once when nothing is left to check, and updates the kept one next time', async () => {
        render(<ChequeReqEditor session={session({ flags: {} })} history={[]} historyAvailable keep={keep} onBack={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /Download the requisition/ }));
        await waitFor(() => expect(keep).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', { name: /Download the requisition/ }));
        await waitFor(() => expect(keep).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'new-id' })));
    });

    it('without a history (the public page) only downloads, remembering under its own key', async () => {
        render(<ChequeReqEditor session={session({ flags: {} })} history={[]} historyAvailable={false} defaultsKey="public_defaults" backLabel="New requisition" onBack={vi.fn()} />);
        expect(screen.getByText('Nothing is saved: you only get the file you download.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'New requisition' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Download the requisition/ }));
        await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'SICAP Invoice INV-0101.docx'));
        expect(keep).not.toHaveBeenCalled();
        await waitFor(() => expect(JSON.parse(localStorage.getItem('public_defaults')!)).toMatchObject({ actionNumber: '9.' }));
        expect(localStorage.getItem('cheque_req_defaults')).toBeNull();
    });

    it('warns when the invoice already has a requisition', () => {
        render(<ChequeReqEditor session={session()} history={[earlier]} historyAvailable keep={keep} onBack={vi.fn()} />);
        expect(screen.getByText(/already made a requisition for INV-0101/)).toBeInTheDocument();
    });

    it('asks before leaving work that was not downloaded', async () => {
        const onBack = vi.fn();
        render(<ChequeReqEditor session={session()} history={[]} historyAvailable keep={keep} onBack={onBack} />);
        fireEvent.change(screen.getByLabelText('Description of goods / services'), { target: { value: 'First Aid' } });
        fireEvent.click(screen.getByRole('button', { name: /All requisitions/ }));
        const dialog = await screen.findByRole('alertdialog');
        expect(onBack).not.toHaveBeenCalled();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Leave' }));
        expect(onBack).toHaveBeenCalled();
    });
});
