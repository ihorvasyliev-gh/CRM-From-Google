import { useEffect, useState } from 'react';
import { FilePlus2, FileText, Moon, Receipt, ShieldCheck, Sun } from 'lucide-react';
import { SectionHeader } from './ui/Card';
import { Button, IconButton } from './ui/Button';
import FileDropzone from './ui/FileDropzone';
import { calloutCls } from './ui/styles';
import { TooltipProvider } from './ui/Tooltip';
import { GlobalToaster } from './Toast';
import ChequeReqEditor, { type EditorSession } from './ChequeRequisitions/Editor';
import { blankSession, closeInvoice, useOpenInvoice } from './ChequeRequisitions/useOpenInvoice';
import { useTheme } from '../hooks/useTheme';
import { draftFromInvoice, PUBLIC_DEFAULTS_KEY, readDefaults } from '../lib/chequeReq/draft';
import { INVOICE_ACCEPT } from '../lib/chequeReq/read';

/**
 * Cheque requisitions without signing in (/cheque), for anyone with the link: the same invoice
 * reading and form as the admin page, but nothing is sent or kept. There is no history and no
 * supplier memory, and nothing on this page reads from or writes to the database (its test
 * fails if anything here loads the Supabase client).
 */
export default function PublicChequeRequisitions() {
    const { darkMode, toggleDarkMode } = useTheme();
    const [session, setSession] = useState<EditorSession | null>(null);

    useEffect(() => {
        document.title = 'Cheque requisition · Cork City Partnership';
    }, []);

    const { reading, open } = useOpenInvoice((invoice, facts, fileName) => {
        const draft = draftFromInvoice({ facts, history: [], defaults: readDefaults(PUBLIC_DEFAULTS_KEY), fileName });
        setSession({ key: crypto.randomUUID(), invoice, facts, draft });
    });

    const close = () => {
        closeInvoice(session?.invoice ?? null);
        setSession(null);
    };

    return (
        <TooltipProvider delayDuration={100}>
            <div className="min-h-screen min-h-dvh w-full bg-background text-primary flex flex-col">
                <header className="sticky top-0 z-20 bg-background/85 backdrop-blur-md backdrop-saturate-150 border-b border-border-subtle">
                    <div className="max-w-7xl mx-auto h-14 px-3 sm:px-6 lg:px-8 flex items-center gap-3 min-w-0">
                        <span className="rounded-lg bg-white px-2 py-1 shadow-xs ring-1 ring-black/5 shrink-0">
                            <img src="/logos-banner-sm.webp" alt="Cork City Partnership · SICAP" width={800} height={154} className="h-8 w-auto" />
                        </span>
                        <span className="hidden sm:block text-sm font-semibold text-primary tracking-tight truncate">Cheque requisition</span>
                        <IconButton className="ml-auto" label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleDarkMode}>
                            {darkMode ? <Sun size={17} /> : <Moon size={17} />}
                        </IconButton>
                    </div>
                </header>

                <main className="flex-1 w-full max-w-7xl mx-auto px-3 pt-4 pb-16 sm:px-6 sm:pt-6 lg:px-8">
                    {session ? (
                        <ChequeReqEditor
                            key={session.key}
                            session={session}
                            history={[]}
                            historyAvailable={false}
                            defaultsKey={PUBLIC_DEFAULTS_KEY}
                            backLabel="New requisition"
                            onBack={close}
                        />
                    ) : (
                        <div className="max-w-3xl mx-auto space-y-5">
                            <SectionHeader
                                icon={Receipt}
                                title="SICAP cheque requisition"
                                description="Drop a supplier invoice: the cheque requisition is filled in from it for you to check, edit and download as a Word file."
                                actions={
                                    <Button onClick={() => setSession(blankSession(readDefaults(PUBLIC_DEFAULTS_KEY)))}>
                                        <FilePlus2 size={15} /> Blank requisition
                                    </Button>
                                }
                            />

                            <FileDropzone
                                accept={INVOICE_ACCEPT}
                                onChange={open}
                                uploading={!!reading}
                                uploadingTitle={reading}
                                icon={<FileText size={18} />}
                                title="Make a requisition: click here to choose the invoice, or drag it onto this box"
                                hint="PDF or Word file, a scan or a photo of a paper invoice. The invoice is read on this device and never uploaded."
                                className="py-10"
                            />

                            <div className={`${calloutCls.info} text-sm p-3 flex items-start gap-2.5`}>
                                <ShieldCheck size={16} className="shrink-0 mt-0.5 text-status-invited" aria-hidden="true" />
                                <p className="leading-relaxed">
                                    Nothing is saved: when you leave or reload this page the requisition is gone, so keep the file you download.
                                    Payments to a supplier over the year are not added up here: from €5,000 a year (excl. VAT) to one supplier, three quotations are needed.
                                </p>
                            </div>
                        </div>
                    )}
                </main>

                <GlobalToaster />
            </div>
        </TooltipProvider>
    );
}
