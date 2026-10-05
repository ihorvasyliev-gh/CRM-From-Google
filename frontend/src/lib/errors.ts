/** Readable message of anything thrown: an Error, a Supabase error object ({ message }) or a string. */
export function errorMessage(err: unknown, fallback = 'Unknown error'): string {
    if (err instanceof Error) return err.message || fallback;
    if (typeof err === 'string') return err || fallback;
    const message = (err as { message?: unknown } | null)?.message;
    return typeof message === 'string' && message ? message : fallback;
}
