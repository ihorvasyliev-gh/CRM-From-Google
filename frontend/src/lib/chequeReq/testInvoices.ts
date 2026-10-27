// Synthetic invoices (made-up suppliers and people) laid out like real ones, for tests.
import type { Phrase } from '../pdfForms/types';

function ph(page: number, x: number, y: number, text: string, h = 9): Phrase {
    return { page, x, y, w: text.length * h * 0.48, h, text };
}

/** Two pages laid out like a Xero invoice: header boxes, items running over the page, a payment advice */
export function xeroLikeInvoice(): Phrase[] {
    const footer = 'Registered Office: BRIGHTWAY, UNIT 7, MILL ROAD, Cork, T12 AB34, Ireland.';
    return [
        // Page 1: title, customer, header boxes, supplier column
        ph(0, 28, 655, 'INVOICE', 24),
        ph(0, 57, 633, 'SICAP'),
        ph(0, 57, 620, 'Attention: Jane Murphy'),
        ph(0, 57, 607, 'Cork City Partnership CLG'),
        ph(0, 57, 594, 'Heron House'),
        ph(0, 57, 581, 'Blackpool, Cork'),
        ph(0, 362, 670, 'Invoice Date'),
        ph(0, 362, 659, '21 Oct 2026'),
        ph(0, 362, 641, 'Invoice Number'),
        ph(0, 362, 630, 'INV-0101'),
        ph(0, 362, 612, 'Reference'),
        ph(0, 362, 602, 'PO Number: 9001'),
        ph(0, 473, 669, 'Brightway Safety'),
        ph(0, 473, 656, 'Training Services'),
        ph(0, 473, 643, 'BRIGHTWAY'),
        ph(0, 473, 630, 'UNIT 7'),
        ph(0, 473, 617, 'MILL ROAD'),
        ph(0, 473, 604, 'CORK T12'),
        ph(0, 473, 591, 'AB34'),
        ph(0, 473, 578, 'IRELAND'),
        ph(0, 473, 565, 'VAT Number:'),
        ph(0, 473, 552, 'IE1234567T'),
        ph(0, 362, 507, 'Delivery Address'),
        ph(0, 362, 495, 'Attention: Jane Murphy'),
        ph(0, 362, 482, 'Cork City Partnership CLG'),
        // Items
        ph(0, 31, 398, 'Description'),
        ph(0, 309, 398, 'Quantity'),
        ph(0, 385, 398, 'Unit Price'),
        ph(0, 467, 398, 'Tax'),
        ph(0, 508, 398, 'Amount EUR'),
        ph(0, 31, 375, 'Manual Handling QQI Level 5'),
        ph(0, 326, 375, '3.00'),
        ph(0, 402, 375, '150.00'),
        ph(0, 455, 375, 'Tax on'),
        ph(0, 530, 375, '450.00'),
        ph(0, 462, 364, 'Sales'),
        ph(0, 31, 354, 'Dates 3rd November 2026-5th November 2026'),
        ph(0, 31, 332, '1. Anna'),
        ph(0, 31, 321, 'Kowalska'),
        ph(0, 31, 300, '2. Olena Petrenko'),
        ph(0, 31, 280, '3. Ahmed'),
        ph(0, 28, 35, footer, 7.2),
        // Page 2: the last name, totals, bank details, payment advice
        ph(1, 31, 739, 'Description'),
        ph(1, 309, 739, 'Quantity'),
        ph(1, 385, 739, 'Unit Price'),
        ph(1, 467, 739, 'Tax'),
        ph(1, 508, 739, 'Amount EUR'),
        ph(1, 31, 722, 'Hassan Ali'),
        ph(1, 448, 602, 'Subtotal'),
        ph(1, 530, 602, '450.00'),
        ph(1, 434, 579, 'TOTAL EUR'),
        ph(1, 529, 579, '450.00'),
        ph(1, 28, 532, 'Due Date: 20 Nov 2026', 10.8),
        ph(1, 28, 500, 'IBAN: IE29 AIBK 9311 5212 3456 78'),
        ph(1, 28, 489, 'BIC: AIBKIE2D'),
        ph(1, 28, 467, 'Please quote the invoice number on this invoice when contacting us.'),
        ph(1, 28, 424, 'For any queries please email accounts@brightway.ie or call 021 430 2310'),
        ph(1, 343, 183, 'Customer'),
        ph(1, 428, 183, 'SICAP'),
        ph(1, 31, 168, 'PAYMENT ADVICE', 24),
        ph(1, 343, 169, 'Invoice Number'),
        ph(1, 428, 169, 'INV-0101'),
        ph(1, 60, 153, 'To: Brightway Safety Training Services'),
        ph(1, 343, 152, 'Amount Due'),
        ph(1, 428, 152, '450.00'),
        ph(1, 77, 140, 'BRIGHTWAY'),
        ph(1, 77, 127, 'UNIT 7, MILL ROAD'),
        ph(1, 77, 114, 'CORK T12 AB34'),
        ph(1, 77, 101, 'IRELAND'),
        ph(1, 77, 88, 'VAT Number: IE1234567T'),
        ph(1, 28, 35, footer, 7.2),
    ];
}

/** One page from a word processor: "From" block, label: value lines, a VAT invoice */
export function simpleVatInvoice(): Phrase[] {
    return [
        ph(0, 40, 800, 'TAX INVOICE', 20),
        ph(0, 40, 770, 'From:'),
        ph(0, 40, 758, 'Greenleaf Catering'),
        ph(0, 40, 746, '12 Patrick Street'),
        ph(0, 40, 734, 'Cork T12 XY99'),
        ph(0, 40, 722, 'Tel: 087 123 4567'),
        ph(0, 340, 770, 'Bill To:'),
        ph(0, 340, 758, 'Cork City Partnership'),
        ph(0, 340, 746, 'Heron House, Blackpool'),
        ph(0, 340, 700, 'Invoice No: GC-2231'),
        ph(0, 340, 686, 'Date: 05/11/2026'),
        ph(0, 340, 672, 'Order No: 7788'),
        ph(0, 40, 620, 'Item'),
        ph(0, 300, 620, 'Qty'),
        ph(0, 360, 620, 'Rate'),
        ph(0, 450, 620, 'Total'),
        ph(0, 40, 600, 'Lunch for course participants'),
        ph(0, 300, 600, '20'),
        ph(0, 360, 600, '12.50'),
        ph(0, 450, 600, '250.00'),
        ph(0, 40, 584, 'Room hire'),
        ph(0, 300, 584, '1'),
        ph(0, 360, 584, '100.00'),
        ph(0, 450, 584, '100.00'),
        ph(0, 360, 550, 'Subtotal'),
        ph(0, 450, 550, '350.00'),
        ph(0, 360, 536, 'VAT @ 13.5%'),
        ph(0, 450, 536, '47.25'),
        ph(0, 360, 522, 'Total Due'),
        ph(0, 450, 522, '€397.25'),
        ph(0, 40, 480, 'Payable to Greenleaf Catering Ltd. Thank you!'),
    ];
}

/**
 * A sole trader's invoice template as read off its scan: the supplier filled in as a form under
 * "FROM:" ("Name:", "Address:"), the course days listed by month ("28,30 of July 2026"), and only
 * a total, no line amounts. Laid out as the reader placed the words of a real one.
 */
export function formInvoiceScan(): Phrase[] {
    return [
        ph(0, 56, 765, 'Invoice No: 0007', 12),
        ph(0, 276, 765, 'Date: 28/08/2026', 12),
        ph(0, 56, 721, 'TO:', 12),
        ph(0, 276, 721, 'Purchase Order No: 8264', 12),
        ph(0, 56, 693, 'SICAP', 12),
        ph(0, 56, 680, 'Cork City Partnership Clg', 12),
        ph(0, 56, 665, 'Heron House', 12),
        ph(0, 56, 651, 'Cork.', 12),
        ph(0, 56, 623, 'FROM:', 12),
        ph(0, 56, 595, 'Name:', 12),
        ph(0, 126, 595, 'Oksana Bondar', 12),
        ph(0, 57, 565, 'Address:', 17.9),
        ph(0, 131, 568, 'Rose Cottage, Knockane, Coachford, Co. Cork P12XK47', 12),
        ph(0, 56, 538, 'Tel No:', 12),
        ph(0, 107, 538, '087-555-0142', 12),
        ph(0, 198, 538, 'E-mail: oksana.bondar@example.com', 12),
        ph(0, 56, 524, 'PPS Number: 1234567TA', 12),
        ph(0, 56, 482, 'DESCRIPTION OF GOODS/SERVICE:', 12),
        ph(0, 56, 454, 'Preparation of materials, needs assessment and delivery of Summer Speaking', 11),
        ph(0, 56, 440, 'Club for SICAP New Arrivals Programme, Cork City Partnership on the', 11),
        ph(0, 56, 426, 'following dates 28,30 of July 2026, 4,6,11,13,18,20,25,27 of August 2026, 1,3 of September 2026', 10),
        ph(0, 56, 384, 'TOTAL Amount: EUR 2400', 11),
        ph(0, 56, 357, 'I herewith confirm that I have been made aware that payment has been made to me', 12),
        ph(0, 56, 342, 'without deduction of tax and that I take responsibility for returning the appropriate tax', 12),
        ph(0, 56, 328, 'to the Collector General.', 12),
        ph(0, 56, 314, 'I also confirm that my taxation affairs are in order as of the date of this invoice.', 12),
        ph(0, 56, 287, 'BANK DETAILS', 12),
        ph(0, 56, 273, 'AIB', 10),
        ph(0, 56, 262, 'MS Oksana Bondar', 10),
        ph(0, 56, 249, 'IBAN: IE29AIBK93115212345678', 10),
        ph(0, 56, 237, 'BIC: AIBKIE2D', 10),
        ph(0, 56, 196, 'Yours sincerely,', 12),
        ph(0, 56, 167, 'Signed:', 12),
        ph(0, 56, 140, 'PRINT NAME:', 12),
        ph(0, 144, 140, 'OKSANA BONDAR', 12),
    ];
}

/**
 * Two pages from an online invoicing system: the trading name in big letters over the legal
 * name and address, the customer boxed beside the invoice details, a VAT table whose header
 * row mixes labels and totals, and the company's registration in the footer of every page.
 */
export function letterheadInvoice(): Phrase[] {
    const letterhead = (page: number) => [
        ph(page, 28, 798.6, 'Grill Shack', 14.4),
        ph(page, 28, 785.9, 'Hearth Foods & Co, 12 Quayside Business Park, Ballybrack'),
        ph(page, 28, 776.9, 'Little Island, Cork, T45 XX12'),
        ph(page, 28, 767.9, 'Ireland'),
        ph(page, 28, 755.1, 'Telephone: 0214000000'),
        ph(page, 28, 746.1, 'Mobile 0870000000'),
        ph(page, 28, 737.1, 'Email orders@hearthfoods.example'),
    ];
    const customer = (page: number, x: number, h: number, ys: number[]) =>
        ['Mary Murphy', 'Cork City Partnership', 'Heron House', 'Blackpool Retail Park', 'Blackpool', 'Cork', 'T23 R50R'].map((text, i) => ph(page, x, ys[i], text, h));
    const footer = (page: number) => [
        ph(page, 28, 53.6, 'Registered in Republic of Ireland No. 123456 , VAT Registration Number IE 1234567AB', 7.5),
        ph(page, 28, 44.6, 'Registered Address 12 Quayside Business Park, Ballybrack Little Island, Cork, Cork, T45XX12', 7.5),
        ph(page, 528, 24.4, `Page ${page + 1} of 2`, 7.5),
    ];
    return [
        ...letterhead(0),
        ph(0, 28, 686.6, 'Invoice To:', 11.7),
        ph(0, 392, 686.6, 'SALES INVOICE', 11.7),
        ph(0, 308, 676, 'Invoice Date'),
        ph(0, 470, 676, '26/10/2026'),
        ph(0, 308, 663, 'Due Date'),
        ph(0, 470, 663, '04/12/2026'),
        ph(0, 308, 647.1, 'Reference'),
        ph(0, 470, 647.1, 'PO : 8724'),
        ph(0, 308, 633.8, 'Invoice Number'),
        ph(0, 470, 633.8, 'SI-100'),
        ...customer(0, 52, 9.8, [663, 653.3, 643.5, 633.8, 624, 614.3, 604.5]),
        ph(0, 32, 543.9, 'Description'),
        ph(0, 500, 543.9, 'VAT %'),
        ph(0, 549, 543.9, 'Net'),
        ph(0, 32, 528.5, 'Catering-Community Sports Day'),
        ph(0, 511, 528.5, '9.00'),
        ph(0, 536, 528.5, '733.95'),
        ph(0, 32, 485.4, 'VAT Rate'),
        ph(0, 282, 485.4, 'Net'),
        ph(0, 330, 485.4, 'VAT'),
        ph(0, 413, 485.4, 'Total Net'),
        ph(0, 532, 485.4, '733.95'),
        ph(0, 32, 470.7, 'Second Reduced Rate 9.00% (9.00%)'),
        ph(0, 261, 470.7, '€ 733.95'),
        ph(0, 317, 470.7, '€ 66.05'),
        ph(0, 409, 470.7, 'Total VAT'),
        ph(0, 537, 470.7, '66.05'),
        ph(0, 419, 457.7, 'TOTAL'),
        ph(0, 524, 457.7, '€ 800.00'),
        ph(0, 88, 419.6, "We accept online payments. It's a fast, secure and very easy way to pay.", 8.3),
        ph(0, 409, 419.6, 'Ready to pay?', 8.3),
        ph(0, 35, 414.2, 'Pay Now', 8.3),
        ph(0, 28, 328.1, 'Notes:'),
        ...customer(0, 28, 9, [311.9, 293.9, 284.9, 275.9, 266.9, 257.9, 248.9]),
        ph(0, 28, 302.9, 'SICAP'),
        ph(0, 28, 214.1, 'Terms and Conditions:'),
        ph(0, 28, 197.9, 'AIB Bank-Blackpool-Cork'),
        ph(0, 28, 181.4, 'Hearth Foods & Co-T/A Grill Shack'),
        ph(0, 28, 164.9, 'IBAN : IE29AIBK93115212345678'),
        ph(0, 28, 155.9, 'Sort : 931152'),
        ph(0, 28, 146.9, 'Acc No : 12345678'),
        ...footer(0),
        ...letterhead(1),
        ph(1, 28, 685.5, 'Deliver To:'),
        ...customer(1, 52, 9.8, [663, 653.3, 643.5, 633.8, 624, 614.3, 604.5]),
        ...footer(1),
    ];
}

/**
 * The same invoice software with the letterhead set flush right: the company and the name it
 * trades under in big type, then the address in small type, each line ending at the margin
 */
export function rightLetterheadInvoice(): Phrase[] {
    const right = (y: number, text: string, h = 9) => ph(0, 567 - text.length * h * 0.48, y, text, h);
    const customer = (x: number) =>
        ['Mary Murphy', 'Cork City Partnership', 'SICAP, Cork City Partnership', 'Heron House', 'Blackpool Retail Park, Blackpool', 'Cork'].map((text, i) => ph(0, x, [663, 653.3, 643.5, 633.8, 624, 614.3][i], text, 9.8));
    return [
        right(798.6, 'Larkfield Kitchens Ltd.', 14.4),
        right(784.2, 'T/A Bramble Bites', 14.4),
        right(771.5, 'Unit 4, Glenmore Business Park'),
        right(762.5, 'Carrigaline, Cork, P43 XX99'),
        right(753.5, 'Ireland'),
        right(740.7, 'Website https://www.bramblebites.example'),
        right(731.7, 'Telephone: 0210000000'),
        right(722.7, 'Mobile 0870000001'),
        right(713.7, 'Email hello@bramblebites.example'),
        ph(0, 28, 686.6, 'Invoice To:', 11.7),
        ph(0, 310, 686.6, 'Deliver To:', 11.7),
        right(686.6, 'SALES INVOICE', 11.7),
        ...customer(52),
        ...customer(334),
        ph(0, 28, 536.4, 'Invoice Date'),
        ph(0, 165, 536.4, 'Due Date'),
        ph(0, 281, 536.4, 'Reference'),
        ph(0, 499, 536.4, 'Invoice Number'),
        ph(0, 28, 527.7, '06/11/2026'),
        ph(0, 165, 527.7, '06/12/2026'),
        ph(0, 281, 527.7, 'PO – 9100'),
        ph(0, 530, 527.7, 'SI-200'),
        ph(0, 31, 504.2, 'Code'),
        ph(0, 132, 504.2, 'Description'),
        ph(0, 382, 504.2, 'Qty/Hrs'),
        ph(0, 434, 504.2, 'Price/Rate'),
        ph(0, 489, 504.2, 'VAT %'),
        ph(0, 549, 504.2, 'Net'),
        ph(0, 31, 489.5, 'PLATTER'),
        ph(0, 132, 489.5, 'Sandwich Platter'),
        ph(0, 394, 489.5, '7.00'),
        ph(0, 451, 489.5, '40.00'),
        ph(0, 496, 489.5, '0.00'),
        ph(0, 536, 489.5, '280.00'),
        ph(0, 413, 447.2, 'Total Net'),
        ph(0, 532, 447.2, '280.00'),
        ph(0, 409, 431.7, 'Total VAT'),
        ph(0, 542, 431.7, '0.00'),
        ph(0, 419, 418.7, 'TOTAL'),
        ph(0, 524, 418.7, '€ 280.00'),
        ph(0, 28, 53.6, 'Registered in Republic of Ireland No. 123457 , VAT Registration Number IE 7654321AB', 7.5),
        ph(0, 28, 44.6, 'Registered Address Unit 4, Glenmore Business Park, Carrigaline, Cork, P43 XX99, Ireland', 7.5),
    ];
}

/**
 * A one-page invoice whose items table centres each cell: the "Item" header sits over the
 * middle of a wide column, each description runs over three centred lines with its numbers on
 * the middle one, and who booked it is named with the order number ("Booked by Mary 6123.").
 * The supplier signs off at the bottom, set flush right, with a free mail address.
 */
export function centredCellInvoice(): Phrase[] {
    const centred = (y: number, text: string) => ph(0, 181 - (text.length * 14 * 0.48) / 2, y, text, 14);
    const right = (y: number, text: string) => ph(0, 255 - text.length * 14 * 0.48, y, text, 14);
    return [
        ph(0, 436, 682.7, 'INVOICE', 26),
        ph(0, 74, 636.7, 'SOUND & LIGHT HIRE', 11),
        ph(0, 53, 597.4, 'BILL TO:', 14),
        ph(0, 433, 589.7, 'Invoice #: 2026-03-1-1', 12),
        ph(0, 419, 575.2, 'Invoice Date: 1-Mar-2026', 12),
        ph(0, 53, 564.2, 'Cork City Partnership SICAP', 13),
        ph(0, 428, 564.2, 'Due Date: 20-Mar-2026', 13),
        ph(0, 53, 548.9, 'Heron House, Blackpool, Cork City', 13),
        ph(0, 167, 507.1, 'Item', 14),
        ph(0, 329, 507.1, 'Quantity', 14),
        ph(0, 416, 507.1, 'Rate', 14),
        ph(0, 487, 507.1, 'Amount', 14),
        centred(476.9, 'Hire of a PA system and stage lighting'),
        centred(457.1, 'with delivery and set up for the summer'),
        ph(0, 351, 457.1, '1', 14),
        ph(0, 415, 457.1, '€400.00', 14),
        ph(0, 500, 457.1, '€400.00', 14),
        centred(437.6, 'festival at the City Hall. Booked by Mary 6123.'),
        centred(400, 'Hire of two radio microphones for'),
        centred(380.2, 'the community awards night, with a'),
        ph(0, 351, 380.2, '1', 14),
        ph(0, 415, 380.2, '€150.00', 14),
        ph(0, 500, 380.2, '€150.00', 14),
        centred(360.7, 'technician on site.'),
        ph(0, 49, 328, 'FIVE HUNDRED FIFTY EUR AND ZERO CENTS', 14),
        ph(0, 409, 298, 'Subtotal:', 14),
        ph(0, 500, 298, '€550.00', 14),
        ph(0, 409, 269, 'Tax (0%):', 14),
        ph(0, 514, 269, '€0.00', 14),
        ph(0, 427, 240, 'Total:', 14),
        ph(0, 500, 240, '€550.00', 14),
        ph(0, 49, 204.8, 'Please pay into attached bank account, via IBAN transfer', 14),
        right(169.6, 'BRIGHT SOUND'),
        ph(0, 347, 169.6, 'PAYMENT DETAILS:', 14),
        right(152.3, 'Coolnagarrane, Ballyvourney,'),
        right(135.3, 'Macroom, Co. Cork,'),
        ph(0, 347, 135.3, 'IBAN: IE29AIBK93115212345678', 14),
        ph(0, 98, 118.3, 'P12 XX00,', 14),
        right(118.3, '085 00 00 000'),
        ph(0, 347, 118.3, 'BIC: AIBKIE2D', 14),
        right(101, 'brightsound.ie@gmail.com'),
        ph(0, 347, 101, 'NAME: BRIGHT SOUND', 14),
    ];
}

/**
 * Laid out like a QuickBooks invoice: the invoice number beside the word "INVOICE" in a box of
 * labels, an Activity column before the Description, and a description wrapped over three lines
 * ending with who booked it and the PO.
 */
export function quickbooksLikeInvoice(): Phrase[] {
    return [
        ph(0, 18, 747, 'Murphy Coaches Ltd', 10),
        ph(0, 18, 732.8, 'Unit 5 Riverside Ind Estate', 6.7),
        ph(0, 18, 721.5, 'Glanmire, Cork T45XX00 IE', 6.7),
        ph(0, 18, 709.5, '+353870000000', 6.7),
        ph(0, 18, 698.3, 'murphycoachesbookings@gmail.com', 6.7),
        ph(0, 18, 652.5, 'INVOICE', 12.5),
        ph(0, 18, 632.3, 'BILL TO', 8.3),
        ph(0, 402, 632.3, 'INVOICE', 8.3),
        ph(0, 489, 632.3, '1234', 8.3),
        ph(0, 18, 620.3, 'Cork City Partnership SICAP', 8.3),
        ph(0, 402, 620.3, 'DATE', 8.3),
        ph(0, 489, 620.3, '01-04-2026', 8.3),
        ph(0, 18, 607.5, 'Heron House', 8.3),
        ph(0, 402, 607.5, 'TERMS', 8.3),
        ph(0, 489, 607.5, 'Due on receipt', 8.3),
        ph(0, 18, 594.8, 'Blackpool', 8.3),
        ph(0, 402, 594.8, 'DUE DATE', 8.3),
        ph(0, 489, 594.8, '01-04-2026', 8.3),
        ph(0, 18, 582.8, 'Cork City', 8.3),
        ph(0, 22, 551.3, 'DATE', 8.3),
        ph(0, 108, 551.3, 'ACTIVITY', 8.3),
        ph(0, 223, 551.3, 'DESCRIPTION', 8.3),
        ph(0, 554, 551.3, 'AMOUNT', 8.3),
        ph(0, 22, 527.3, '31-03-2026', 9.2),
        ph(0, 108, 527.3, 'Services', 9.2),
        ph(0, 223, 527.3, 'Ref 12 Hire of a 30 seater bus from Main Street to the', 9.2),
        ph(0, 562, 527.3, '300.00', 9.2),
        ph(0, 223, 516, 'Community Garden in Ballincollig and return. Booked', 9.2),
        ph(0, 223, 504.8, 'Mary Murphy PO 9123', 9.2),
        ph(0, 298, 468, 'BALANCE DUE', 12.8),
        ph(0, 523, 468, 'EUR 300.00', 12.8),
        ph(0, 25, 441, 'Bank Details:', 8.3),
        ph(0, 25, 430.5, 'Bank Of Ireland, Glanmire, Cork', 8.3),
        ph(0, 25, 420, 'BIC: BOFIIE2D', 8.3),
        ph(0, 25, 409.5, 'IBAN: IE29AIBK93115212345678', 8.3),
    ];
}
