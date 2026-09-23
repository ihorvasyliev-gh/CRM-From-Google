import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useDebounce } from '../../hooks/useDebounce';

export type ParamPatch = Record<string, string | number | boolean | null | undefined>;

/**
 * Page filters live in the URL so Back/Forward, reloads and shared links keep the exact view.
 * `setParams` applies several keys in one navigation (null / '' / false removes a key).
 */
export function useUrlParams() {
    const [searchParams] = useSearchParams();
    const location = useLocation();
    const navigate = useNavigate();

    // Always patch the *latest* URL, even when several updates fire in the same tick
    const searchRef = useRef(location.search);
    const stateRef = useRef(location.state);
    useLayoutEffect(() => {
        searchRef.current = location.search;
        stateRef.current = location.state;
    }, [location.search, location.state]);

    const setParams = useCallback((patch: ParamPatch, { replace = true }: { replace?: boolean } = {}) => {
        const next = new URLSearchParams(searchRef.current);
        Object.entries(patch).forEach(([key, value]) => {
            if (value === null || value === undefined || value === '' || value === false) next.delete(key);
            else next.set(key, String(value));
        });
        const search = next.toString();
        const nextSearch = search ? `?${search}` : '';
        if (nextSearch === searchRef.current) return;
        searchRef.current = nextSearch;
        navigate({ search: nextSearch }, { replace, state: stateRef.current });
    }, [navigate]);

    const get = useCallback((key: string, fallback = '') => searchParams.get(key) ?? fallback, [searchParams]);

    return { get, setParams, searchParams };
}

/**
 * A text input bound to a URL param: typing is instant locally and the URL follows after a debounce.
 * Back/Forward (an external URL change) flows back into the input.
 */
export function useUrlSearchInput(key: string, extraPatch: ParamPatch = {}, delay = 250) {
    const { get, setParams } = useUrlParams();
    const urlValue = get(key);
    const [value, setValue] = useState(urlValue);
    const debounced = useDebounce(value, delay);
    const extraRef = useRef(extraPatch);
    useLayoutEffect(() => { extraRef.current = extraPatch; });
    const lastPushed = useRef(urlValue);

    // URL → input (history navigation)
    useEffect(() => {
        if (urlValue !== lastPushed.current) {
            lastPushed.current = urlValue;
            setValue(urlValue);
        }
    }, [urlValue]);

    // input → URL (debounced)
    useEffect(() => {
        const trimmed = debounced.trim();
        if (trimmed === lastPushed.current) return;
        lastPushed.current = trimmed;
        setParams({ [key]: trimmed, ...extraRef.current });
    }, [debounced, key, setParams]);

    /** Clears immediately (no debounce) */
    const clear = useCallback(() => {
        setValue('');
        lastPushed.current = '';
        setParams({ [key]: null, ...extraRef.current });
    }, [key, setParams]);

    return { value, setValue, clear, committed: urlValue };
}
