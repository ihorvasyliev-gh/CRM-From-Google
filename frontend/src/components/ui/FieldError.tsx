import { AlertCircle } from 'lucide-react';

/** A field's error message, under the field (useFieldErrors points the field's aria-describedby here) */
export default function FieldError({ id, message }: { id: string; message?: string }) {
    if (!message) return null;
    return (
        <p id={`${id}-error`} className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-status-rejected animate-slideDown">
            <AlertCircle size={13} className="shrink-0" />
            {message}
        </p>
    );
}
