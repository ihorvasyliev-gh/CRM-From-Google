import { useMemo, useRef, useState } from 'react';
import { X, Upload, FileSpreadsheet, AlertCircle, Loader2, ClipboardPaste } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { parseContactsFile, parseDelimitedText, tableToContacts, type ParsedContacts } from '../lib/contactImport';
import { useModalBehavior } from '../hooks/useModalBehavior';

interface OutreachImportModalProps {
    listId: string;
    listName: string;
    /** Lower-cased emails already on the list, to preview what is new */
    existingEmails: Set<string>;
    onClose: () => void;
    onImported: (result: { inserted: number; updated: number }) => void;
}

export default function OutreachImportModal({ listId, listName, existingEmails, onClose, onImported }: OutreachImportModalProps) {
    const [parsed, setParsed] = useState<ParsedContacts | null>(null);
    const [sourceLabel, setSourceLabel] = useState('');
    const [pasteText, setPasteText] = useState('');
    const [error, setError] = useState('');
    const [reading, setReading] = useState(false);
    const [importing, setImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useModalBehavior(true, onClose, { closeOnEscape: !importing });

    const newCount = useMemo(
        () => parsed ? parsed.rows.filter(r => !existingEmails.has(r.email)).length : 0,
        [parsed, existingEmails],
    );

    async function handleFile(file: File | undefined) {
        if (!file) return;
        setError('');
        setParsed(null);
        setReading(true);
        try {
            setParsed(await parseContactsFile(file));
            setSourceLabel(file.name);
        } catch (err: any) {
            setError(err.message || 'Could not read the file.');
        } finally {
            setReading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }

    function handlePastePreview() {
        setError('');
        setParsed(null);
        try {
            setParsed(tableToContacts(parseDelimitedText(pasteText)));
            setSourceLabel('Pasted rows');
        } catch (err: any) {
            setError(err.message || 'Could not read the pasted rows.');
        }
    }

    async function handleImport() {
        if (!parsed || parsed.rows.length === 0) return;
        setImporting(true);
        setError('');
        try {
            const { data, error: rpcError } = await supabase.rpc('import_outreach_contacts', {
                p_list_id: listId,
                p_rows: parsed.rows,
            });
            if (rpcError) throw rpcError;
            onImported({ inserted: data?.inserted ?? 0, updated: data?.updated ?? 0 });
            onClose();
        } catch (err: any) {
            console.error('Import error:', err);
            setError(err.message || 'Import failed.');
        } finally {
            setImporting(false);
        }
    }

    return (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-background/80 backdrop-blur-xs transition-opacity"
                onClick={!importing ? onClose : undefined}
            />

            <div className="bg-surface rounded-2xl shadow-float border border-border-subtle w-full max-w-lg relative z-10 animate-scaleIn overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-border-subtle shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-primary">Import contacts</h2>
                        <p className="text-xs text-muted mt-1">
                            Into <span className="font-semibold text-brand-400">{listName}</span> — people already on the list are not duplicated and keep their status and answers
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={importing}
                        className="text-muted hover:text-primary transition-colors p-2 rounded-xl hover:bg-surface disabled:opacity-50"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 overflow-y-auto custom-scrollbar space-y-4">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.csv,.tsv,.txt"
                        className="hidden"
                        onChange={e => handleFile(e.target.files?.[0])}
                    />
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={reading || importing}
                        className="w-full flex flex-col items-center gap-2 p-6 rounded-xl border-2 border-dashed border-border-strong hover:border-brand-500 hover:bg-brand-500/5 text-muted hover:text-primary transition-all disabled:opacity-50"
                    >
                        {reading ? <Loader2 size={24} className="animate-spin" /> : <Upload size={24} />}
                        <span className="text-sm font-semibold">Choose Excel (.xlsx) or CSV file</span>
                        <span className="text-[11px]">Export from IRIS. Needs an Email column; name, phone and IRIS ID columns are picked up automatically.</span>
                    </button>

                    <div className="space-y-2">
                        <label htmlFor="outreach-paste" className="block text-xs font-semibold text-muted uppercase tracking-wider">
                            …or paste rows from a spreadsheet (with the header row)
                        </label>
                        <textarea
                            id="outreach-paste"
                            value={pasteText}
                            onChange={e => setPasteText(e.target.value)}
                            rows={4}
                            placeholder={'First Name\tLast Name\tEmail\nAnna\tSmith\tanna@example.com'}
                            className="w-full bg-surface text-primary text-xs font-mono rounded-xl border border-border-subtle px-3 py-2 focus:outline-hidden focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 placeholder:text-muted/40"
                        />
                        <button
                            type="button"
                            onClick={handlePastePreview}
                            disabled={!pasteText.trim() || importing}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted hover:text-primary bg-surface-elevated hover:bg-background border border-border-subtle rounded-lg transition-all disabled:opacity-50"
                        >
                            <ClipboardPaste size={12} /> Check pasted rows
                        </button>
                    </div>

                    {parsed && (
                        <div className="p-4 rounded-xl bg-background border border-border-subtle space-y-2 animate-fadeIn">
                            <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                                <FileSpreadsheet size={15} className="text-brand-500" /> {sourceLabel}
                            </p>
                            <ul className="text-xs text-muted space-y-1">
                                <li><strong className="text-emerald-500">{newCount}</strong> new {newCount === 1 ? 'person' : 'people'} will be added</li>
                                <li><strong className="text-primary">{parsed.rows.length - newCount}</strong> already on the list (only name / phone / IRIS ID refreshed)</li>
                                {parsed.duplicatesInFile > 0 && <li><strong className="text-primary">{parsed.duplicatesInFile}</strong> duplicate rows in the file skipped</li>}
                                {parsed.missingEmail > 0 && <li><strong className="text-orange-400">{parsed.missingEmail}</strong> rows without a valid email skipped</li>}
                            </ul>
                        </div>
                    )}

                    {error && (
                        <div role="alert" className="bg-danger/10 border border-danger/25 text-status-rejected text-sm px-4 py-3 rounded-xl flex items-center gap-3 animate-fadeIn">
                            <AlertCircle size={16} className="shrink-0" />
                            <p>{error}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3.5 border-t border-border-subtle bg-surface-elevated/40 flex justify-end gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={importing}
                        className="px-5 py-2.5 rounded-xl text-sm font-semibold text-muted hover:text-primary hover:bg-surface border border-transparent transition-all disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleImport}
                        disabled={importing || !parsed || parsed.rows.length === 0}
                        className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-500 active:bg-brand-700 shadow-xs shadow-brand-500/20 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {importing ? <><Loader2 size={16} className="animate-spin" /> Importing...</> : <><Upload size={16} /> Import</>}
                    </button>
                </div>
            </div>
        </div>
    );
}
