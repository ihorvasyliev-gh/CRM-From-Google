import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ChequeReqEditor, { type EditorSession, type LoadedInvoice } from './Editor';
import DefaultsModal from './DefaultsModal';
import { EMPTY_FORM, EMPTY_META, type InvoiceFacts, type SavedChequeReq } from '../../lib/chequeReq/types';
import type { Phrase } from '../../lib/pdfForms/types';

const keep = vi.fn();
const renderChequeReq = vi.fn();
const renderChequeReqPdf = vi.fn();
const renderChequeReqBatchZip = vi.fn();
const downloadBlob = vi.fn();

vi.mock('../../lib/chequeReq/docx', async importOriginal => ({
    ...(await importOriginal<typeof import('../../lib/chequeReq/docx')>()),
    renderChequeReq: (...args: unknown[]) => renderChequeReq(...args),
    renderChequeReqBytes: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
}));
vi.mock('../../lib/chequeReq/export', () => ({
    renderChequeReqPdf: (...args: unknown[]) => renderChequeReqPdf(...args),
    renderChequeReqBatchZip: (...args: unknown[]) => renderChequeReqBatchZip(...args),
}));
vi.mock('../../lib/download', () => ({
    downloadBlob: (...args: unknown[]) => downloadBlob(...args),
}));
vi.mock('./RequisitionLivePreview', () => ({
    default: () => <div data-testid="live-preview-stub">Live Preview</div>,
}));
vi.mock('../PdfForms/pdfHooks', async importOriginal => ({
    ...(await importOriginal<typeof import('../PdfForms/pdfHooks')>()),
    useElementWidth: () => [() => {}, 600],
}));

function ph(x: number, y: number, text: string, h = 9): Phrase {
    return { page: 0, x, y, w: text.length * h * 0.48, h, text };
}

function makePhoto(fileName = 'invoice-1.jpg', phrases?: Phrase[]): LoadedInvoice {
    return {
        kind: 'image',
        url: `blob:${fileName}`,
        fileName,
        size: { w: 600, h: 800 },
        angle: 0,
        phrases: phrases ?? [
            ph(40, 760, 'Brightway Safety Training Ltd', 14),
            ph(40, 730, 'Invoice No: INV-2026-044'),
            ph(40, 710, 'PO Number: PO-8821'),
            ph(40, 680, 'Manual Handling QQI Level 5'),
            ph(40, 640, 'Subtotal: €1,000.00'),
            ph(40, 620, 'Total Due: €1,230.00'),
        ],
    };
}

function makeFacts(over: Partial<InvoiceFacts> = {}): InvoiceFacts {
    return {
        hasText: true,
        mentionsSicap: true,
        invoiceNumber: { value: 'INV-2026-044', sure: true },
        poNumber: { value: 'PO-8821', sure: true },
        total: { value: 1230, sure: true },
        subtotal: { value: 1000, sure: true },
        vat: { value: 230, sure: true },
        candidateAmounts: [
            { value: 1230, label: 'Total' },
            { value: 1000, label: 'Subtotal' },
            { value: 230, label: 'VAT' },
        ],
        candidateDates: [
            { iso: '2026-10-15', label: 'Invoice date' },
            { iso: '2026-11-14', label: 'Due date' },
        ],
        supplier: {
            name: { value: 'Brightway Safety Training Ltd', sure: true },
            email: 'accounts@brightway.ie',
            phone: '021 555 0199',
            vatNumber: 'IE1234567T',
        },
        items: [
            { description: 'Manual Handling QQI Level 5', details: [], quantity: 10, unitPrice: 100, amount: 1000 },
            { description: 'Venue catering lunch', details: [], amount: 230 },
        ],
        serviceDates: { start: '2026-10-10' },
        people: [],
        ...over,
    };
}

function makeSession(over: {
    key?: string;
    invoice?: LoadedInvoice | null;
    facts?: InvoiceFacts;
    form?: Partial<EditorSession['draft']['form']>;
    flags?: EditorSession['draft']['flags'];
    meta?: Partial<EditorSession['draft']['meta']>;
    savedId?: string;
} = {}): EditorSession {
    return {
        key: over.key ?? 'sess-1',
        invoice: over.invoice === undefined ? null : over.invoice,
        facts: over.facts ?? { hasText: false, supplier: {}, items: [], people: [], mentionsSicap: false },
        savedId: over.savedId,
        draft: {
            form: {
                ...structuredClone(EMPTY_FORM),
                payeeName: 'Brightway Safety',
                amount: '1,230.00',
                amountQuoted: '1,230.00',
                actionNumber: '9.',
                ...over.form,
            },
            flags: over.flags ?? {
                poNumber: { level: 'missing', note: 'No PO number on the invoice' },
                payeeName: { level: 'check', note: 'Best guess from the invoice' },
                description: { level: 'check', note: 'From the invoice lines: add what it was for, if needed' },
                actionNumber: { level: 'memory', note: 'As on your requisition for INV-0090' },
            },
            meta: {
                ...EMPTY_META,
                invoiceNumber: 'INV-0101',
                invoiceDate: '2026-10-21',
                netAmount: 1000,
                ...over.meta,
            },
        },
    };
}

const existingHistoryRow: SavedChequeReq = {
    id: 'hist-1',
    supplier_name: 'Brightway Safety',
    invoice_number: 'INV-DUP-99',
    invoice_date: '2026-09-10',
    amount: 3900,
    net_amount: 3900,
    form: { ...structuredClone(EMPTY_FORM), payeeName: 'Brightway Safety', amount: '3,900.00' },
    meta: { ...EMPTY_META, invoiceNumber: 'INV-DUP-99', invoiceDate: '2026-09-10', netAmount: 3900 },
    status: 'ready',
    created_at: '2026-09-10T10:00:00Z',
    updated_at: '2026-09-10T10:00:00Z',
};

describe('ChequeReqEditor Studio features', () => {
    beforeEach(() => {
        localStorage.clear();
        keep.mockReset().mockResolvedValue('saved-1');
        renderChequeReq.mockReset().mockResolvedValue(new Blob(['docx']));
        renderChequeReqPdf.mockReset().mockResolvedValue(new Blob(['pdf']));
        renderChequeReqBatchZip.mockReset().mockResolvedValue({ blob: new Blob(['zip']), fileName: 'batch.zip' });
        downloadBlob.mockReset();
    });

    it('guided review bar: "Next to check" cycles flagged fields and "Accept all guesses" clears check flags while keeping missing flags', async () => {
        render(<ChequeReqEditor session={makeSession()} history={[]} historyAvailable keep={keep} onBack={vi.fn()} />);

        // 1 missing (poNumber) + 2 check (payeeName, description) = 3 to check
        expect(screen.getByText('3 fields need a quick check')).toBeInTheDocument();

        // Click "Next to check" focuses first flagged field in FIELD_ORDER (poNumber)
        const nextBtn = screen.getByRole('button', { name: /Next to check/i });
        fireEvent.click(nextBtn);
        await waitFor(() => expect(screen.getByLabelText('PO number')).toHaveFocus());

        // Clicking "Next to check" again advances to the next flagged field (payeeName)
        fireEvent.blur(screen.getByLabelText('PO number'));
        fireEvent.click(nextBtn);
        await waitFor(() => expect(screen.getByLabelText('Payee name')).toHaveFocus());

        // "Accept all guesses" clears the 2 `check` flags but keeps the `missing` flag (poNumber) and `memory` flag
        fireEvent.click(screen.getByRole('button', { name: /Accept all guesses/i }));
        expect(screen.getByText('1 field needs a quick check')).toBeInTheDocument();
        expect(screen.getByText('No PO number on the invoice')).toBeInTheDocument();
        expect(screen.getByText('As on your requisition for INV-0090')).toBeInTheDocument();
        expect(screen.queryByText('Best guess from the invoice')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Accept all guesses/i })).not.toBeInTheDocument();
    });

    it('editable Invoice details metadata updates download filename, history checks, and Irish VAT quick-math chips compute net cleanly', async () => {
        render(
            <ChequeReqEditor
                session={makeSession({
                    flags: {},
                    form: { amount: '1,230.00', amountQuoted: '1,230.00' },
                    meta: { invoiceNumber: 'INV-FRESH', invoiceDate: '2026-10-21', netAmount: null },
                })}
                history={[existingHistoryRow]}
                historyAvailable
                keep={keep}
                onBack={vi.fn()}
            />,
        );

        // Without Net excl. VAT entered, gross €1,230 + €3,900 earlier = €5,130 (>= €5,000 warning!)
        expect(screen.queryByText(/already made a requisition for/)).not.toBeInTheDocument();
        expect(screen.getByText(/come to €5,130\.00 excl\. VAT: from €5,000\.00 you need three quotations/)).toBeInTheDocument();

        // Click Irish 23% VAT chip: €1,230.00 / 1.23 = €1,000.00 excl. VAT -> total drops to €4,900.00 (< €5,000!)
        fireEvent.click(screen.getByRole('button', { name: 'Calc ex 23%' }));
        expect(screen.getByLabelText('Net excl. VAT')).toHaveValue('1,000.00');
        expect(screen.getByText(/VAT €230\.00 \(23%\)/)).toBeInTheDocument();
        expect(screen.getByText(/€4,900\.00 excl\. VAT with this invoice/)).toBeInTheDocument();
        expect(screen.getByText(/A single quotation is enough below €5,000\.00/)).toBeInTheDocument();

        // Editing Net excl. VAT directly updates history checks back over €5,000
        const netInput = screen.getByLabelText('Net excl. VAT');
        fireEvent.focus(netInput);
        fireEvent.change(netInput, { target: { value: '1150' } });
        fireEvent.blur(netInput);
        expect(netInput).toHaveValue('1,150.00');
        expect(screen.getByText(/come to €5,050\.00 excl\. VAT: from €5,000\.00 you need three quotations/)).toBeInTheDocument();

        // Test 13.5% VAT quick-math chip as well
        fireEvent.change(screen.getByLabelText('Payment amount'), { target: { value: '1,135.00' } });
        fireEvent.click(screen.getByRole('button', { name: 'Calc ex 13.5%' }));
        expect(screen.getByLabelText('Net excl. VAT')).toHaveValue('1,000.00');
        expect(screen.getByText(/VAT €135\.00 \(13\.5%\)/)).toBeInTheDocument();

        // Changing Invoice number to an existing invoice triggers duplicate check immediately
        const invInput = screen.getByLabelText('Invoice number');
        fireEvent.change(invInput, { target: { value: 'INV-DUP-99' } });
        expect(screen.getByText(/already made a requisition for INV-DUP-99/)).toBeInTheDocument();

        // Changing Invoice number to a new one clears duplicate warning and updates the downloaded .docx filename
        fireEvent.change(invInput, { target: { value: 'INV-7777' } });
        expect(screen.queryByText(/already made a requisition for/)).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Download the requisition/i }));
        await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'SICAP Invoice INV-7777.docx'));
    });

    it('standalone Save button calls keep without downloading, updates savedId, and clears unsaved state', async () => {
        const onBack = vi.fn();
        render(
            <ChequeReqEditor
                session={makeSession({ invoice: makePhoto(), flags: {} })}
                history={[]}
                historyAvailable
                keep={keep}
                onBack={onBack}
            />,
        );

        // Edit a field to mark the session dirty
        fireEvent.change(screen.getByLabelText('PO number'), { target: { value: 'PO-5511' } });

        // Click standalone Save button
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() =>
            expect(keep).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: undefined,
                    form: expect.objectContaining({ poNumber: 'PO-5511' }),
                }),
            ),
        );
        expect(downloadBlob).not.toHaveBeenCalled();
        expect(renderChequeReq).not.toHaveBeenCalled();

        // Saving again uses the returned savedId
        fireEvent.change(screen.getByLabelText('PO number'), { target: { value: 'PO-5512' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() =>
            expect(keep).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    id: 'saved-1',
                    form: expect.objectContaining({ poNumber: 'PO-5512' }),
                }),
            ),
        );

        // Unsaved state is cleared (even with an invoice attached), so clicking Back leaves immediately without dialog
        fireEvent.click(screen.getByRole('button', { name: 'All requisitions' }));
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('smart Description quick-insert line-item chips populate description and update the 2-line fit indicator', () => {
        render(
            <ChequeReqEditor
                session={makeSession({
                    facts: makeFacts(),
                    form: { description: '' },
                    flags: {},
                })}
                history={[]}
                historyAvailable
                keep={keep}
                onBack={vi.fn()}
            />,
        );

        // Fit indicator hidden while description is blank
        expect(screen.queryByText('Line 1 (next to Checklist)')).not.toBeInTheDocument();

        // Click line-item chip to populate description
        fireEvent.click(screen.getByRole('button', { name: 'Manual Handling QQI Level 5' }));
        expect(screen.getByLabelText('Description of goods / services')).toHaveValue('Manual Handling QQI Level 5');
        expect(screen.getByText('Line 1 (next to Checklist)')).toBeInTheDocument();
        expect(screen.getByText('Line 2 (full width)')).toBeInTheDocument();

        // Append second line item and service date chip
        fireEvent.click(screen.getByRole('button', { name: 'Venue catering lunch' }));
        expect(screen.getByLabelText('Description of goods / services')).toHaveValue(
            'Manual Handling QQI Level 5, Venue catering lunch',
        );
        fireEvent.click(screen.getByRole('button', { name: '10.10.2026' }));
        expect(screen.getByLabelText('Description of goods / services')).toHaveValue(
            'Manual Handling QQI Level 5, Venue catering lunch 10.10.2026',
        );

        // Exceeding 2 ruled lines triggers the live overflow warning
        fireEvent.change(screen.getByLabelText('Description of goods / services'), {
            target: {
                value: 'Comprehensive Workplace Health, Safety, Manual Handling, First Aid Responder, and Fire Warden Accredited QQI Training Programme for Cork City SICAP Community Clients across multiple October and November 2026 sessions',
            },
        });
        expect(screen.getByText(/Exceeds the 2 ruled lines on the Word form/)).toBeInTheDocument();
    });

    it('smart Single Quotation: clicking a quote method chip or typing into a quote contact auto-ticks the method checkbox', () => {
        render(
            <ChequeReqEditor
                session={makeSession({
                    form: {
                        quotePhone: '021 555 0100',
                        quoteBy: { shop: false, telephone: false, email: false, meeting: false, online: false },
                    },
                    flags: {
                        quotePhone: { level: 'check', note: 'The phone number on the invoice: is it who gave the quote?' },
                    },
                })}
                history={[]}
                historyAvailable
                keep={keep}
                onBack={vi.fn()}
            />,
        );

        // Telephone row is active because quotePhone has a value, but its checkbox starts unticked
        const telephoneCheckbox = screen.getByRole('checkbox', { name: 'Telephone' });
        expect(telephoneCheckbox).not.toBeChecked();

        // Typing into the phone contact input auto-ticks Telephone
        fireEvent.change(screen.getByLabelText('Phone no.'), { target: { value: '021 555 0199' } });
        expect(screen.getByRole('checkbox', { name: 'Telephone' })).toBeChecked();

        // Clicking an inactive quote method chip ("E-mail") ticks E-mail and opens its input
        const emailChip = screen.getByRole('checkbox', { name: 'E-mail' });
        expect(emailChip).not.toBeChecked();
        fireEvent.click(emailChip);
        expect(screen.getByRole('checkbox', { name: 'E-mail' })).toBeChecked();
        expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    });

    it('smart Checklist: "Tick verified" checks evidenced items while leaving manual Tax Clearance unticked', () => {
        render(
            <ChequeReqEditor
                session={makeSession({
                    facts: makeFacts({ mentionsSicap: true }),
                    form: {
                        poNumber: 'PO-8821',
                        description: 'Manual Handling course 10.10.2026',
                        approvedBy: 'Mary Murphy',
                        amountQuoted: '1,230.00',
                        quoteBy: { shop: false, telephone: false, email: true, meeting: false, online: false },
                        quoteEmail: 'accounts@brightway.ie',
                    },
                    flags: {},
                })}
                history={[]}
                historyAvailable
                keep={keep}
                onBack={vi.fn()}
            />,
        );

        // 4 items are evidenced (poAndSicap, description, approval, quoteDetails); taxClearance is manual
        const tickBtn = screen.getByRole('button', { name: /Tick verified \(4\)/ });
        fireEvent.click(tickBtn);

        expect(screen.getByRole('checkbox', { name: /PO Number and “SICAP” on Invoice/ })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: /^Description/ })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: /^Approval/ })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: /^Quote Details/ })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: /Tax Declaration Form or TCAN/ })).not.toBeChecked();

        // Button hides once all verified items are ticked
        expect(screen.queryByRole('button', { name: /Tick verified/ })).not.toBeInTheDocument();
    });

    it('DocumentInspector: clicking extracted amount/PO chips fills fields, and Raw Text tab renders and filters text', () => {
        const photo = makePhoto();
        render(
            <ChequeReqEditor
                session={makeSession({
                    invoice: photo,
                    facts: makeFacts(),
                    form: { poNumber: '', amount: '', amountQuoted: '' },
                    flags: {},
                    meta: { netAmount: null },
                })}
                history={[]}
                historyAvailable
                keep={keep}
                onBack={vi.fn()}
            />,
        );

        const inspector = screen.getByRole('region', { name: 'Document inspector' });

        // Click extracted Total amount chip -> fills Payment amount & Amount quoted
        fireEvent.click(within(inspector).getByRole('button', { name: /Total €1,230\.00/ }));
        expect(screen.getByLabelText('Payment amount')).toHaveValue('1,230.00');
        expect(screen.getByLabelText('Amount quoted')).toHaveValue('1,230.00');

        // Click extracted Subtotal chip -> fills Net excl. VAT
        fireEvent.click(within(inspector).getByRole('button', { name: /Subtotal €1,000\.00/ }));
        expect(screen.getByLabelText('Net excl. VAT')).toHaveValue('1,000.00');

        // Click extracted PO chip -> fills PO number
        fireEvent.click(within(inspector).getByRole('button', { name: /PO # PO-8821/ }));
        expect(screen.getByLabelText('PO number')).toHaveValue('PO-8821');

        // Focusing Amount quoted and clicking an amount chip fills Amount quoted (mousedown does not clear activeField)
        fireEvent.focus(screen.getByLabelText('Amount quoted'));
        expect(within(inspector).getByText(/Filling/)).toHaveTextContent('Filling Amount quoted');
        const vatChip = within(inspector).getByRole('button', { name: /VAT €230\.00/ });
        fireEvent.mouseDown(vatChip);
        fireEvent.click(vatChip);
        expect(screen.getByLabelText('Amount quoted')).toHaveValue('230.00');
        expect(screen.getByLabelText('Payment amount')).toHaveValue('1,230.00');

        // Switch to Raw Text tab, verify lines render, and filter text
        fireEvent.click(within(inspector).getByRole('tab', { name: /Raw Text/ }));
        expect(within(inspector).getByText(/Brightway Safety Training Ltd/)).toBeInTheDocument();
        expect(within(inspector).getByText(/PO Number: PO-8821/)).toBeInTheDocument();

        const filterInput = within(inspector).getByLabelText('Filter extracted invoice text');
        fireEvent.change(filterInput, { target: { value: '8821' } });
        expect(within(inspector).getByText('1 matching line')).toBeInTheDocument();
        expect(within(inspector).queryByText(/Brightway Safety Training Ltd/)).not.toBeInTheDocument();
        expect(within(inspector).getByText('8821')).toBeInTheDocument();

        // Clear filter restores all lines
        fireEvent.click(within(inspector).getByRole('button', { name: 'Clear filter' }));
        expect(within(inspector).getByText(/Brightway Safety Training Ltd/)).toBeInTheDocument();
    });

    it('batch queue with 2 invoices shows queue strip and switches between Invoice 1 and Invoice 2 preserving edits on both', () => {
        const s1 = makeSession({
            key: 'inv-1',
            invoice: makePhoto('first-invoice.jpg'),
            form: { payeeName: 'Alpha Catering', poNumber: 'PO-100', amount: '250.00', amountQuoted: '250.00' },
            flags: {},
            meta: { invoiceNumber: 'INV-001' },
        });
        const s2 = makeSession({
            key: 'inv-2',
            invoice: makePhoto('second-invoice.jpg'),
            form: { payeeName: 'Beta Printing', poNumber: 'PO-200', amount: '480.00', amountQuoted: '480.00' },
            flags: {},
            meta: { invoiceNumber: 'INV-002' },
        });

        render(
            <ChequeReqEditor
                session={s1}
                initialSessions={[s1, s2]}
                history={[]}
                historyAvailable
                keep={keep}
                onBack={vi.fn()}
            />,
        );

        const queueStrip = screen.getByRole('region', { name: 'Batch invoice queue' });
        expect(within(queueStrip).getByText('1 / 2')).toBeInTheDocument();
        expect(screen.getByLabelText('Payee name')).toHaveValue('Alpha Catering');

        // Edit Invoice 1
        fireEvent.change(screen.getByLabelText('PO number'), { target: { value: 'PO-100-EDITED' } });
        fireEvent.change(screen.getByLabelText('Description of goods / services'), { target: { value: 'Workshop catering' } });

        // Switch to Invoice 2
        fireEvent.click(within(queueStrip).getByRole('button', { name: /Beta Printing/ }));
        expect(within(queueStrip).getByText('2 / 2')).toBeInTheDocument();
        expect(screen.getByLabelText('Payee name')).toHaveValue('Beta Printing');
        expect(screen.getByLabelText('PO number')).toHaveValue('PO-200');

        // Edit Invoice 2
        fireEvent.change(screen.getByLabelText('PO number'), { target: { value: 'PO-200-EDITED' } });
        fireEvent.change(screen.getByLabelText('Description of goods / services'), { target: { value: 'Course leaflets' } });

        // Switch back to Invoice 1 and confirm its edits were preserved
        fireEvent.click(within(queueStrip).getByRole('button', { name: /Alpha Catering/ }));
        expect(within(queueStrip).getByText('1 / 2')).toBeInTheDocument();
        expect(screen.getByLabelText('PO number')).toHaveValue('PO-100-EDITED');
        expect(screen.getByLabelText('Description of goods / services')).toHaveValue('Workshop catering');

        // Switch back to Invoice 2 via Next invoice button and confirm its edits were preserved too
        fireEvent.click(within(queueStrip).getByRole('button', { name: 'Next invoice' }));
        expect(within(queueStrip).getByText('2 / 2')).toBeInTheDocument();
        expect(screen.getByLabelText('PO number')).toHaveValue('PO-200-EDITED');
        expect(screen.getByLabelText('Description of goods / services')).toHaveValue('Course leaflets');
    });

    it('DefaultsModal saves action number, requested by, approved by, and custom description preset to localStorage under the given key', () => {
        const onClose = vi.fn();
        const onSaved = vi.fn();
        const customKey = 'test_cheque_defaults_key';

        const { rerender } = render(
            <DefaultsModal
                open
                onClose={onClose}
                defaultsKey={customKey}
                staffName="Niamh O'Connor"
                onSaved={onSaved}
            />,
        );

        fireEvent.change(screen.getByLabelText('Default SICAP action number'), { target: { value: '12.' } });
        fireEvent.change(screen.getByLabelText('Default Requested by'), { target: { value: 'Aoife Ryan' } });
        fireEvent.change(screen.getByLabelText('Default Approved by'), { target: { value: 'Seán Murphy' } });

        const presetInput = screen.getByLabelText('Description wording presets');
        fireEvent.change(presetInput, { target: { value: '{item} workshop {date} for SICAP' } });
        fireEvent.click(screen.getByRole('button', { name: /^Add$/i }));

        // Submit the modal form
        fireEvent.click(screen.getByRole('button', { name: 'Save defaults' }));

        const savedRaw = localStorage.getItem(customKey);
        expect(savedRaw).not.toBeNull();
        expect(JSON.parse(savedRaw!)).toEqual({
            actionNumber: '12.',
            requestedBy: 'Aoife Ryan',
            approvedBy: 'Seán Murphy',
            descriptionPattern: '',
            descriptionPresets: ['{item} workshop {date} for SICAP'],
        });
        expect(onSaved).toHaveBeenCalledWith(
            expect.objectContaining({
                actionNumber: '12.',
                requestedBy: 'Aoife Ryan',
                approvedBy: 'Seán Murphy',
                descriptionPresets: ['{item} workshop {date} for SICAP'],
            }),
        );
        expect(onClose).toHaveBeenCalledTimes(1);

        // Reopening loads the stored values from that key
        rerender(<DefaultsModal open={false} onClose={onClose} defaultsKey={customKey} staffName="Niamh O'Connor" />);
        rerender(<DefaultsModal open onClose={onClose} defaultsKey={customKey} staffName="Niamh O'Connor" />);
        expect(screen.getByLabelText('Default SICAP action number')).toHaveValue('12.');
        expect(screen.getByLabelText('Default Requested by')).toHaveValue('Aoife Ryan');
        expect(screen.getByLabelText('Default Approved by')).toHaveValue('Seán Murphy');
        expect(screen.getByRole('button', { name: /Remove preset: \{item\} workshop \{date\} for SICAP/ })).toBeInTheDocument();
    });
});
