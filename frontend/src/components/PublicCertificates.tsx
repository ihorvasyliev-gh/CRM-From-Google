import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { AlertTriangle, Award, FileDown, FileText, FileType2, Moon, RefreshCw, ShieldCheck, Sun, Users } from 'lucide-react';
import Card, { SectionHeader } from './ui/Card';
import { Button, IconButton } from './ui/Button';
import FileDropzone from './ui/FileDropzone';
import { calloutCls, fieldCls, labelCls, panelCls } from './ui/styles';
import { TooltipProvider } from './ui/Tooltip';
import { GlobalToaster } from './Toast';
import PeopleTable from './Certificates/PeopleTable';
import PeopleList from './Certificates/PeopleList';
import CertificatePreview from './Certificates/CertificatePreview';
import { useTheme } from '../hooks/useTheme';
import { showToast } from '../lib/toast';
import { downloadBlob } from '../lib/download';
import { describeDocxError, templateTags } from '../lib/documentRender';
import {
    fieldLabel, initialPerPerson, isBlankRow, newRow, personData, personFileBase, templateFields, uniqueNames, type PersonRow,
} from '../lib/certificates/fields';
import { makePdf, makeWord, type Certificate } from '../lib/certificates/output';
import { embeddedFonts } from '../lib/certificates/pages';

interface Template {
    name: string;
    bytes: ArrayBuffer;
    tags: string[];
    /** Fonts carried in the file: the PDF uses them on any device */
    fonts: string[];
}

const DOCX_ACCEPT = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** The steps of the page, shown before a template is chosen */
const STEPS = [
    { icon: FileText, title: 'Choose your certificate', text: 'A Word file (.docx) with {placeholders} where the names and dates go.' },
    { icon: Users, title: 'Paste the names', text: 'One per line, copied from Excel, an email or anywhere. Type the date and tutor once.' },
    { icon: FileDown, title: 'Download', text: 'Word or PDF: all in one file to print, or a file for each person.' },
];

/** The fonts in the PDF, in short, and how to make them the template's own */
function FontsHelp({ fonts }: { fonts: string[] }) {
    return (
        <details className="text-xs text-muted group">
            <summary className="cursor-pointer select-none hover:text-primary">
                {fonts.length ? `The PDF uses the fonts kept in the template (${fonts.join(', ')}).` : 'Do the fonts look different in the PDF?'}
            </summary>
            <p className="mt-1.5 leading-relaxed">
                The Word file is always exactly your template. The PDF is drawn on this device, so it uses the fonts kept in the template
                and, for any other font, the ones this device has. To keep the fonts in the template: in Word choose File → Options → Save,
                tick “Embed fonts in the file”, untick “Embed only the characters used”, and save it again.
            </p>
        </details>
    );
}

/** How to write a template, for when the person needs one */
function TemplateHelp() {
    return (
        <details className={`${panelCls} p-4 text-sm group`}>
            <summary className="font-semibold text-primary cursor-pointer select-none">How do I make a template?</summary>
            <div className="mt-2 space-y-2 text-secondary leading-relaxed">
                <p>
                    Open your certificate in Word. Where a name or a date goes, type a short word in curly brackets instead, for example{' '}
                    <code className="font-mono text-primary">{'{firstName} {lastName}'}</code>,{' '}
                    <code className="font-mono text-primary">{'{courseDate}'}</code> or{' '}
                    <code className="font-mono text-primary">{'{tutor}'}</code>, and save it. Each one becomes a box on this page.
                </p>
                <p>
                    A Publisher file has to be made in Word first (or saved from Publisher as a Word file and checked).
                    For the PDF to keep the template's fonts on a phone too: File → Options → Save → “Embed fonts in the file”,
                    with “Embed only the characters used” unticked.
                </p>
            </div>
        </details>
    );
}

/**
 * Certificates (or any Word document with {placeholders}) without signing in, at /certificates:
 * the person brings the template, types in the people and what is the same for all, and
 * downloads Word or PDF files. Everything happens in the browser; nothing is sent or kept.
 */
export default function PublicCertificates() {
    const { darkMode, toggleDarkMode } = useTheme();
    const [template, setTemplate] = useState<Template | null>(null);
    const [reading, setReading] = useState(false);
    const [perPerson, setPerPerson] = useState<Set<string>>(new Set());
    const [shared, setShared] = useState<Record<string, string>>({});
    const [rows, setRows] = useState<PersonRow[]>([newRow()]);
    const [allInOne, setAllInOne] = useState(true);
    /** The people in a table rather than the plain list of names */
    const [useTable, setUseTable] = useState(false);
    const [making, setMaking] = useState<{ kind: 'word' | 'pdf'; done: number; total: number } | null>(null);
    const changeRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        document.title = 'Certificates · Cork City Partnership';
    }, []);

    const fields = useMemo(() => templateFields(template?.tags ?? [], perPerson), [template, perPerson]);
    const filledRows = useMemo(() => rows.filter(r => !isBlankRow(r, fields.columns)), [rows, fields.columns]);
    const typed = filledRows.length > 0 || Object.values(shared).some(v => v.trim());

    // Typed-in people are lost on leaving: the browser asks first
    useEffect(() => {
        if (!typed) return;
        const warn = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [typed]);

    /** The certificates to make: one per person, or one when the template names nobody */
    const certificates: Certificate[] = useMemo(() => {
        const people = fields.columns.length ? filledRows : [null];
        const data = people.map(row => personData(row, fields, shared));
        const names = uniqueNames(data.map((d, i) => personFileBase(d, fields.columns, i)));
        return data.map((d, i) => ({ data: d, fileBase: names[i] }));
    }, [filledRows, fields, shared]);

    const previewPeople = useMemo(() => {
        const list = certificates.map(c => ({ label: c.fileBase.replace(/_/g, ' '), data: c.data }));
        return list.length ? list : [{ label: '', data: personData(null, fields, shared) }];
    }, [certificates, fields, shared]);

    const openTemplate = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!/\.docx$/i.test(file.name)) {
            showToast('Choose a Word file (.docx). An old .doc or a Publisher file can be saved as .docx from Word.', 'error');
            return;
        }
        setReading(true);
        try {
            const bytes = await file.arrayBuffer();
            const [tags, fonts] = await Promise.all([templateTags(bytes), embeddedFonts(bytes).catch(() => [])]);
            setTemplate({ name: file.name, bytes, tags, fonts });
            // A field kept from the last template keeps its place; a new one starts as the template's
            setPerPerson(prev => new Set([...initialPerPerson(tags), ...tags.filter(t => prev.has(t))]));
        } catch (err) {
            showToast(`This Word file can't be used as a template: ${describeDocxError(err)}`, 'error');
        } finally {
            setReading(false);
        }
    };

    /** A field's value differs from person to person: each row starts with what was typed for all */
    const toEachPerson = (tag: string) => {
        const value = shared[tag] ?? '';
        setPerPerson(prev => new Set([...prev, tag]));
        setRows(prev => prev.map(r => ({ ...r, values: { ...r.values, [tag]: r.values[tag] || value } })));
    };

    /** Back to one value for everyone: the first person's */
    const toEveryone = (tag: string) => {
        const first = rows.find(r => (r.values[tag] ?? '').trim())?.values[tag] ?? '';
        setShared(prev => ({ ...prev, [tag]: prev[tag] || first }));
        setPerPerson(prev => new Set([...prev].filter(t => t !== tag)));
    };

    const make = async (kind: 'word' | 'pdf') => {
        if (!template || !certificates.length) return;
        setMaking({ kind, done: 0, total: certificates.length });
        try {
            const progress = (done: number, total: number) => setMaking({ kind, done, total });
            const file = kind === 'word'
                ? await makeWord(template.bytes, template.name, certificates, allInOne, progress)
                : await makePdf(template.bytes, template.name, certificates, allInOne, progress);
            downloadBlob(file.blob, file.fileName);
        } catch (err) {
            showToast(`The ${kind === 'word' ? 'Word' : 'PDF'} files could not be made: ${describeDocxError(err)}`, 'error');
        } finally {
            setMaking(null);
        }
    };

    const emptyShared = fields.shared.filter(t => !(shared[t] ?? '').trim());
    const noPeople = fields.columns.length > 0 && filledRows.length === 0;
    const several = certificates.length > 1;
    // A column switched to each person can go back; the name columns always stay
    const movable = new Set(fields.columns.filter(c => !initialPerPerson([c]).size));
    // Only names to type: a plain box of names, one per line; anything more needs the table
    const asList = !useTable && movable.size === 0;
    const sharedStep = fields.shared.length > 0 ? 2 : 0;
    const peopleStep = (sharedStep || 1) + 1;
    const downloadStep = peopleStep + (fields.columns.length ? 1 : 0);

    return (
        <TooltipProvider delayDuration={100}>
            <div className="min-h-screen min-h-dvh w-full bg-background text-primary flex flex-col">
                <header className="sticky top-0 z-20 bg-background/85 backdrop-blur-md backdrop-saturate-150 border-b border-border-subtle">
                    <div className="max-w-7xl mx-auto h-14 px-3 sm:px-6 lg:px-8 flex items-center gap-3 min-w-0">
                        <span className="rounded-lg bg-white px-2 py-1 shadow-xs ring-1 ring-black/5 shrink-0">
                            <img src="/logos-banner-sm.webp" alt="Cork City Partnership · SICAP" width={800} height={154} className="h-8 w-auto" />
                        </span>
                        <span className="hidden sm:block text-sm font-semibold text-primary tracking-tight truncate">Certificates</span>
                        <IconButton className="ml-auto" label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleDarkMode}>
                            {darkMode ? <Sun size={17} /> : <Moon size={17} />}
                        </IconButton>
                    </div>
                </header>

                <main className="flex-1 w-full max-w-7xl mx-auto px-3 pt-4 pb-16 sm:px-6 sm:pt-6 lg:px-8">
                    {!template ? (
                        <div className="max-w-3xl mx-auto space-y-5">
                            <SectionHeader
                                icon={Award}
                                title="Make certificates"
                                description="Fill in a certificate for everyone on a course at once, and download them as Word or PDF."
                            />
                            <ol className="grid gap-3 sm:grid-cols-3">
                                {STEPS.map(({ icon: Icon, title, text }, i) => (
                                    <li key={title} className={`${panelCls} p-4 flex gap-3`}>
                                        <span className="flex items-center justify-center w-8 h-8 rounded-xl shrink-0 bg-brand-500/10 text-brand-600 dark:text-brand-400 text-sm font-bold">{i + 1}</span>
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-primary flex items-center gap-1.5"><Icon size={14} aria-hidden="true" /> {title}</p>
                                            <p className="text-xs text-muted mt-1 leading-relaxed">{text}</p>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                            <FileDropzone
                                accept={DOCX_ACCEPT}
                                onChange={openTemplate}
                                uploading={reading}
                                uploadingTitle="Reading the template…"
                                icon={<FileText size={18} />}
                                title="Click here to choose your Word certificate, or drag it onto this box"
                                hint="A .docx file. It stays on this device: nothing is uploaded."
                                className="py-10"
                            />
                            <TemplateHelp />
                            <div className={`${calloutCls.info} text-sm p-3 flex items-start gap-2.5`}>
                                <ShieldCheck size={16} className="shrink-0 mt-0.5 text-status-invited" aria-hidden="true" />
                                <p className="leading-relaxed">Nothing you add here is saved anywhere.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
                            <div className="space-y-5 min-w-0">
                                <Card
                                    title={`1. Certificate: ${template.name}`}
                                    icon={FileText}
                                    subtitle={template.tags.length ? `Fills in: ${template.tags.map(fieldLabel).filter((l, i, all) => all.indexOf(l) === i).join(', ')}` : 'Nothing to fill in'}
                                    action={
                                        <>
                                            <input ref={changeRef} type="file" accept={DOCX_ACCEPT} onChange={openTemplate} className="hidden" aria-label="Choose another template" />
                                            <Button size="sm" onClick={() => changeRef.current?.click()} loading={reading}>
                                                {!reading && <RefreshCw size={14} />} Another file
                                            </Button>
                                        </>
                                    }
                                >
                                    {!template.tags.length && (
                                        <div className={`${calloutCls.warning} text-sm p-3 flex items-start gap-2.5`}>
                                            <AlertTriangle size={16} className="shrink-0 mt-0.5 text-status-requested" aria-hidden="true" />
                                            <p className="leading-relaxed">
                                                This file has nothing to fill in. Write the parts that change in curly brackets, like{' '}
                                                <code className="font-mono">{'{firstName}'}</code>, and choose it again.
                                            </p>
                                        </div>
                                    )}
                                </Card>

                                {fields.shared.length > 0 && (
                                    <Card title={`${sharedStep}. The same on every certificate`} subtitle="Type these once" icon={Award} divided>
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            {fields.shared.map(tag => (
                                                <div key={tag} className="min-w-0">
                                                    <div className="flex items-end justify-between gap-2">
                                                        <label htmlFor={`cert-shared-${tag}`} className={labelCls}>{fieldLabel(tag)}</label>
                                                        <button
                                                            type="button"
                                                            onClick={() => toEachPerson(tag)}
                                                            className="mb-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline cursor-pointer"
                                                        >
                                                            <Users size={12} aria-hidden="true" /> Different for each person
                                                        </button>
                                                    </div>
                                                    <input
                                                        id={`cert-shared-${tag}`}
                                                        value={shared[tag] ?? ''}
                                                        onChange={e => setShared(prev => ({ ...prev, [tag]: e.target.value }))}
                                                        placeholder={/date|expir/i.test(tag) ? 'e.g. 21/09/2026' : ''}
                                                        className={fieldCls}
                                                        autoComplete="off"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </Card>
                                )}

                                {fields.columns.length > 0 && (asList ? (
                                    <PeopleList step={peopleStep} columns={fields.columns} rows={rows} onRowsChange={setRows} onTable={() => setUseTable(true)} />
                                ) : (
                                    <PeopleTable
                                        step={peopleStep}
                                        columns={fields.columns}
                                        rows={rows}
                                        onRowsChange={setRows}
                                        movable={movable}
                                        onShare={toEveryone}
                                        onList={movable.size === 0 ? () => setUseTable(false) : undefined}
                                    />
                                ))}
                            </div>

                            <div className="space-y-5 min-w-0 lg:sticky lg:top-20">
                                <CertificatePreview template={template.bytes} people={previewPeople} />

                                <Card title={`${downloadStep}. Download`} icon={FileDown} divided>
                                    <div className="space-y-3">
                                        {several && (
                                            <label className="flex items-center gap-2.5 text-sm text-primary cursor-pointer select-none">
                                                <input type="checkbox" checked={allInOne} onChange={e => setAllInOne(e.target.checked)} className="w-4 h-4 rounded accent-brand-500 shrink-0" />
                                                All in one file
                                                <span className="text-xs text-muted">{allInOne ? '(a page for each person, easy to print)' : '(a file for each person, in a ZIP)'}</span>
                                            </label>
                                        )}
                                        <div className="flex flex-wrap gap-2">
                                            <Button variant="primary" onClick={() => make('word')} disabled={noPeople || !!making} loading={making?.kind === 'word'}>
                                                {making?.kind !== 'word' && <FileText size={15} />} Download Word
                                            </Button>
                                            <Button variant="primary" onClick={() => make('pdf')} disabled={noPeople || !!making} loading={making?.kind === 'pdf'}>
                                                {making?.kind !== 'pdf' && <FileType2 size={15} />} Download PDF
                                            </Button>
                                        </div>
                                        <p className="text-xs text-muted" role="status" aria-live="polite">
                                            {making
                                                ? `Making ${making.kind === 'word' ? 'Word' : 'PDF'} certificate ${Math.min(making.done + 1, making.total)} of ${making.total}…`
                                                : noPeople
                                                    ? `Add the names in step ${peopleStep} first.`
                                                    : `${certificates.length} certificate${several ? 's' : ''}.`}
                                        </p>
                                        {!making && !noPeople && emptyShared.length > 0 && (
                                            <p className="text-xs text-status-requested">Not filled in, so left blank: {emptyShared.map(fieldLabel).join(', ')}.</p>
                                        )}
                                        <FontsHelp fonts={template.fonts} />
                                    </div>
                                </Card>

                                <div className={`${calloutCls.info} text-sm p-3 flex items-start gap-2.5`}>
                                    <ShieldCheck size={16} className="shrink-0 mt-0.5 text-status-invited" aria-hidden="true" />
                                    <p className="leading-relaxed">Nothing you add here is saved anywhere.</p>
                                </div>
                            </div>
                        </div>
                    )}
                </main>

                <GlobalToaster />
            </div>
        </TooltipProvider>
    );
}
