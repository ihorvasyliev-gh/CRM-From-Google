import { describe, expect, it } from 'vitest';
import { extractInvoice, joinAddress, numberedPeople } from './extract';
import { docxPhrases } from './read';
import { centredCellInvoice, formInvoiceScan, letterheadInvoice, quickbooksLikeInvoice, rightLetterheadInvoice, simpleVatInvoice, xeroLikeInvoice } from './testInvoices';

describe('extractInvoice: a Xero-style invoice over two pages', () => {
    const facts = extractInvoice(xeroLikeInvoice());

    it('reads the labelled values', () => {
        expect(facts.hasText).toBe(true);
        expect(facts.invoiceNumber).toMatchObject({ value: 'INV-0101', sure: true });
        expect(facts.invoiceDate?.value).toBe('2026-10-21');
        expect(facts.dueDate?.value).toBe('2026-11-20');
        expect(facts.poNumber).toMatchObject({ value: '9001', sure: true });
        expect(facts.mentionsSicap).toBe(true);
        expect(facts.attention).toBe('Jane Murphy');
    });

    it('finds the total, sure when the labels and lines agree', () => {
        expect(facts.total).toMatchObject({ value: 450, sure: true });
        expect(facts.subtotal?.value).toBe(450);
        // "Tax on Sales" in the tax column of an item is not a VAT line
        expect(facts.vat).toBeUndefined();
    });

    it('reads the item across the page break, with its people and dates', () => {
        expect(facts.items).toHaveLength(1);
        expect(facts.items[0]).toMatchObject({ description: 'Manual Handling QQI Level 5', quantity: 3, unitPrice: 150, amount: 450 });
        expect(facts.people).toEqual(['Anna Kowalska', 'Olena Petrenko', 'Ahmed Hassan Ali']);
        expect(facts.serviceDates).toEqual({ start: '2026-11-03', end: '2026-11-05' });
        // The footer printed on both pages is not part of the item
        expect(facts.items[0].details.join(' ')).not.toMatch(/Registered Office/);
    });

    it('takes the supplier from the payment advice, never the customer', () => {
        expect(facts.supplier.name).toMatchObject({ value: 'Brightway Safety Training Services', sure: true });
        expect(facts.supplier.address?.value).toBe('BRIGHTWAY, UNIT 7, MILL ROAD, CORK T12 AB34, IRELAND');
        expect(facts.supplier.vatNumber).toBe('IE1234567T');
        expect(facts.supplier.iban).toBe('IE29AIBK93115212345678');
        expect(facts.supplier.bic).toBe('AIBKIE2D');
        expect(facts.supplier.email).toBe('accounts@brightway.ie');
        expect(facts.supplier.phone).toBe('021 430 2310');
    });

    it('marks where each value was read', () => {
        expect(facts.poNumber?.source?.[0]).toMatchObject({ page: 0 });
        expect(facts.supplier.name?.source?.length).toBeGreaterThan(0);
    });
});

describe('extractInvoice: a simple VAT invoice', () => {
    const facts = extractInvoice(simpleVatInvoice());

    it('reads label: value pairs on one line', () => {
        expect(facts.invoiceNumber?.value).toBe('GC-2231');
        expect(facts.invoiceDate?.value).toBe('2026-11-05');
        expect(facts.poNumber?.value).toBe('7788');
        expect(facts.mentionsSicap).toBe(false);
    });

    it('separates subtotal, VAT and the total due', () => {
        expect(facts.subtotal?.value).toBe(350);
        expect(facts.vat?.value).toBe(47.25);
        expect(facts.total).toMatchObject({ value: 397.25, sure: true });
        expect(facts.items.map(i => [i.description, i.quantity, i.unitPrice, i.amount])).toEqual([
            ['Lunch for course participants', 20, 12.5, 250],
            ['Room hire', 1, 100, 100],
        ]);
    });

    it('takes the supplier from the "From:" block and its phone number, named as cheques are payable', () => {
        expect(facts.supplier.name).toMatchObject({ value: 'Greenleaf Catering Ltd', sure: true });
        expect(facts.supplier.address?.value).toBe('12 Patrick Street, Cork T12 XY99');
        expect(facts.supplier.phone).toBe('087 123 4567');
    });
});

describe('extractInvoice: a sole trader\'s form, read off a scan', () => {
    const facts = extractInvoice(formInvoiceScan());

    it('takes the supplier from "Name:" and "Address:" under "FROM:", never the customer under "TO:"', () => {
        expect(facts.supplier.name).toMatchObject({ value: 'Oksana Bondar', sure: true, from: 'Name: Oksana Bondar' });
        expect(facts.supplier.address).toMatchObject({ value: 'Rose Cottage, Knockane, Coachford, Co. Cork P12XK47', sure: true });
        expect(facts.supplier.phone).toBe('087-555-0142');
        expect(facts.supplier.iban).toBe('IE29AIBK93115212345678');
    });

    it('reads the days of the course as dates, not as money', () => {
        expect(facts.items.map(i => [i.description, i.amount])).toEqual([
            ['Preparation of materials, needs assessment and delivery of Summer Speaking Club for SICAP New Arrivals Programme, Cork City Partnership', undefined],
        ]);
        expect(facts.serviceDates?.days).toEqual([
            '2026-07-28',
            '2026-07-30',
            '2026-08-04',
            '2026-08-06',
            '2026-08-11',
            '2026-08-13',
            '2026-08-18',
            '2026-08-20',
            '2026-08-25',
            '2026-08-27',
            '2026-09-01',
            '2026-09-03',
        ]);
    });

    it('takes the total, but not as confirmed: one label is not two things agreeing', () => {
        expect(facts.total).toMatchObject({ value: 2400, sure: false });
        expect(facts.invoiceNumber?.value).toBe('0007');
        expect(facts.invoiceDate?.value).toBe('2026-08-28');
        expect(facts.poNumber?.value).toBe('8264');
    });
});

describe('extractInvoice: a letterhead, with the registration in the footer', () => {
    const facts = extractInvoice(letterheadInvoice());

    it('takes the name printed big over the address, not the registration line', () => {
        expect(facts.supplier.name?.value).toBe('Grill Shack');
        expect(facts.supplier.address?.value).toBe('Hearth Foods & Co, 12 Quayside Business Park, Ballybrack, Little Island, Cork, T45 XX12, Ireland');
        expect(facts.supplier.phone).toBe('0214000000');
    });

    it('reads each total beside its own label, so they add up', () => {
        expect(facts.subtotal?.value).toBe(733.95);
        expect(facts.vat?.value).toBe(66.05);
        expect(facts.total).toMatchObject({ value: 800, sure: true });
        expect(facts.poNumber?.value).toBe('8724');
        expect(facts.invoiceNumber?.value).toBe('SI-100');
    });

    it('falls back on the registered address, without its label', () => {
        const noLetterhead = extractInvoice(letterheadInvoice().filter(p => p.y < 730));
        expect(noLetterhead.supplier.name).toBeUndefined();
        expect(noLetterhead.supplier.address?.value).toBe('12 Quayside Business Park, Ballybrack Little Island, Cork, Cork, T45XX12');
    });
});

describe('extractInvoice: a letterhead set flush right', () => {
    const facts = extractInvoice(rightLetterheadInvoice());

    it('takes both big lines as the name and the small lines under them as the address', () => {
        expect(facts.supplier.name).toMatchObject({ value: 'Larkfield Kitchens Ltd. T/A Bramble Bites', sure: true });
        expect(facts.supplier.address?.value).toBe('Unit 4, Glenmore Business Park, Carrigaline, Cork, P43 XX99, Ireland');
        expect(facts.supplier.phone).toBe('0210000000');
        expect(facts.total?.value).toBe(280);
        expect(facts.invoiceNumber?.value).toBe('SI-200');
    });

    it('joins a "T/A" line under the name to it', () => {
        // Flush left, all in one size, the address on two lines
        const left = rightLetterheadInvoice()
            .filter(p => p.y > 760 || p.y < 700)
            .map(p => (p.y > 760 ? { ...p, x: 28, h: 9 } : p));
        const supplier = extractInvoice(left).supplier;
        expect(supplier.name?.value).toBe('Larkfield Kitchens Ltd. T/A Bramble Bites');
        expect(supplier.address?.value).toBe('Unit 4, Glenmore Business Park, Carrigaline, Cork, P43 XX99');
    });
});

describe('extractInvoice: an items table with centred cells', () => {
    const facts = extractInvoice(centredCellInvoice());

    it('reads each cell whole, from the lines above its numbers to the lines under them', () => {
        expect(facts.items.map(i => [i.description, i.quantity, i.amount])).toEqual([
            ['Hire of a PA system and stage lighting with delivery and set up for the summer festival at the City Hall. Booked by Mary 6123.', 1, 400],
            ['Hire of two radio microphones for the community awards night, with a technician on site.', 1, 150],
        ]);
        expect(facts.total).toMatchObject({ value: 550, sure: true });
    });

    it('takes the order number after who booked it, and an invoice number that starts like a date', () => {
        expect(facts.poNumber).toMatchObject({ value: '6123', sure: false });
        expect(facts.invoiceNumber?.value).toBe('2026-03-1-1');
        const inMarch = centredCellInvoice().map(p => ({ ...p, text: p.text.replace('Booked by Mary 6123.', 'Booked by March 2026.') }));
        expect(extractInvoice(inMarch).poNumber).toBeUndefined();
    });

    it('takes the supplier from the sign-off set flush right, never from the items', () => {
        expect(facts.supplier.name).toMatchObject({ value: 'BRIGHT SOUND', sure: true });
        expect(facts.supplier.address?.value).toBe('Coolnagarrane, Ballyvourney, Macroom, Co. Cork, P12 XX00');
    });
});

describe('extractInvoice: laid out like QuickBooks', () => {
    const facts = extractInvoice(quickbooksLikeInvoice());

    it('joins the wrapped lines of the description', () => {
        expect(facts.items).toHaveLength(1);
        expect(facts.items[0]).toMatchObject({
            description: 'Services Ref 12 Hire of a 30 seater bus from Main Street to the Community Garden in Ballincollig and return. Booked Mary Murphy PO 9123',
            details: [],
            amount: 300,
        });
        expect(facts.poNumber).toMatchObject({ value: '9123', sure: true });
    });

    it('takes the invoice number beside the word "INVOICE", as a guess', () => {
        expect(facts.invoiceNumber).toMatchObject({ value: '1234', sure: false });
        expect(facts.supplier.name?.value).toBe('Murphy Coaches Ltd');
    });
});

describe('extractInvoice: nothing to read', () => {
    it('says so for a scan', () => {
        const facts = extractInvoice([]);
        expect(facts.hasText).toBe(false);
        expect(facts.items).toEqual([]);
    });
});

describe('helpers', () => {
    it('joins wrapped name lines of numbered people', () => {
        expect(numberedPeople(['Dates 1st May 2026', '1. Mary', 'Byrne', '2) Tom Walsh', 'Notes: paid in advance'])).toEqual(['Mary Byrne', 'Tom Walsh']);
        expect(numberedPeople(['1. Only one'])).toEqual([]);
    });

    it('joins address lines, mending a wrapped Eircode', () => {
        expect(joinAddress(['UNIT 7,', 'CORK CITY CORK T12', 'R2KX', 'IRELAND'])).toBe('UNIT 7, CORK CITY CORK T12 R2KX, IRELAND');
    });
});

describe('Word invoices', () => {
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const p = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
    const tabbed = (a: string, b: string) => `<w:p><w:r><w:t>${a}</w:t></w:r><w:r><w:tab/><w:t>${b}</w:t></w:r></w:p>`;
    const cell = (...paras: string[]) => `<w:tc>${paras.map(p).join('')}</w:tc>`;
    const xml = `<w:document ${W}><w:body>
        ${p('INVOICE')}
        ${p('From: Riverside Tutors')}
        ${p('5 Lee Road, Cork')}
        ${tabbed('Invoice No:', 'RT-17')}
        ${tabbed('PO Number:', '4455')}
        <w:tbl>
            <w:tr>${cell('Description')}${cell('Hours')}${cell('Rate')}${cell('Amount')}</w:tr>
            <w:tr>${cell('English tutoring 1st - 5th June 2026')}${cell('10')}${cell('40.00')}${cell('400.00')}</w:tr>
            <w:tr>${cell('')}${cell('')}${cell('Total')}${cell('400.00')}</w:tr>
        </w:tbl>
    </w:body></w:document>`;

    it('lays paragraphs and table cells out so labels find their values', () => {
        const facts = extractInvoice(docxPhrases(xml));
        expect(facts.invoiceNumber?.value).toBe('RT-17');
        expect(facts.poNumber?.value).toBe('4455');
        expect(facts.total?.value).toBe(400);
        expect(facts.items[0]).toMatchObject({ description: 'English tutoring 1st - 5th June 2026', quantity: 10, unitPrice: 40, amount: 400 });
        expect(facts.serviceDates).toEqual({ start: '2026-06-01', end: '2026-06-05' });
        expect(facts.supplier.name?.value).toBe('Riverside Tutors');
    });

    const NS = `${W} xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:v="urn:schemas-microsoft-com:vml"`;
    /** A text box `x` points from the margin, as Word saves it: a drawing, and an old-style copy for older readers */
    const box = (x: number, ...paras: string[]) => {
        const content = `<w:txbxContent>${paras.map(p).join('')}</w:txbxContent>`;
        return `<w:r><mc:AlternateContent>
            <mc:Choice Requires="wps"><w:drawing><wp:anchor><wp:positionH relativeFrom="column"><wp:posOffset>${x * 12700}</wp:posOffset></wp:positionH><wp:extent cx="2400000" cy="1100000"/><wps:txbx xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">${content}</wps:txbx></wp:anchor></w:drawing></mc:Choice>
            <mc:Fallback><w:pict><v:shape style="position:absolute;margin-left:${x}pt"><v:textbox>${content}</v:textbox></v:shape></w:pict></mc:Fallback>
        </mc:AlternateContent></w:r>`;
    };

    it('reads text boxes once each, beside each other, and several PO numbers', () => {
        const xml = `<w:document ${NS}><w:body>
            ${p('INVOICE #     2041                    DATE   14/09/2026')}
            ${p('Invoice To')}
            <w:p>${box(270, 'Aoife Kelly', '0871234567', 'aoife.kelly.training@gmail.com')}${box(0, 'Cork City Partnership', 'SICAP')}</w:p>
            ${p('Description')}
            <w:p>${box(0, 'First Aid Courses', '01/09/26.        PO # 7001', '02/09/26        PO # 7002', '03/09/26        PO # 7003', '3 courses @ €500 each')}</w:p>
            <w:tbl><w:tr>${cell('Total Due')}${cell('€ 1500')}</w:tr></w:tbl>
            ${p('Iban: IE29AIBK93115212345678')}
            ${p('Cheque payable to. Aoife Kelly')}
        </w:body></w:document>`;
        const phrases = docxPhrases(xml);
        expect(phrases.filter(ph => ph.text === 'SICAP')).toHaveLength(1);
        // The supplier's box sits right of the customer's, on the same lines
        const supplier = phrases.find(ph => ph.text === 'Aoife Kelly')!;
        const customer = phrases.find(ph => ph.text === 'Cork City Partnership')!;
        expect(supplier.x).toBe(270);
        expect(supplier.y).toBe(customer.y);

        const facts = extractInvoice(phrases);
        expect(facts.invoiceNumber?.value).toBe('2041');
        expect(facts.invoiceDate?.value).toBe('2026-09-14');
        expect(facts.mentionsSicap).toBe(true);
        expect(facts.poNumbers).toEqual(['7001', '7002', '7003']);
        expect(facts.poNumber).toMatchObject({ value: '7001, 7002, 7003', sure: true });
        expect(facts.items.map(i => [i.description, i.quantity, i.unitPrice, i.amount])).toEqual([['First Aid Courses', 3, 500, 1500]]);
        expect(facts.serviceDates).toEqual({ start: '2026-09-01', days: ['2026-09-01', '2026-09-02', '2026-09-03'] });
        expect(facts.total).toMatchObject({ value: 1500, sure: true });
        expect(facts.supplier.name).toMatchObject({ value: 'Aoife Kelly', sure: true, from: 'Cheque payable to. Aoife Kelly' });
        expect(facts.supplier.phone).toBe('0871234567');
        expect(facts.supplier.address).toBeUndefined();
    });

    const right = (text: string) => `<w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
    const big = (text: string, size = 32) => `<w:p><w:r><w:rPr><w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
    /** Today's date as Word shows it, month first: what the invoice was last saved with is kept */
    const dateField = (shown: string) =>
        `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> DATE \\@ "M/d/yyyy" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>${shown}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
    const plainInvoice = (...lines: string[]) => `<w:document ${W}><w:body>
        ${right('The Willow Room')}${right('Unit 4 Lee Quay')}${right('Cork City')}
        ${big('INVOICE', 44)}
        ${dateField('9/14/2026')}
        ${big('SICAP programme Cork City Partnership')}
        ${lines.map(l => big(l)).join('')}
    </w:body></w:document>`;

    it('reads an invoice written as plain lines, with no table and no labels', () => {
        const facts = extractInvoice(docxPhrases(plainInvoice('Pottery Course 03/09, 10/09', 'PO number 7123', '2 x €75', 'Total €150')));
        expect(facts.supplier.name?.value).toBe('The Willow Room');
        expect(facts.supplier.address?.value).toBe('Unit 4 Lee Quay, Cork City');
        expect(facts.invoiceDate).toMatchObject({ value: '2026-09-14', sure: false });
        expect(facts.poNumber?.value).toBe('7123');
        expect(facts.poNumbers).toBeUndefined();
        expect(facts.items.map(i => [i.description, i.quantity, i.unitPrice, i.amount])).toEqual([['Pottery Course 03/09, 10/09', 2, 75, 150]]);
        expect(facts.total).toMatchObject({ value: 150, sure: true });

        const oneLine = extractInvoice(docxPhrases(plainInvoice('Room hire 3 x €50', 'PO number 7124', 'Total €150')));
        expect(oneLine.items.map(i => [i.description, i.quantity, i.unitPrice, i.amount])).toEqual([['Room hire', 3, 50, 150]]);
        expect(oneLine.total).toMatchObject({ value: 150, sure: true });

        // Nothing to say what the total pays for: it is for the person to check
        const bare = extractInvoice(docxPhrases(plainInvoice('Garden tour 13/06', 'PO number 7125', 'Total €60')));
        expect(bare.items.map(i => i.description)).toEqual(['Garden tour 13/06']);
        expect(bare.total).toMatchObject({ value: 60, sure: false });
    });

    it('reads the letterhead in the page header, once', () => {
        const header = `<w:hdr ${W}>${p('Riverbank Studio')}${p('9 Mill Lane, Cork')}</w:hdr>`;
        const body = `<w:document ${W}><w:body>
            ${p('INVOICE')}
            ${p('Bill To:')}
            ${p('Cork City Partnership')}
            ${tabbed('Invoice No:', 'RS-88')}
            ${tabbed('PO Number:', '4460')}
            ${tabbed('Total Due:', '€120.00')}
        </w:body></w:document>`;
        const phrases = docxPhrases(body, { headers: [header, header] });
        expect(phrases.filter(ph => ph.text === 'Riverbank Studio')).toHaveLength(1);
        const facts = extractInvoice(phrases);
        expect(facts.supplier.name?.value).toBe('Riverbank Studio');
        expect(facts.supplier.address?.value).toBe('9 Mill Lane, Cork');
        expect(facts.invoiceNumber?.value).toBe('RS-88');
        expect(facts.total?.value).toBe(120);
    });
});
