import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export type RouterTabNavigate<T extends string> = (tab: T, customPath?: string) => void;

export interface RouterTabSyncProps<T extends string> {
    activeTab: T;
    isValidTab: (value: string | null) => value is T;
    onTabFromUrl: (tab: T) => void;
    registerNavigate: (fn: RouterTabNavigate<T>) => void;
    /** Query parameter name synced with tab state (defaults to `'tab'`) */
    paramName?: string;
}

/** Syncs `?tab=` search param with state when rendered inside React Router. */
export function RouterTabSync<T extends string>({
    activeTab,
    isValidTab,
    onTabFromUrl,
    registerNavigate,
    paramName = 'tab',
}: RouterTabSyncProps<T>) {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const urlTab = searchParams.get(paramName);

    useEffect(() => {
        if (isValidTab(urlTab) && urlTab !== activeTab) {
            onTabFromUrl(urlTab);
        }
    }, [urlTab, activeTab, isValidTab, onTabFromUrl]);

    useEffect(() => {
        registerNavigate((nextTab, customPath) => {
            if (customPath) {
                navigate(customPath);
                return;
            }
            setSearchParams(
                prev => {
                    const next = new URLSearchParams(prev);
                    next.set(paramName, nextTab);
                    return next;
                },
                { replace: true },
            );
        });
    }, [navigate, paramName, registerNavigate, setSearchParams]);

    return null;
}

export default RouterTabSync;
