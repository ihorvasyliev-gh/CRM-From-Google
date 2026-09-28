// ─── PDF Forms: data model ─────────────────────────────────────
// A template is a flat PDF (no fillable fields, e.g. a Word export) plus a list of
// fields that say what to print where. Coordinates are PDF points with the origin
// at the bottom-left of the page, exactly as pdf-lib draws them; pages are 0-based.

export interface Rect {
    page: number;
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * Where a field's value comes from: text with `{Column header}` placeholders,
 * optionally with filters: `{Contact Name|first}`, `{Date|dd}`, `{today}`.
 * Plain text without braces is a fixed value.
 */
export type ValueSource = string;

export interface TextField {
    id: string;
    kind: 'text';
    /** Name shown in the editor and the report */
    name: string;
    source: ValueSource;
    rect: Rect;
    /** Largest font size; long values shrink down to MIN_FONT_SIZE to fit */
    fontSize: number;
    multiline: boolean;
    align: 'left' | 'center';
    /** The box is ruled into this many writing lines: text goes between the rules */
    lines?: number;
    /** Where the rules are, as fractions of the box height from the bottom (else evenly spaced) */
    rules?: number[];
}

export interface ChoiceOption {
    id: string;
    /** The checkbox's own label as printed on the PDF */
    label: string;
    rect: Rect;
    /** Spreadsheet answers that tick this box, besides ones that resemble the label */
    aliases: string[];
}

export interface ChoiceField {
    id: string;
    kind: 'choice';
    name: string;
    /** Usually one column; answers may hold several choices separated by ";" or new lines */
    source: ValueSource;
    /** "Select one option": only the first matching answer is ticked (with a warning) */
    single: boolean;
    options: ChoiceOption[];
}

export type FormField = TextField | ChoiceField;

export interface TemplateSettings {
    mark: 'tick' | 'cross';
    /** Pattern for output file names, same placeholders as field sources */
    fileName: ValueSource;
}

export interface PdfFormTemplate {
    id: string;
    name: string;
    description: string | null;
    pdf_path: string;
    pdf_name: string;
    /** Bumped each time a new revision of the PDF replaces the old one */
    revision: number;
    fields: FormField[];
    /** Saved column matches: header in the template → headers seen in other spreadsheets */
    column_aliases: Record<string, string[]>;
    settings: TemplateSettings;
    created_at: string;
    updated_at: string;
}

export type PdfFormTemplateDraft = Pick<PdfFormTemplate, 'name' | 'description' | 'fields' | 'column_aliases' | 'settings'>;

export const DEFAULT_SETTINGS: TemplateSettings = { mark: 'tick', fileName: '' };
export const DEFAULT_FONT_SIZE = 10;
export const MIN_FONT_SIZE = 6;

// ─── Layout read from the PDF (not stored; extracted when needed) ────

/** A run of text on one line (words closer together than a column gap) */
export interface Phrase {
    page: number;
    /** Left edge and baseline */
    x: number;
    y: number;
    w: number;
    /** Font size */
    h: number;
    text: string;
}

export interface Checkbox {
    /** "p<page>-<index>", stable only within one extraction */
    id: string;
    rect: Rect;
    label: string;
}

/** A horizontal or vertical table border / cell edge */
export interface Edge {
    page: number;
    /** Horizontal: y is the line, [a, b] the x range. Vertical: x is the line, [a, b] the y range. */
    dir: 'h' | 'v';
    at: number;
    a: number;
    b: number;
}

export interface PdfLayout {
    pages: { w: number; h: number }[];
    phrases: Phrase[];
    checkboxes: Checkbox[];
    edges: Edge[];
}

// ─── Spreadsheet ────────────────────────────────────────────────

export interface SheetData {
    headers: string[];
    rows: string[][];
    /** Spreadsheet row number of each row (for people to find it) */
    rowNumbers?: number[];
    fileName: string;
}
