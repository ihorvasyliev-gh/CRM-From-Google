import { ArrowLeft, CheckCircle2, Pencil, Wand2 } from 'lucide-react';
import Card from '../ui/Card';
import { Button } from '../ui/Button';
import { templateColumns } from '../../lib/pdfForms/plan';
import type { PdfFormTemplate } from '../../lib/pdfForms/types';

interface SavedScreenProps {
    template: PdfFormTemplate;
    /** Just added, rather than changed */
    first: boolean;
    onFill: () => void;
    onEdit?: () => void;
    onBack: () => void;
}

/** Shown after saving a form: what it needs, and what to do next */
export default function SavedScreen({ template, first, onFill, onEdit, onBack }: SavedScreenProps) {
    const columns = templateColumns(template.fields, template.settings);
    const text = template.fields.filter(f => f.kind === 'text').length;
    const boxes = template.fields.filter(f => f.kind === 'choice').length;
    return (
        <div className="max-w-2xl mx-auto space-y-4 pt-6">
            <Card title={first ? 'The form is ready!' : 'Your changes are saved'} subtitle={template.name} icon={CheckCircle2} tone="success">
                <div className="space-y-5">
                    <p className="text-sm text-primary">
                        {text} text box{text === 1 ? '' : 'es'} and {boxes} checkbox question{boxes === 1 ? '' : 's'} will be filled in for each row of a spreadsheet.
                        {columns.length > 0 && <> The spreadsheet needs these columns: <b>{columns.slice(0, 6).join(', ')}{columns.length > 6 ? ` and ${columns.length - 6} more` : ''}</b>.</>}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                        <Button size="lg" variant="primary" className="h-12" onClick={onFill}>
                            <Wand2 size={17} /> Fill in some forms now
                        </Button>
                        <Button size="lg" className="h-12" onClick={onBack}>
                            <ArrowLeft size={17} /> Back to all forms
                        </Button>
                    </div>
                    {onEdit && (
                        <button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 text-xs text-muted underline hover:text-primary">
                            <Pencil size={12} /> Something still wrong? Keep editing this form
                        </button>
                    )}
                </div>
            </Card>
        </div>
    );
}
