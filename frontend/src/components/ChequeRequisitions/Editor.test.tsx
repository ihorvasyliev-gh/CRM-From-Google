import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ChequeReqEditor, { type EditorSession, type LoadedInvoice } from './Editor';
import { EMPTY_FORM, EMPTY_META, type SavedChequeReq } from '../../lib/chequeReq/types';
import type { Phrase } from '../../lib/pdfForms/types';

const keep = vi.fn();
const renderChequeReq = vi.fn();
vi.mock('../../lib/chequeReq/docx', async importOriginal => ({
    ...(await importOriginal<typeof import('../../lib/chequeReq/docx')>()),
    renderChequeReq: (...args: unknown[]) => renderChequeReq(...args),
}));
const downloadBlob = vi.fn();
vi.mock('../../lib/download', () => ({ downloadBlob: (...args: unknown[]) => downloadBlob(...args) }));
// jsdom lays nothing out: the invoice panel is 600 px wide
vi.mock('../PdfForms/pdfHooks', async importOriginal => ({
    ...(await importOriginal<typeof import('../PdfForms/pdfHooks')>()),
    useElementWidth: () => [() => {}, 600],
}));

function ph(x: number, y: number, text: string, h = 9): Phrase {
    return { page: 0, x, y, w: text.length * h * 0.48, h, text };
}

/** A photo of an invoice, 600 × 800 pixels, already level */
const photo: LoadedInvoice = {
    kind: 'image',
    url: 'blob:invoice',
    fileName: 'invoice.jpg',
    size: { w: 600, h: 800 },
    angle: 0,
    phrases: [ph(40, 760, 'Riverbank Hall Hire', 16), ph(40, 740, '12 Quay Street,'), ph(40, 728, 'Cork'), ph(330, 300, 'Total due'), ph(470, 300, '€350.00')],
};

/** Where a phrase shows in the panel (1 CSS px a pixel; jsdom puts the panel at 0, 0) */
const pointAt = (p: Phrase) => ({ clientX: p.x + p.w / 2, clientY: 800 - p.y - p.h * 0.3, button: 0, pointerId: 1 });
const click = (layer: HTMLElement, p: Phrase) => {
    fireEvent.pointerDown(layer, pointAt(p));
    fireEvent.pointerUp(layer, pointAt(p));
};

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

    it('fills a field with text picked on the invoice, and keeps where it was for the supplier', async () => {
        render(<ChequeReqEditor session={{ ...session(), invoice: photo }} history={[]} historyAvailable keep={keep} onBack={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Pick the payment amount on the invoice' }));
        expect(screen.getByRole('status')).toHaveTextContent('Payment amount: click it on the invoice, or draw a box round it.');
        click(screen.getByTestId('pick-page-0'), photo.phrases[4]);
        expect(screen.getByLabelText('Payment amount')).toHaveValue('350.00');
        expect(screen.getByLabelText('Amount quoted')).toHaveValue('350.00');
        expect(screen.getByText('Picked on the invoice: the supplier’s next invoice is read in the same place')).toBeInTheDocument();
        // One click is all an amount takes
        expect(screen.queryByRole('status')).not.toBeInTheDocument();

        // An address takes a piece at a time; a second click on a piece takes it out
        fireEvent.click(screen.getByRole('button', { name: 'Pick the payee address on the invoice' }));
        const layer = screen.getByTestId('pick-page-0');
        click(layer, photo.phrases[2]);
        click(layer, photo.phrases[1]);
        click(layer, photo.phrases[0]);
        expect(screen.getByLabelText('Payee address')).toHaveValue('Riverbank Hall Hire, 12 Quay Street, Cork');
        click(layer, photo.phrases[0]);
        expect(screen.getByLabelText('Payee address')).toHaveValue('12 Quay Street, Cork');
        fireEvent.click(screen.getByRole('button', { name: 'Done' }));
        expect(screen.queryByTestId('pick-page-0')).not.toBeInTheDocument();

        // A box drawn round the name takes it
        fireEvent.click(screen.getByRole('button', { name: 'Pick the payee name on the invoice' }));
        fireEvent.pointerDown(screen.getByTestId('pick-page-0'), { clientX: 30, clientY: 30, button: 0, pointerId: 1 });
        fireEvent.pointerMove(screen.getByTestId('pick-page-0'), { clientX: 400, clientY: 50, button: 0, pointerId: 1 });
        fireEvent.pointerUp(screen.getByTestId('pick-page-0'), { clientX: 400, clientY: 50, button: 0, pointerId: 1 });
        expect(screen.getByLabelText('Payee name')).toHaveValue('Riverbank Hall Hire');

        fireEvent.click(screen.getByRole('button', { name: /Download the requisition/ }));
        fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Download anyway' }));
        await waitFor(() => expect(keep).toHaveBeenCalledWith(expect.objectContaining({ meta: expect.objectContaining({ places: { amount: expect.objectContaining({ anchors: [expect.objectContaining({ text: 'Total due' })] }) } }) })));
    });

    it('stops picking on Esc, and offers no picking without an invoice', () => {
        const { unmount } = render(<ChequeReqEditor session={{ ...session(), invoice: photo }} history={[]} historyAvailable keep={keep} onBack={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Pick the PO number on the invoice' }));
        expect(screen.getByRole('status')).toBeInTheDocument();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        unmount();
        render(<ChequeReqEditor session={session()} history={[]} historyAvailable keep={keep} onBack={vi.fn()} />);
        expect(screen.queryByRole('button', { name: /on the invoice$/ })).not.toBeInTheDocument();
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
