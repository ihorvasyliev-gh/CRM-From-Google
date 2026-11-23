import { descriptionLines } from '../../lib/chequeReq/docx';
import { formatAmount, parseAmount, slashDate } from '../../lib/chequeReq/parse';
import type { ChequeReqForm } from '../../lib/chequeReq/types';

/** Exact US Letter page width & height in CSS pixels at 96 DPI (612pt × 792pt) */
export const SHEET_WIDTH_PX = 816;
export const SHEET_HEIGHT_PX = 1056;

function cleanLine(value: string): string {
    return value.split(/\s*\n\s*/).filter(Boolean).join(', ');
}

function money(value: string): string {
    const n = parseAmount(value);
    return n === null ? value.trim() : formatAmount(n);
}

function SheetCheckbox({ checked, size = 12 }: { checked: boolean; size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 12 12"
            aria-hidden="true"
            className="inline-block shrink-0 align-[-1.5px]"
        >
            <rect
                x="1"
                y="1"
                width="10"
                height="10"
                fill="none"
                stroke="#000"
                strokeWidth="1.05"
            />
            {checked && (
                <>
                    <line x1="2.8" y1="2.8" x2="9.2" y2="9.2" stroke="#000" strokeWidth="1.35" strokeLinecap="round" />
                    <line x1="9.2" y1="2.8" x2="2.8" y2="9.2" stroke="#000" strokeWidth="1.35" strokeLinecap="round" />
                </>
            )}
        </svg>
    );
}

export interface RequisitionSheetProps {
    form: ChequeReqForm;
    /** Removes screen-only elevation shadow when mounted inside the print portal */
    printMode?: boolean;
}

/**
 * Pixel-faithful HTML representation of `sicap-cheque-requisition.docx` (612pt × 792pt).
 * Shared by the live preview studio (scaled cleanly via transform) and browser print so
 * preview, print, PDF, and Word output stay visually 1:1 with zero docx-preview layout bugs.
 */
export default function RequisitionSheet({ form, printMode = false }: RequisitionSheetProps) {
    const [desc1, desc2] = descriptionLines(form.description);
    const payeeName = cleanLine(form.payeeName);
    const payeeAddress = cleanLine(form.payeeAddress);
    const amount = money(form.amount);
    const amountQuoted = money(form.amountQuoted);
    const requestedDate = form.requestedDate ? slashDate(form.requestedDate) : '';
    const approvedDate = form.approvedDate ? slashDate(form.approvedDate) : '';
    const quoteDate = form.quoteDate ? slashDate(form.quoteDate) : '';

    const quoteRows = [
        { checked: form.quoteBy.shop, method: 'In shop Purchase', label: 'Shop Name:', value: form.shopName.trim() },
        { checked: form.quoteBy.telephone, method: 'Telephone', label: 'Phone No:', value: form.quotePhone.trim() },
        { checked: form.quoteBy.email, method: 'E-mail', label: 'Email Address:', value: form.quoteEmail.trim() },
        { checked: form.quoteBy.meeting, method: 'Meeting', label: 'Contact Name:', value: form.quoteContact.trim() },
        { checked: form.quoteBy.online, method: 'Correspondence/Online', label: 'Website:', value: form.quoteWebsite.trim() },
    ];

    return (
        <article
            aria-label="SICAP cheque requisition sheet"
            className={`bg-white text-black select-text box-border ${
                printMode ? 'mx-auto' : 'rounded-xs shadow-card ring-1 ring-black/8'
            }`}
            style={{
                width: printMode ? '100%' : `${SHEET_WIDTH_PX}px`,
                maxWidth: `${SHEET_WIDTH_PX}px`,
                minHeight: printMode ? undefined : `${SHEET_HEIGHT_PX}px`,
                padding: printMode ? '24px 32px 20px 32px' : '60px 75.6px 48px 75.6px',
                fontFamily: "Calibri, Carlito, 'Segoe UI', Arial, sans-serif",
                fontSize: '14.67px', // 11pt
                lineHeight: 1.28,
                color: '#000000',
            }}
        >
            {/* Top half: main header/payment fields beside the top-right Checklist box (CSS grid prevents overlap or float drops) */}
            <div
                className="grid items-start"
                style={{ gridTemplateColumns: 'minmax(0, 1fr) 182px', columnGap: '18px' }}
            >
                {/* Left column: strictly clear of the Checklist box */}
                <div className="min-w-0">
                    {/* Title: SICAP */}
                    <h1
                        className="font-bold underline tracking-tight"
                        style={{
                            fontSize: '24px', // 18pt
                            lineHeight: 1.15,
                            textAlign: 'center',
                            paddingLeft: '36px',
                            marginBottom: '18px',
                            textUnderlineOffset: '3px',
                        }}
                    >
                        SICAP
                    </h1>

                    {/* Funding */}
                    <div className="space-y-1.5 font-bold" style={{ fontSize: '13.33px' }}>
                        <p className="break-words">
                            <span>SICAP ACTION NUMBER:</span>
                            {form.actionNumber.trim() && (
                                <span className="ml-2">{form.actionNumber.trim()}</span>
                            )}
                        </p>
                        <p className="break-words">
                            <span>NON-SICAP FUNDING:</span>
                            {form.nonSicapFunding.trim() && (
                                <span className="ml-2">{form.nonSicapFunding.trim()}</span>
                            )}
                        </p>
                    </div>

                    {/* Thick 2.25pt rule stopping cleanly left of Checklist box */}
                    <div style={{ borderBottom: '3px solid #000', marginTop: '6px', marginBottom: '18px' }} />

                    {/* PO Number */}
                    <div className="flex items-baseline mb-4">
                        <span className="font-bold shrink-0" style={{ width: '152px' }}>
                            PO Number:
                        </span>
                        <span
                            className="font-bold inline-block min-w-0 break-words"
                            style={{
                                width: '240px',
                                borderBottom: '0.8px solid #000',
                                paddingLeft: '3px',
                                paddingBottom: '1px',
                                minHeight: '19px',
                            }}
                        >
                            {form.poNumber.trim() || '\u00a0'}
                        </span>
                    </div>

                    {/* Payee Name & Address (hanging indent at 114pt = 152px, never pushed under Checklist) */}
                    <div className="grid mb-5" style={{ gridTemplateColumns: '152px minmax(0, 1fr)', rowGap: '6px' }}>
                        <span className="pr-2">Payee Name &amp; Address:</span>
                        <div className="min-w-0 break-words">
                            {payeeName ? (
                                <span className="underline" style={{ textUnderlineOffset: '3px' }}>
                                    {payeeName}
                                </span>
                            ) : (
                                <span
                                    className="block w-full"
                                    style={{ borderBottom: '0.8px solid #000', height: '17px' }}
                                />
                            )}
                        </div>

                        <span aria-hidden="true" />
                        <div className="min-w-0 break-words">
                            {payeeAddress ? (
                                <span className="underline" style={{ textUnderlineOffset: '3px' }}>
                                    {payeeAddress}
                                </span>
                            ) : (
                                <span
                                    className="block w-full"
                                    style={{ borderBottom: '0.8px solid #000', height: '17px' }}
                                />
                            )}
                        </div>
                    </div>

                    {/* Payment Amount */}
                    <div className="flex items-baseline mb-6">
                        <span className="shrink-0" style={{ width: '158px' }}>
                            Payment Amount:
                        </span>
                        <span
                            className="inline-block min-w-0"
                            style={{
                                width: '242px',
                                borderBottom: '0.8px solid #000',
                                paddingLeft: '3px',
                                paddingBottom: '1px',
                                minHeight: '19px',
                            }}
                        >
                            €{amount ? `  ${amount}` : '\u00a0'}
                        </span>
                    </div>

                    {/* Description Line 1 (stops cleanly left of Checklist box) */}
                    <div className="flex items-baseline">
                        <span className="shrink-0" style={{ width: '194px' }}>
                            Description of goods/services:
                        </span>
                        <span
                            className="flex-1 min-w-0 break-words"
                            style={{
                                borderBottom: '0.8px solid #000',
                                paddingLeft: '3px',
                                paddingBottom: '1px',
                                minHeight: '19px',
                            }}
                        >
                            {desc1 || '\u00a0'}
                        </span>
                    </div>
                </div>

                {/* Right column: Checklist box (exact 136pt = 182px width) */}
                <aside
                    className="box-border bg-white"
                    style={{
                        width: '182px',
                        border: '1px solid #000',
                        padding: '10px 11px 11px 11px',
                    }}
                >
                    <p
                        className="text-center font-bold underline mb-2.5"
                        style={{ fontSize: '14px', textUnderlineOffset: '2px' }}
                    >
                        Checklist:
                    </p>
                    <ul className="space-y-2" style={{ fontSize: '12.67px', lineHeight: 1.25 }}>
                        <li className="flex items-start gap-1.5">
                            <span className="mt-[2px]">
                                <SheetCheckbox checked={form.checklist.taxClearance} size={11} />
                            </span>
                            <span className="underline" style={{ textUnderlineOffset: '2px' }}>
                                Tax Declaration Form or TCAN*
                            </span>
                        </li>
                        <li className="flex items-start gap-1.5">
                            <span className="mt-[2px]">
                                <SheetCheckbox checked={form.checklist.poAndSicap} size={11} />
                            </span>
                            <span className="underline" style={{ textUnderlineOffset: '2px' }}>
                                PO Number and “SICAP” on Invoice
                            </span>
                        </li>
                        <li className="flex items-start gap-1.5">
                            <span className="mt-[2px]">
                                <SheetCheckbox checked={form.checklist.description} size={11} />
                            </span>
                            <span>Description</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                            <span className="mt-[2px]">
                                <SheetCheckbox checked={form.checklist.approval} size={11} />
                            </span>
                            <span>Approval</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                            <span className="mt-[2px]">
                                <SheetCheckbox checked={form.checklist.quoteDetails} size={11} />
                            </span>
                            <span>Quote Details</span>
                        </li>
                    </ul>
                    <p className="mt-2.5" style={{ fontSize: '11.8px', lineHeight: 1.25 }}>
                        *<span className="underline">T</span>ax <span className="underline">C</span>learance
                        <br />
                        <span className="underline">A</span>ccess <span className="underline">N</span>umber
                    </p>
                </aside>
            </div>

            {/* Description Line 2 (full ruled width below Checklist box) */}
            <div style={{ marginTop: '14px', marginBottom: '26px' }}>
                <div
                    className="break-words"
                    style={{
                        width: '526px',
                        maxWidth: '100%',
                        borderBottom: '0.8px solid #000',
                        paddingLeft: '2px',
                        paddingBottom: '1px',
                        minHeight: '19px',
                    }}
                >
                    {desc2 || '\u00a0'}
                </div>
            </div>

            {/* Requested & Approved */}
            <div className="space-y-3.5">
                <div className="flex items-baseline">
                    <span className="shrink-0" style={{ width: '96px' }}>
                        Requested by:
                    </span>
                    <span
                        className="inline-block"
                        style={{
                            width: '214px',
                            borderBottom: '0.8px solid #000',
                            paddingLeft: '4px',
                            paddingBottom: '1px',
                            minHeight: '19px',
                        }}
                    >
                        {form.requestedBy.trim() || '\u00a0'}
                    </span>
                </div>

                <div className="flex items-baseline">
                    <span className="shrink-0" style={{ width: '91px' }}>
                        Approved by:
                    </span>
                    <span
                        className="inline-block"
                        style={{
                            width: '219px',
                            borderBottom: '0.8px solid #000',
                            paddingLeft: '4px',
                            paddingBottom: '1px',
                            minHeight: '19px',
                        }}
                    >
                        {form.approvedBy.trim() || '\u00a0'}
                    </span>
                </div>

                <div className="flex items-baseline">
                    <span className="shrink-0 mr-1.5">Date:</span>
                    {requestedDate ? (
                        <span>{requestedDate}</span>
                    ) : (
                        <span
                            className="inline-block"
                            style={{ width: '158px', borderBottom: '0.8px solid #000', height: '16px' }}
                        />
                    )}
                </div>

                <div className="flex items-baseline">
                    <span className="shrink-0 mr-1.5">Date:</span>
                    {approvedDate ? (
                        <span>{approvedDate}</span>
                    ) : (
                        <span
                            className="inline-block"
                            style={{ width: '158px', borderBottom: '0.8px solid #000', height: '16px' }}
                        />
                    )}
                </div>
            </div>

            {/* Full-width thick divider #2 */}
            <div style={{ borderBottom: '3px solid #000', marginTop: '10px', marginBottom: '10px' }} />

            {/* OR Approval Email attached */}
            <div className="flex items-center gap-2">
                <span>
                    <strong className="italic underline" style={{ textUnderlineOffset: '2px' }}>
                        OR
                    </strong>{' '}
                    Approval Email attached
                </span>
                <SheetCheckbox checked={form.approvalEmailAttached} size={12} />
            </div>

            {/* Full-width thick divider #3 */}
            <div style={{ borderBottom: '3px solid #000', marginTop: '10px', marginBottom: '16px' }} />

            {/* Single Quotation */}
            <div className="space-y-3">
                <p className="font-bold underline" style={{ textUnderlineOffset: '2px' }}>
                    SINGLE QUOTATION
                </p>

                <p>
                    <span className="font-bold underline" style={{ textUnderlineOffset: '2px' }}>
                        Date of Quote:
                    </span>
                    {quoteDate && <span className="ml-2">{quoteDate}</span>}
                </p>

                <p>
                    <span className="font-bold underline" style={{ textUnderlineOffset: '2px' }}>
                        Amount Quoted:
                    </span>
                    <span className="font-bold ml-2">€</span>
                    {amountQuoted && <span className="ml-1.5">{amountQuoted}</span>}
                </p>

                <p className="font-bold italic">
                    <span className="underline" style={{ textUnderlineOffset: '2px' }}>
                        Quote obtained by:
                    </span>{' '}
                    (x{' '}
                    <span className="underline" style={{ textUnderlineOffset: '2px' }}>
                        accordingly and complete details
                    </span>
                    )
                </p>

                {/* 5 Quote Method rows indented 36pt = 48px */}
                <div className="space-y-3 pt-2" style={{ paddingLeft: '48px', fontSize: '14px' }}>
                    {quoteRows.map(row => (
                        <div
                            key={row.method}
                            className="grid items-baseline"
                            style={{ gridTemplateColumns: '226px minmax(0, 1fr)', columnGap: '8px' }}
                        >
                            <div className="flex items-center gap-1.5">
                                <SheetCheckbox checked={row.checked} size={11.5} />
                                <span>{row.method}</span>
                            </div>
                            <div className="flex items-baseline min-w-0" style={{ maxWidth: '340px' }}>
                                <span className="shrink-0 mr-1.5">{row.label}</span>
                                <span
                                    className="flex-1 min-w-0 break-words"
                                    style={{
                                        borderBottom: '1.1px solid #000',
                                        paddingLeft: '3px',
                                        paddingBottom: '1px',
                                        minHeight: '18px',
                                    }}
                                >
                                    {row.value || '\u00a0'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer procurement rules */}
            <footer className="mt-7 space-y-2.5" style={{ fontSize: '13.33px', lineHeight: 1.35 }}>
                <p className="font-bold italic underline" style={{ textUnderlineOffset: '2px' }}>
                    SINGLE QUOTATION – payments less than €5,000 (excl. VAT) to the same supplier in the year.
                </p>
                <p>
                    <span className="font-bold italic underline" style={{ textUnderlineOffset: '2px' }}>
                        THREE QUOTATIONS - payments expected to be equal to or greater than €5,000 (excl. VAT) to same
                        supplier in the year.
                    </span>{' '}
                    (
                    <span className="italic underline" style={{ textUnderlineOffset: '2px' }}>
                        OBTAIN 3 QUOTES AND COMPLETE THE 3 QUOTES FORM
                    </span>
                    )
                </p>
            </footer>
        </article>
    );
}
