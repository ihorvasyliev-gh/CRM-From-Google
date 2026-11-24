import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ClipboardPaste,
    Eye,
    FileCheck2,
    FilePlus2,
    FileText,
    Moon,
    Receipt,
    ShieldCheck,
    SlidersHorizontal,
    Sun,
} from 'lucide-react';
import { Button, IconButton } from './ui/Button';
import { SectionHeader } from './ui/Card';
import FileDropzone from './ui/FileDropzone';
import { TooltipProvider } from './ui/Tooltip';
import { calloutCls, panelCls } from './ui/styles';
import { GlobalToaster } from './Toast';
import DefaultsModal from './ChequeRequisitions/DefaultsModal';
import ChequeReqEditor, { type EditorSession } from './ChequeRequisitions/Editor';
import { ReadingProgressBanner } from './ChequeRequisitions/chequeHelpers';
import { clipboardFiles, isEditableTarget } from './ChequeRequisitions/chequeUtils';
import {
    blankSession,
    closeInvoice,
    invoicePageSizes,
    useOpenInvoice,
    type OpenedInvoice,
} from './ChequeRequisitions/useOpenInvoice';
import { useTheme } from '../hooks/useTheme';
import { draftFromInvoice, PUBLIC_DEFAULTS_KEY, readDefaults, type ChequeReqDefaults } from '../lib/chequeReq/draft';
import { INVOICE_ACCEPT } from '../lib/chequeReq/read';

/**
 * Cheque requisitions without signing in (/cheque), for anyone with the link: the same invoice
 * reading and form as the admin page, but nothing is sent or kept. There is no history and no
 * supplier memory, and nothing on this page reads from or writes to the database (its test
 * fails if anything here loads the Supabase client).
 */
export default function PublicChequeRequisitions() {
    const { darkMode, toggleDarkMode } = useTheme();
    const [queue, setQueue] = useState<EditorSession[] | null>(null);
    const queueRef = useRef<EditorSession[] | null>(null);

    const [defaultsOpen, setDefaultsOpen] = useState(false);
    const [defaults, setDefaults] = useState<ChequeReqDefaults>(() => readDefaults(PUBLIC_DEFAULTS_KEY));

    useEffect(() => {
        document.title = 'Cheque requisition · Cork City Partnership';
    }, []);

    useEffect(() => {
        return () => {
            queueRef.current?.forEach(s => closeInvoice(s.invoice));
            queueRef.current = null;
        };
    }, []);

    const replaceQueue = useCallback((next: EditorSession[] | null) => {
        queueRef.current?.forEach(s => closeInvoice(s.invoice));
        queueRef.current = next;
        setQueue(next);
    }, []);

    const handleInvoicesRead = useCallback(
        (items: OpenedInvoice[]) => {
            if (items.length === 0) return;
            const freshDefaults = readDefaults(PUBLIC_DEFAULTS_KEY);
            setDefaults(freshDefaults);
            const sessions: EditorSession[] = items.map(({ invoice, facts, fileName }) => ({
                key: crypto.randomUUID(),
                invoice,
                facts,
                draft: draftFromInvoice({
                    facts,
                    history: [],
                    defaults: freshDefaults,
                    fileName,
                    phrases: invoice.phrases,
                    pageSizes: invoicePageSizes(invoice),
                }),
            }));
            replaceQueue(sessions);
        },
        [replaceQueue],
    );

    const { reading, progress, open, openFiles, cancel } = useOpenInvoice(handleInvoicesRead);

    // Support Ctrl+V clipboard screenshot/file paste on the landing screen
    useEffect(() => {
        if (queue || defaultsOpen) return;
        const onPaste = (e: ClipboardEvent) => {
            if (isEditableTarget(e.target)) return;
            const files = clipboardFiles(e.clipboardData);
            if (files.length === 0) return;
            e.preventDefault();
            void openFiles(files);
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, [queue, defaultsOpen, openFiles]);

    const startBlank = useCallback(() => {
        const freshDefaults = readDefaults(PUBLIC_DEFAULTS_KEY);
        setDefaults(freshDefaults);
        replaceQueue([blankSession(freshDefaults)]);
    }, [replaceQueue]);

    const close = useCallback(() => {
        replaceQueue(null);
        setDefaults(readDefaults(PUBLIC_DEFAULTS_KEY));
    }, [replaceQueue]);

    return (
        <TooltipProvider delayDuration={100}>
            <div className="min-h-screen min-h-dvh w-full bg-background text-primary flex flex-col">
                <header className="sticky top-0 z-20 bg-background/85 backdrop-blur-md backdrop-saturate-150 border-b border-border-subtle">
                    <div className="max-w-[1600px] mx-auto h-14 px-3 sm:px-6 lg:px-8 flex items-center gap-3 min-w-0">
                        <span className="rounded-lg bg-white px-2 py-1 shadow-xs ring-1 ring-black/5 shrink-0">
                            <img src="/logos-banner-sm.webp" alt="Cork City Partnership · SICAP" width={800} height={154} className="h-8 w-auto" />
                        </span>
                        <span className="hidden sm:block text-sm font-semibold text-primary tracking-tight truncate">
                            Cheque requisition
                        </span>
                        <div className="ml-auto flex items-center gap-1.5">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDefaultsOpen(true)}
                                title="Set your default action number, requester name, approver, and description presets on this device"
                            >
                                <SlidersHorizontal size={14} />
                                <span>Defaults</span>
                            </Button>
                            <IconButton
                                label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
                                onClick={toggleDarkMode}
                            >
                                {darkMode ? <Sun size={17} /> : <Moon size={17} />}
                            </IconButton>
                        </div>
                    </div>
                </header>

                <main className="flex-1 w-full max-w-[1600px] mx-auto px-3 pt-4 pb-16 sm:px-6 sm:pt-6 lg:px-8">
                    {queue ? (
                        <ChequeReqEditor
                            key={queue[0].key}
                            session={queue[0]}
                            initialSessions={queue}
                            history={[]}
                            historyAvailable={false}
                            defaults={defaults}
                            defaultsKey={PUBLIC_DEFAULTS_KEY}
                            backLabel="New requisition"
                            onOpenDefaults={() => setDefaultsOpen(true)}
                            onBack={close}
                        />
                    ) : (
                        <div className="max-w-3xl mx-auto space-y-5">
                            <SectionHeader
                                icon={Receipt}
                                title="SICAP cheque requisition"
                                description="Drop one or more supplier invoices: each cheque requisition is filled in for you to check, edit, and download as Word or PDF."
                                actions={
                                    <Button variant="primary" onClick={startBlank} disabled={!!reading}>
                                        <FilePlus2 size={15} /> Blank requisition
                                    </Button>
                                }
                            />

                            <div className="rounded-2xl bg-surface border border-border-subtle shadow-card p-4 sm:p-5 space-y-4">
                                <FileDropzone
                                    multiple
                                    accept={INVOICE_ACCEPT}
                                    onChange={open}
                                    uploading={!!reading}
                                    uploadingTitle={progress?.label || reading || 'Reading invoice…'}
                                    icon={<FileText size={20} />}
                                    title="Make a requisition: click here to choose the invoice, or drag it onto this box"
                                    hint="PDF or Word (.docx) file, scan, or photo of a paper invoice — drop multiple files to queue them. Everything is read on this device and never uploaded."
                                    className="py-10"
                                />

                                <ReadingProgressBanner reading={reading} progress={progress} onCancel={cancel} />

                                <div className="flex items-center justify-end">
                                    <span className="inline-flex items-center gap-1.5 text-xs text-muted px-2.5 py-1 rounded-lg bg-surface-elevated border border-border-subtle">
                                        <ClipboardPaste size={13} className="text-brand-500" aria-hidden="true" />
                                        Paste screenshot (Ctrl+V)
                                    </span>
                                </div>

                                <div className="grid sm:grid-cols-3 gap-2.5 pt-2 border-t border-border-subtle">
                                    <div className={`${panelCls} p-3 flex items-start gap-2.5`}>
                                        <span className="w-6 h-6 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center text-xs font-bold shrink-0">
                                            1
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold text-primary">Drop 1 or more invoices</p>
                                            <p className="text-[11px] text-muted mt-0.5 leading-relaxed">
                                                PDF, Word, scan, or pasted screenshot — multiple files queue automatically.
                                            </p>
                                        </div>
                                    </div>
                                    <div className={`${panelCls} p-3 flex items-start gap-2.5`}>
                                        <span className="w-6 h-6 rounded-lg bg-info/15 text-status-invited flex items-center justify-center shrink-0">
                                            <Eye size={13} />
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold text-primary">Check highlights &amp; preview</p>
                                            <p className="text-[11px] text-muted mt-0.5 leading-relaxed">
                                                Verify extracted values beside the invoice and click text to fill fields.
                                            </p>
                                        </div>
                                    </div>
                                    <div className={`${panelCls} p-3 flex items-start gap-2.5`}>
                                        <span className="w-6 h-6 rounded-lg bg-success/15 text-status-confirmed flex items-center justify-center shrink-0">
                                            <FileCheck2 size={13} />
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold text-primary">Download Word, PDF, or Print</p>
                                            <p className="text-[11px] text-muted mt-0.5 leading-relaxed">
                                                Generates the filled SICAP form directly inside your browser.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className={`${calloutCls.info} text-sm p-3.5 flex items-start gap-2.5`}>
                                <ShieldCheck size={16} className="shrink-0 mt-0.5 text-status-invited" aria-hidden="true" />
                                <div className="space-y-0.5">
                                    <p className="font-medium text-primary leading-relaxed">Nothing you add here is saved anywhere.</p>
                                    <p className="text-xs text-muted leading-relaxed">
                                        Invoices are read locally in your browser. Optional Defaults only stay in this browser’s local storage.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </main>

                <DefaultsModal
                    open={defaultsOpen}
                    onClose={() => setDefaultsOpen(false)}
                    defaultsKey={PUBLIC_DEFAULTS_KEY}
                    onSaved={next => setDefaults(next)}
                />

                <GlobalToaster />
            </div>
        </TooltipProvider>
    );
}
