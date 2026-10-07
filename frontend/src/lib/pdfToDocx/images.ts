// ─── Images: pdf.js's decoded pixels → PNG files for the Word document ───

/** A decoded image as pdf.js hands it over (page.objs) */
export interface DecodedImage {
    width: number;
    height: number;
    /** 1 = 1 bit grey, 2 = RGB, 3 = RGBA */
    kind?: number;
    data?: Uint8Array | Uint8ClampedArray;
    bitmap?: ImageBitmap;
}

/** Pixels as RGBA, whatever pdf.js decoded them to */
export function toRgba(img: DecodedImage): Uint8ClampedArray | null {
    const { width, height, kind, data } = img;
    if (!data || width <= 0 || height <= 0) return null;
    const out = new Uint8ClampedArray(width * height * 4);
    if (kind === 3) {
        out.set(data.subarray(0, out.length));
    } else if (kind === 2) {
        for (let i = 0, j = 0; j < out.length && i + 2 < data.length; i += 3, j += 4) {
            out[j] = data[i];
            out[j + 1] = data[i + 1];
            out[j + 2] = data[i + 2];
            out[j + 3] = 255;
        }
    } else if (kind === 1) {
        // One bit per pixel, rows padded to whole bytes; a set bit is white
        const rowBytes = (width + 7) >> 3;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const bit = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
                const j = (y * width + x) * 4;
                const v = bit ? 255 : 0;
                out[j] = out[j + 1] = out[j + 2] = v;
                out[j + 3] = 255;
            }
        }
    } else {
        return null;
    }
    return out;
}

/** Wait for pdf.js to finish decoding an image of this page */
export function pageImage(objs: { get: (id: string, cb?: (data: unknown) => void) => unknown }, id: string, timeoutMs = 10_000): Promise<DecodedImage | null> {
    return new Promise(resolve => {
        const timer = setTimeout(() => resolve(null), timeoutMs);
        try {
            objs.get(id, data => {
                clearTimeout(timer);
                resolve((data as DecodedImage) ?? null);
            });
        } catch {
            clearTimeout(timer);
            resolve(null);
        }
    });
}

/** Encode a decoded image as PNG in the browser (canvas) */
export async function imageToPng(img: DecodedImage): Promise<Uint8Array | null> {
    const { width, height } = img;
    if (!width || !height) return null;
    const canvas: HTMLCanvasElement | OffscreenCanvas =
        typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) return null;
    if (img.bitmap) {
        ctx.drawImage(img.bitmap, 0, 0);
    } else {
        const rgba = toRgba(img);
        if (!rgba) return null;
        ctx.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
    }
    const blob =
        'convertToBlob' in canvas
            ? await canvas.convertToBlob({ type: 'image/png' })
            : await new Promise<Blob | null>(resolve => (canvas as HTMLCanvasElement).toBlob(resolve, 'image/png'));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}
