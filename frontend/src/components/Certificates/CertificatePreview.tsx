import { useEffect, useRef, useState } from 'react';
import { Eye, Loader2 } from 'lucide-react';
import Card from '../ui/Card';
import { fieldCls } from '../ui/styles';
import { fillTemplate } from '../../lib/documentRender';
import { drawDocxPages } from '../../lib/certificates/pages';

/** Dots to the inch of the preview: enough for the screen, quick to redraw while typing */
const PREVIEW_DPI = 110;
const REDRAW_AFTER_MS = 350;

interface Props {
    template: ArrayBuffer;
    /** The certificates that can be shown: a name to pick by, and the values */
    people: { label: string; data: Record<string, string> }[];
}

function canvasUrl(canvas: HTMLCanvasElement): Promise<string> {
    return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(URL.createObjectURL(b)) : reject(new Error('No picture'))), 'image/png'));
}

/**
 * A certificate as the PDF draws it, redrawn a moment after typing stops. A value not filled in
 * shows its {placeholder}, to see where it goes.
 */
export default function CertificatePreview({ template, people }: Props) {
    const [index, setIndex] = useState(0);
    const [pages, setPages] = useState<string[]>([]);
    const [drawing, setDrawing] = useState(true);
    const [failed, setFailed] = useState<string | null>(null);
    const shown = people[Math.min(index, people.length - 1)];
    const data = shown?.data;
    const key = JSON.stringify(data ?? {});
    // The pictures on show, let go of once replaced or the page closes
    const shownUrls = useRef<string[]>([]);
    useEffect(() => () => shownUrls.current.forEach(u => URL.revokeObjectURL(u)), []);

    useEffect(() => {
        let live = true;
        setDrawing(true);
        const timer = setTimeout(async () => {
            try {
                const values = Object.fromEntries(Object.entries(JSON.parse(key) as Record<string, string>).map(([k, v]) => [k, v || `{${k}}`]));
                const drawn = await drawDocxPages(await fillTemplate(template, values), PREVIEW_DPI);
                const urls = await Promise.all(drawn.map(p => canvasUrl(p.canvas)));
                if (!live) {
                    urls.forEach(u => URL.revokeObjectURL(u));
                    return;
                }
                shownUrls.current.forEach(u => URL.revokeObjectURL(u));
                shownUrls.current = urls;
                setPages(urls);
                setFailed(null);
            } catch (err) {
                if (live) setFailed(err instanceof Error ? err.message : String(err));
            } finally {
                if (live) setDrawing(false);
            }
        }, REDRAW_AFTER_MS);
        return () => {
            live = false;
            clearTimeout(timer);
        };
    }, [template, key]);

    return (
        <Card
            title="Preview"
            icon={Eye}
            subtitle="As the PDF will look. Empty fields show their {placeholder}."
            divided
            action={drawing ? <Loader2 size={16} className="animate-spin text-muted" aria-label="Drawing the preview" /> : undefined}
        >
            {people.length > 1 && (
                <div className="mb-3">
                    <label htmlFor="cert-preview-person" className="sr-only">Certificate shown</label>
                    <select id="cert-preview-person" value={Math.min(index, people.length - 1)} onChange={e => setIndex(Number(e.target.value))} className={fieldCls}>
                        {people.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
                    </select>
                </div>
            )}
            {failed ? (
                <p className="text-sm text-status-rejected">The preview could not be drawn: {failed}. The Word file is not affected.</p>
            ) : pages.length ? (
                <div className={`space-y-3 transition-opacity ${drawing ? 'opacity-70' : ''}`}>
                    {pages.map((url, i) => (
                        <img key={url} src={url} alt={`Certificate preview${pages.length > 1 ? `, page ${i + 1}` : ''}`} className="w-full h-auto rounded-sm shadow-card bg-white ring-1 ring-black/5" />
                    ))}
                </div>
            ) : (
                <div className="aspect-[1.414] w-full rounded-sm bg-surface-elevated animate-pulse" aria-hidden="true" />
            )}
        </Card>
    );
}
