import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PublicChequeRequisitions from './PublicChequeRequisitions';

// Nothing on the public page may reach the database: loading the client at all fails this file
vi.mock('../lib/supabase', () => {
    throw new Error('The public cheque requisition page must not load the Supabase client');
});
vi.mock('../hooks/useChequeRequisitions', () => {
    throw new Error('The public cheque requisition page must not load the requisition history');
});
const renderChequeReq = vi.fn();
vi.mock('../lib/chequeReq/docx', async importOriginal => ({
    ...(await importOriginal<typeof import('../lib/chequeReq/docx')>()),
    renderChequeReq: (...args: unknown[]) => renderChequeReq(...args),
}));
const downloadBlob = vi.fn();
vi.mock('../lib/download', () => ({ downloadBlob: (...args: unknown[]) => downloadBlob(...args) }));

describe('PublicChequeRequisitions', () => {
    beforeEach(() => {
        localStorage.clear();
        renderChequeReq.mockReset().mockResolvedValue(new Blob(['docx']));
        downloadBlob.mockReset();
    });

    it('offers the invoice drop and a blank requisition, and no history', () => {
        render(<PublicChequeRequisitions />);
        expect(screen.getByText('SICAP cheque requisition')).toBeInTheDocument();
        expect(screen.getByText(/click here to choose the invoice/)).toBeInTheDocument();
        expect(screen.getByText(/Nothing is saved/)).toBeInTheDocument();
        expect(screen.queryByText('Made before')).not.toBeInTheDocument();
        expect(document.title).toBe('Cheque requisition · Cork City Partnership');
    });

    it('makes and downloads a requisition, remembering only on this device and apart from the CRM', async () => {
        // A coordinator signed in on the same computer: their details don't start this one
        localStorage.setItem('cheque_req_defaults', JSON.stringify({ actionNumber: '9.', requestedBy: 'A Coordinator', descriptionPattern: '' }));
        render(<PublicChequeRequisitions />);
        fireEvent.click(screen.getByRole('button', { name: /Blank requisition/ }));
        expect(screen.getByLabelText('SICAP action number')).toHaveValue('');
        expect(screen.getByLabelText('Requested by')).toHaveValue('');

        fireEvent.change(screen.getByLabelText('Payee name'), { target: { value: 'Brightway Safety' } });
        fireEvent.change(screen.getByLabelText('Payment amount'), { target: { value: '450.00' } });
        fireEvent.change(screen.getByLabelText('SICAP action number'), { target: { value: '11.' } });
        fireEvent.click(screen.getByRole('button', { name: /Download the requisition/ }));
        await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/\.docx$/)));
        expect(renderChequeReq).toHaveBeenCalledWith(expect.objectContaining({ payeeName: 'Brightway Safety', amount: '450.00' }));

        await waitFor(() => expect(JSON.parse(localStorage.getItem('cheque_req_public_defaults')!)).toMatchObject({ actionNumber: '11.' }));
        expect(JSON.parse(localStorage.getItem('cheque_req_defaults')!)).toMatchObject({ actionNumber: '9.' });
    });

    it('goes back to the invoice drop, asking first when the requisition was not downloaded', async () => {
        render(<PublicChequeRequisitions />);
        fireEvent.click(screen.getByRole('button', { name: /Blank requisition/ }));
        fireEvent.change(screen.getByLabelText('Payee name'), { target: { value: 'Brightway Safety' } });
        fireEvent.click(screen.getByRole('button', { name: 'New requisition' }));
        const dialog = await screen.findByRole('alertdialog');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Leave' }));
        expect(await screen.findByText(/click here to choose the invoice/)).toBeInTheDocument();
    });
});
