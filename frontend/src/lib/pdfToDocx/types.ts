// ─── PDF → Word: what is read from a PDF page ──────────────────
// Coordinates are PDF points with the origin at the bottom-left of the page,
// the same as lib/pdfForms. The Word writer flips them to top-left.

export interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface FontFace {
    /** Font family as Word knows it ("Arial", "Times New Roman") */
    family: string;
    bold: boolean;
    italic: boolean;
    /** The PDF's own name for the font, without the subset prefix ("Arial-BoldMT") */
    pdfName: string;
    /** Ascent and descent of the embedded font, in em (descent is negative) */
    ascent: number;
    descent: number;
}

/** One character as painted: its baseline origin, how far the next one starts, its look */
export interface Glyph {
    ch: string;
    x: number;
    y: number;
    /** Advance to where the PDF puts the next character (spacing and kerning included) */
    adv: number;
    /** The font's own advance for this character, in em (what Word will use) */
    em: number;
    /** Font size in points */
    size: number;
    font: FontFace;
    /** RRGGBB */
    color: string;
    alpha: number;
    /** Paint order on the page */
    z: number;
    /** Text direction in degrees (0 = left to right, 90 = bottom to top) */
    angle: number;
}

export interface Paint {
    /** RRGGBB */
    color: string;
    alpha: number;
}

/** A path segment in page coordinates: M/L take one point, C three, Z none */
export type Segment = { op: 'M' | 'L'; x: number; y: number } | { op: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number } | { op: 'Z' };

export interface VectorShape {
    z: number;
    segments: Segment[];
    /** Bounding box of the path (not counting the stroke width) */
    box: Box;
    fill: Paint | null;
    stroke: (Paint & { width: number }) | null;
    /** The path is one axis-aligned rectangle */
    isRect: boolean;
}

export interface ImagePlacement {
    z: number;
    /** pdf.js object id of an image XObject, or the decoded data of an inline image */
    source: { objId: string } | { inline: unknown };
    /** Where the image lands on the page */
    box: Box;
    flipH: boolean;
    flipV: boolean;
    /** Visible part of the box, when a clip path cuts it */
    clip: Box | null;
}

export interface PageGraphics {
    index: number;
    w: number;
    h: number;
    glyphs: Glyph[];
    shapes: VectorShape[];
    images: ImagePlacement[];
}
