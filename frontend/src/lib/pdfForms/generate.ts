// ─── Filling many forms: one PDF per row (zipped) and/or one combined file ───

import { FormFiller } from './fill';
import type { RowPlan } from './plan';
import type { FormField, TemplateSettings } from './types';

export interface GenerateOptions {
    separate: boolean;
    combined: boolean;
    /** Base name for the zip / combined file (no extension) */
    baseName: string;
    onProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
}

export interface GeneratedFile {
    name: string;
    blob: Blob;
}

export interface GenerateResult {
    files: GeneratedFile[];
    /** Per form: warnings raised while drawing (text shortened, characters replaced) */
    warnings: { fileName: string; messages: string[] }[];
}

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function pdfBlob(bytes: Uint8Array): Blob {
    return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

export async function generateForms(template: Uint8Array, fields: FormField[], settings: TemplateSettings, rows: RowPlan[], opts: GenerateOptions): Promise<GenerateResult> {
    const filler = await FormFiller.create(template);
    const files: GeneratedFile[] = [];
    const warnings: GenerateResult['warnings'] = [];
    // A single form needs no combined copy of itself
    const combine = opts.combined && !(opts.separate && rows.length === 1);
    const steps = (opts.separate ? rows.length : 0) + (combine ? rows.length : 0);
    let done = 0;
    const step = async () => {
        done++;
        opts.onProgress?.(done, steps);
        if (opts.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
        // Let the page repaint (progress bar, cancel button) between forms
        await tick();
    };

    if (opts.separate) {
        const parts: { name: string; bytes: Uint8Array }[] = [];
        for (const row of rows) {
            const filled = await filler.fill(fields, row.values, settings);
            parts.push({ name: row.fileName, bytes: filled.bytes });
            if (filled.warnings.length) warnings.push({ fileName: row.fileName, messages: filled.warnings });
            await step();
        }
        if (parts.length === 1) {
            files.push({ name: parts[0].name, blob: pdfBlob(parts[0].bytes) });
        } else {
            const PizZipModule = await import('pizzip');
            const PizZip = PizZipModule.default || PizZipModule;
            const zip = new PizZip();
            // PDFs are already compressed: store them as they are
            parts.forEach(p => zip.file(p.name, p.bytes));
            files.push({ name: `${opts.baseName}.zip`, blob: zip.generate({ type: 'blob', mimeType: 'application/zip', compression: 'STORE' }) });
        }
    }

    if (combine) {
        const combined = await filler.combine(
            rows.map(r => r.values),
            fields,
            settings,
            () => step(),
        );
        if (!opts.separate) {
            rows.forEach((row, i) => {
                if (combined.warnings[i]?.length) warnings.push({ fileName: row.fileName, messages: combined.warnings[i] });
            });
        }
        const bytes = combined.bytes;
        files.push({ name: `${opts.baseName} (all ${rows.length}).pdf`, blob: pdfBlob(bytes) });
    }
    return { files, warnings };
}
