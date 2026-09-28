// A small synthetic form, laid out like the Word-exported SICAP forms, for tests.
import { buildLayout, type RawRect, type RawTextItem } from './layout';
import type { PdfLayout } from './types';

const BOX = '';
const FS = 10.5;

function t(page: number, x: number, y: number, str: string, h = FS): RawTextItem {
    return { page, x, y, str, h, w: str.length * h * 0.5 };
}

/**
 * Page 0: a table with "CO Name" | [value] and "First Name" | [value] | "Last Name" | [value],
 * then a "Future contact" row with Yes / No boxes.
 * Page 1: "Target group (select one option)" with four boxes in two columns, one label wrapping.
 * `dy` shifts everything on page 0 (to fake a new revision).
 */
export function makeLayout(dy = 0): PdfLayout {
    const items: RawTextItem[] = [
        t(0, 20, 780 + dy, 'Community Organisation', 24),
        t(0, 22, 700 + dy, 'CO Name'),
        t(0, 22, 670 + dy, 'First Name'),
        t(0, 300, 670 + dy, 'Last Name'),
        t(0, 22, 640 + dy, 'Future Contact'),
        { page: 0, x: 400, y: 640 + dy, str: BOX, w: 10.2, h: 17 },
        t(0, 418, 640 + dy, 'Yes'),
        { page: 0, x: 470, y: 640 + dy, str: BOX, w: 10.2, h: 17 },
        t(0, 488, 640 + dy, 'No'),

        t(1, 22, 700, 'Target group'),
        t(1, 22, 686, '(select one option)'),
        { page: 1, x: 140, y: 720, str: BOX, w: 10.2, h: 17 },
        t(1, 158, 720, 'People living in'),
        t(1, 158, 706, 'disadvantaged communities'),
        { page: 1, x: 140, y: 690, str: BOX, w: 10.2, h: 17 },
        t(1, 158, 690, 'Travellers'),
        { page: 1, x: 350, y: 720, str: `${BOX} Refugees`, w: 50, h: 17 },
        { page: 1, x: 350, y: 690, str: BOX, w: 10.2, h: 17 },
        t(1, 368, 690, 'Not applicable'),
    ];
    const line = (page: number, x: number, y: number, w: number, h: number): RawRect => ({ page, x, y, w, h });
    const rects: RawRect[] = [
        // Page 0 table: rows at 690–715 and 660–685, columns 18 | 108 | 296 | 388 | 577
        line(0, 18, 715 + dy, 559, 0.5),
        line(0, 18, 687 + dy, 559, 0.5),
        line(0, 18, 660 + dy, 559, 0.5),
        line(0, 18, 630 + dy, 559, 0.5),
        line(0, 18, 630 + dy, 0.5, 85),
        line(0, 108, 660 + dy, 0.5, 55),
        line(0, 296, 660 + dy, 0.5, 27),
        line(0, 388, 660 + dy, 0.5, 27),
        line(0, 390, 630 + dy, 0.5, 30),
        line(0, 577, 630 + dy, 0.5, 85),
        // A full-page background is ignored
        line(0, 0, 0, 595, 842),
        // Page 1: one cell holding all four boxes
        line(1, 18, 740, 559, 0.5),
        line(1, 18, 670, 559, 0.5),
        line(1, 18, 670, 0.5, 70),
        line(1, 130, 670, 0.5, 70),
        line(1, 577, 670, 0.5, 70),
    ];
    return buildLayout([{ w: 595, h: 842 }, { w: 595, h: 842 }], items, rects);
}
