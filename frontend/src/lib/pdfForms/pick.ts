// ─── Which template fits a spreadsheet? ────────────────────────
// Drop a spreadsheet on the PDF Forms page and the template whose columns it has wins.

import { bestSheet, sheetFrom, type Workbook } from './excel';
import { templateColumns } from './plan';
import { matchColumns } from './source';
import type { PdfFormTemplate } from './types';

export interface TemplateFit {
    template: PdfFormTemplate;
    /** Columns the template reads that the spreadsheet has */
    found: number;
    total: number;
    score: number;
    /** Which sheet of the workbook fits the form best */
    sheetIndex: number;
}

export function rankTemplates(templates: PdfFormTemplate[], headers: string[]): TemplateFit[] {
    return templates
        .map(template => {
            const wanted = templateColumns(template.fields, template.settings);
            const matches = [...matchColumns(wanted, headers, template.column_aliases).values()];
            const found = matches.filter(m => m.index !== null).length;
            return { template, found, total: wanted.length, score: wanted.length ? found / wanted.length : 0, sheetIndex: 0 };
        })
        .sort((a, b) => b.score - a.score || b.found - a.found);
}

/** Like rankTemplates, looking at every sheet of the workbook for each form */
export function rankTemplatesForWorkbook(templates: PdfFormTemplate[], workbook: Workbook): TemplateFit[] {
    return templates
        .map(template => {
            const wanted = templateColumns(template.fields, template.settings);
            const sheetIndex = bestSheet(workbook, wanted);
            const headers = sheetFrom(workbook, sheetIndex, wanted).headers;
            const found = [...matchColumns(wanted, headers, template.column_aliases).values()].filter(m => m.index !== null).length;
            return { template, found, total: wanted.length, score: wanted.length ? found / wanted.length : 0, sheetIndex };
        })
        .sort((a, b) => b.score - a.score || b.found - a.found);
}

/** The one template to open straight away, if the choice is clear */
export function clearWinner(fits: TemplateFit[]): PdfFormTemplate | null {
    const [best, next] = fits;
    if (!best || best.score < 0.6) return null;
    if (next && next.score >= best.score - 0.2) return null;
    return best.template;
}
