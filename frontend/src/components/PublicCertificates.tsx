import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Award, CalendarClock, ChevronRight, FileDown, FileText, FileType2, Loader2, Moon, RefreshCw, ShieldCheck, Sun, Users } from 'lucide-react';
import Card, { SectionHeader } from './ui/Card';
import { Button, IconButton } from './ui/Button';
import FileDropzone from './ui/FileDropzone';
import { calloutCls, fieldCls, labelCls, panelCls } from './ui/styles';
import { TooltipProvider } from './ui/Tooltip';
import { GlobalToaster } from './Toast';
import PeopleTable from './Certificates/PeopleTable';
import PeopleList from './Certificates/PeopleList';
import CertificatePreview from './Certificates/CertificatePreview';
import DateField from './Certificates/DateField';
import ExpiryField from './Certificates/ExpiryField';
import { useTheme } from '../hooks/useTheme';
import { showToast } from '../lib/toast';
import { downloadBlob } from '../lib/download';
import { describeDocxError, templateTags } from '../lib/documentRender';
import {
    fieldLabel, initialPerPerson, isBlankRow, newRow, personData, personFileBase, templateFields, uniqueNames, type PersonRow,
} from '../lib/certificates/fields';
import { makePdf, makeWord, type Certificate } from '../lib/certificates/output';
import { embeddedFonts } from '../lib/certificates/pages';
import { formatCertMonth, isDateTag, isExpiryTag, isMonthTag, isNumberTag, parseCertDate, validityLabel } from '../lib/certificates/dates';
import { downloadPublicCertificateTemplate, fetchPublicCertificateTemplates, type CertificateTemplate } from '../lib/certificates/library';
import { recentValues, rememberValues } from '../lib/certificates/recent';

interface Template {
    /** The kept template's name, or the chosen file's */
    name: string;
    /** How long the certificate is valid for, as set in Settings */
    validityMonths: number | null;
    bytes: ArrayBuffer;
    tags: string[];
    /** Fonts carried in the file: the PDF uses them on any device */
    fonts: string[];
}

const DOCX_ACCEPT = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** The steps of the page, shown before a template is chosen */
const STEPS = [
    { icon: FileText, title: 'Choose the certificate', text: 'One of the certificates below, or your own Word file (.docx) with {placeholders}.' },
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

/** A text that is typed once for everyone ({tutor}): offered again from last time */
function isRemembered(tag: string): boolean {
    return !isDateTag(tag) && !isMonthTag(tag) && !isNumberTag(tag);
}

/** The certificates kept in Settings, to pick from */
function TemplateLibrary({ templates, loading, opening, onOpen }: {
    templates: CertificateTemplate[];
    loading: boolean;
    opening: string | null;
    onOpen: (t: CertificateTemplate) => void;
}) {
    if (loading) {
        return (
            <div className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Loading the certificates">
                {[0, 1].map(i => <div key={i} className={`${panelCls} h-20 animate-pulse`} />)}
            </div>
        );
    }
    if (!templates.length) return null;
    return (
        <section aria-labelledby="cert-library-title" className="space-y-2.5">
            <h2 id="cert-library-title" className="text-sm font-semibold text-primary">Choose a certificate</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
                {templates.map(t => {
                    const labels = t.tags.map(fieldLabel).filter((l, i, all) => all.indexOf(l) === i);
                    return (
                        <li key={t.id}>
                            <button
                                type="button"
                                onClick={() => onOpen(t)}
                                disabled={!!opening}
                                className="w-full h-full text-left rounded-xl bg-surface border border-border-subtle shadow-card p-4 flex items-start gap-3 hover:border-brand-500/60 hover:bg-brand-500/[0.04] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                            >
                                <span className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0 bg-brand-500/10 text-brand-600 dark:text-brand-400">
                                    {opening === t.id ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Award size={17} aria-hidden="true" />}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-semibold text-primary">{t.name}</span>
                                    {labels.length > 0 && <span className="block text-xs text-muted mt-0.5 leading-relaxed">{labels.join(', ')}</span>}
                                    {t.validity_months && (
                                        <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-secondary">
                                            <CalendarClock size={12} aria-hidden="true" /> Valid {validityLabel(t.validity_months)}
                                        </span>
                                    )}
                                </span>
                                <ChevronRight size={16} className="text-muted shrink-0 self-center" aria-hidden="true" />
                            </button>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

/**
 * Certificates (or any Word document with {placeholders}) without signing in, at /certificates:
 * the person picks a certificate kept in Settings (or brings a Word template), types in the people
 * and what is the same for all, and downloads Word or PDF files. The filling in happens in the
 * browser; nothing typed is sent or kept, besides the tutor remembered in this browser.
 */
export default function PublicCertificates() {
    const { darkMode, toggleDarkMode } = useTheme();
    const [template, setTemplate] = useState<Template | null>(null);
    const [reading, setReading] = useState(false);
    /** The kept template being downloaded */
    const [opening, setOpening] = useState<string | null>(null);
    /** How long the certificate is valid for: the expiry date counts from the course date */
    const [validity, setValidity] = useState<number | null>(null);
    const [perPerson, setPerPerson] = useState<Set<string>>(new Set());
    const [shared, setShared] = useState<Record<string, string>>({});
    const [rows, setRows] = useState<PersonRow[]>([newRow()]);
    const [allInOne, setAllInOne] = useState(true);
    /** The people in a table rather than the plain list of names */
    const [useTable, setUseTable] = useState(false);
    const [making, setMaking] = useState<{ kind: 'word' | 'pdf'; done: number; total: number } | null>(null);
    const library = useQuery({ queryKey: ['certificate_templates', 'public'], queryFn: fetchPublicCertificateTemplates, retry: 1, staleTime: 60_000 });
    const libraryTemplates = library.data?.templates ?? [];

    useEffect(() => {
        document.title = 'Certificates · Cork City Partnership';
    }, []);

    const fields = useMemo(() => templateFields(template?.tags ?? [], perPerson, validity), [template, perPerson, validity]);
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
        const data = people.map((row, i) => personData(row, fields, shared, i));
        const names = uniqueNames(data.map((d, i) => personFileBase(d, fields.columns, i)));
        return data.map((d, i) => ({ data: d, fileBase: names[i] }));
    }, [filledRows, fields, shared]);

    const previewPeople = useMemo(() => {
        const list = certificates.map(c => ({ label: c.fileBase.replace(/_/g, ' '), data: c.data }));
        return list.length ? list : [{ label: '', data: personData(null, fields, shared) }];
    }, [certificates, fields, shared]);

    /** A template is ready: its fields, and the tutor (and the like) typed last time */
    const applyTemplate = async (name: string, bytes: ArrayBuffer, validityMonths: number | null) => {
        const [tags, fonts] = await Promise.all([templateTags(bytes), embeddedFonts(bytes).catch(() => [])]);
        setTemplate({ name, bytes, tags, fonts, validityMonths });
        setValidity(validityMonths);
        // A field kept from the last template keeps its place; a new one starts as the template's
        setPerPerson(prev => new Set([...initialPerPerson(tags), ...tags.filter(t => prev.has(t))]));
        setShared(prev => {
            const next = { ...prev };
            for (const tag of tags.filter(isRemembered)) {
                if (!(next[tag] ?? '').trim() && recentValues(tag)[0]) next[tag] = recentValues(tag)[0];
            }
            return next;
        });
    };

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
            await applyTemplate(file.name, await file.arrayBuffer(), null);
        } catch (err) {
            showToast(`This Word file can't be used as a template: ${describeDocxError(err)}`, 'error');
        } finally {
            setReading(false);
        }
    };

    const openKept = async (kept: CertificateTemplate) => {
        setOpening(kept.id);
        try {
            await applyTemplate(kept.name, await downloadPublicCertificateTemplate(kept), kept.validity_months);
        } catch (err) {
            showToast(`“${kept.name}” could not be opened: ${describeDocxError(err)}. Try again, or use your own Word file.`, 'error');
        } finally {
            setOpening(null);
        }
    };

    // /certificates?template=<id> opens that certificate straight away (the link in Settings)
    const linkedRef = useRef(false);
    useEffect(() => {
        if (linkedRef.current || !library.data) return;
        linkedRef.current = true;
        const id = new URLSearchParams(window.location.search).get('template');
        const kept = id && library.data.templates.find(t => t.id === id);
        if (kept) void openKept(kept);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [library.data]);

    /** A field's value differs from person to person: each row starts with what was typed for all */
    const toEachPerson = (tag: string) => {
        let value = shared[tag] ?? '';
        if (isExpiryTag(tag) && fields.derived.includes(tag)) {
            // Each person starts with the date worked out for everyone
            value = personData(null, fields, shared)[tag] ?? '';
            setValidity(null);
        }
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
            rememberValues(Object.fromEntries(fields.shared.filter(isRemembered).map(t => [t, shared[t] ?? ''])));
        } catch (err) {
            showToast(`The ${kind === 'word' ? 'Word' : 'PDF'} files could not be made: ${describeDocxError(err)}`, 'error');
        } finally {
            setMaking(null);
        }
    };

    const emptyShared = fields.shared.filter(t => !(shared[t] ?? '').trim());
    // The expiry date is shown with the shared fields while it is the same for everyone, worked out or not
    const expiryTag = template?.tags.find(t => isExpiryTag(t) && !perPerson.has(t));
    const sharedShown = (template?.tags ?? []).filter(t => fields.shared.includes(t) || t === expiryTag);
    const courseShared = fields.courseDate && !perPerson.has(fields.courseDate) ? shared[fields.courseDate] ?? '' : null;
    const courseISO = courseShared === null ? null : parseCertDate(courseShared);
    const monthTag = fields.derived.find(isMonthTag);
    const noPeople = fields.columns.length > 0 && filledRows.length === 0;
    const several = certificates.length > 1;
    // A column switched to each person can go back; the name columns always stay
    const movable = new Set(fields.columns.filter(c => !initialPerPerson([c]).size));
    // Only names to type: a plain box of names, one per line; anything more needs the table
    const asList = !useTable && movable.size === 0;
    const sharedStep = sharedShown.length > 0 ? 2 : 0;
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
                            <TemplateLibrary templates={libraryTemplates} loading={library.isLoading} opening={opening} onOpen={openKept} />
                            {libraryTemplates.length > 0 && <h2 className="text-sm font-semibold text-primary pt-1">Or use your own Word file</h2>}
                            <FileDropzone
                                accept={DOCX_ACCEPT}
                                onChange={openTemplate}
                                uploading={reading}
                                uploadingTitle="Reading the template…"
                                icon={<FileText size={18} />}
                                title="Click here to choose your Word certificate, or drag it onto this box"
                                hint="A .docx file. It stays on this device: nothing is uploaded."
                                className={libraryTemplates.length ? 'py-6' : 'py-10'}
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
                                        <Button size="sm" onClick={() => setTemplate(null)}>
                                            <RefreshCw size={14} /> Another certificate
                                        </Button>
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

                                {sharedShown.length > 0 && (
                                    <Card title={`${sharedStep}. The same on every certificate`} subtitle="Type these once" icon={Award} divided>
                                        <div className="grid gap-x-3 gap-y-4 sm:grid-cols-2">
                                            {sharedShown.map(tag => {
                                                const id = `cert-shared-${tag}`;
                                                const label = isNumberTag(tag) && fields.numbered.includes(tag) ? `${fieldLabel(tag)} (first)` : fieldLabel(tag);
                                                const set = (v: string) => setShared(prev => ({ ...prev, [tag]: v }));
                                                const recent = isRemembered(tag) ? recentValues(tag) : [];
                                                return (
                                                    <div key={tag} className={`min-w-0 ${isExpiryTag(tag) ? 'sm:col-span-2' : ''}`}>
                                                        <div className="flex items-end justify-between gap-2">
                                                            <label htmlFor={id} className={labelCls}>{label}</label>
                                                            <button
                                                                type="button"
                                                                onClick={() => toEachPerson(tag)}
                                                                className="mb-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline cursor-pointer"
                                                            >
                                                                <Users size={12} aria-hidden="true" /> Different for each person
                                                            </button>
                                                        </div>
                                                        {isExpiryTag(tag) ? (
                                                            <ExpiryField
                                                                id={id}
                                                                label={fieldLabel(tag)}
                                                                value={shared[tag] ?? ''}
                                                                onChange={set}
                                                                validityMonths={fields.courseDate ? validity : null}
                                                                onValidityChange={setValidity}
                                                                courseDate={courseShared}
                                                                canCount={!!fields.courseDate}
                                                                templateMonths={template.validityMonths}
                                                            />
                                                        ) : isMonthTag(tag) || isDateTag(tag) ? (
                                                            <DateField id={id} label={fieldLabel(tag)} value={shared[tag] ?? ''} onChange={set} mode={isMonthTag(tag) ? 'month' : 'date'} />
                                                        ) : (
                                                            <>
                                                                <input
                                                                    id={id}
                                                                    value={shared[tag] ?? ''}
                                                                    onChange={e => set(e.target.value)}
                                                                    placeholder={isNumberTag(tag) ? 'e.g. ASC-2026-001' : ''}
                                                                    className={fieldCls}
                                                                    autoComplete="off"
                                                                    list={recent.length ? `${id}-recent` : undefined}
                                                                />
                                                                {recent.length > 0 && (
                                                                    <datalist id={`${id}-recent`}>
                                                                        {recent.map(v => <option key={v} value={v} />)}
                                                                    </datalist>
                                                                )}
                                                            </>
                                                        )}
                                                        {tag === fields.courseDate && monthTag && courseISO && (
                                                            <p className="mt-1.5 text-xs text-muted">{fieldLabel(monthTag)} on the certificate: {formatCertMonth(courseISO)}</p>
                                                        )}
                                                        {fields.numbered.includes(tag) && (
                                                            <p className="mt-1.5 text-xs text-muted">
                                                                {(shared[tag] ?? '').trim() && several
                                                                    ? `Counts up for each person: ${certificates.slice(0, 3).map(c => c.data[tag]).join(', ')}${certificates.length > 3 ? '…' : ''}`
                                                                    : 'The first person’s number; the next people’s count up from it.'}
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            })}
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
