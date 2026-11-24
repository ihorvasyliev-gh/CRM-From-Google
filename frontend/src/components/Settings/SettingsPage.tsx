import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Award, Database, Mail, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import {
    EMAIL_CONFIG_KEYS,
    getConfig,
    onConfigUpdated,
    resetEmailConfig,
    saveConfig,
    type AppConfig,
} from '../../lib/appConfig';
import { normalizeEmailStyle } from '../../lib/emailFormat';
import { listEmailOptOutsSafe, type EmailOptOut } from '../../lib/emailOptOut';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { useCertificateTemplates } from '../../hooks/useCertificateTemplates';
import { UnderlineTabs, type UnderlineTab } from '../ui/Tabs';
import type { AppUser } from '../UserRolesSection';
import CertificatesTab from './CertificatesTab';
import DataHygieneTab from './DataHygieneTab';
import EmailsTab from './EmailsTab';
import GeneralTab from './GeneralTab';
import UsersRolesTab from './UsersRolesTab';
import {
    isDataHygieneSubTab,
    isSettingsTabKey,
    validateEmailConfig,
    type DataHygieneSubTab,
    type Density,
    type SaveStatus,
    type SettingsTabKey,
} from './types';

export interface SettingsPageProps {
    darkMode: boolean;
    onDarkModeChange: (dark: boolean) => void;
    density: Density;
    onDensityChange: (density: Density) => void;
}

function pickEmailConfig(cfg: AppConfig): Partial<AppConfig> {
    const patch: Partial<AppConfig> = {};
    for (const key of EMAIL_CONFIG_KEYS) {
        if (key === 'emailStyle') {
            patch.emailStyle = normalizeEmailStyle(cfg.emailStyle);
        } else {
            (patch as Record<string, unknown>)[key] = cfg[key];
        }
    }
    return patch;
}

function areEmailConfigsEqual(a: AppConfig, b: AppConfig): boolean {
    for (const key of EMAIL_CONFIG_KEYS) {
        if (key === 'emailStyle') {
            const sa = normalizeEmailStyle(a.emailStyle);
            const sb = normalizeEmailStyle(b.emailStyle);
            if (
                sa.fontFamily !== sb.fontFamily ||
                sa.fontSize !== sb.fontSize ||
                sa.textColor !== sb.textColor ||
                sa.lineHeight !== sb.lineHeight
            ) {
                return false;
            }
        } else if (a[key] !== b[key]) {
            return false;
        }
    }
    return true;
}

async function fetchAppUsers(): Promise<AppUser[]> {
    const { data, error } = await supabase.rpc('list_app_users');
    if (error) throw error;
    return (data || []) as AppUser[];
}

export default function SettingsPage({
    darkMode,
    onDarkModeChange,
    density,
    onDensityChange,
}: SettingsPageProps) {
    const [searchParams, setSearchParams] = useSearchParams();

    const tabParam = searchParams.get('tab');
    const subParam = searchParams.get('sub');
    // Settings stays mounted in <Activity>: keep the last chosen tab in state so switching
    // to another sidebar route (which clears ?tab= from the URL) and coming back to /settings
    // restores the sub-tab instead of resetting to General.
    const [storedTab, setStoredTab] = useState<SettingsTabKey>(() => (isSettingsTabKey(tabParam) ? tabParam : 'general'));
    const [storedDataSubTab, setStoredDataSubTab] = useState<DataHygieneSubTab>(() => (isDataHygieneSubTab(subParam) ? subParam : 'duplicates'));
    const activeTab: SettingsTabKey = isSettingsTabKey(tabParam) ? tabParam : storedTab;
    const activeDataSubTab: DataHygieneSubTab = isDataHygieneSubTab(subParam) ? subParam : storedDataSubTab;

    useEffect(() => {
        if (isSettingsTabKey(tabParam)) setStoredTab(tabParam);
    }, [tabParam]);
    useEffect(() => {
        if (isDataHygieneSubTab(subParam)) setStoredDataSubTab(subParam);
    }, [subParam]);

    const handleTabChange = useCallback(
        (nextTab: SettingsTabKey) => {
            setStoredTab(nextTab);
            setSearchParams(
                prev => {
                    const next = new URLSearchParams(prev);
                    next.set('tab', nextTab);
                    if (nextTab !== 'data') {
                        next.delete('sub');
                    }
                    return next;
                },
                { replace: true },
            );
        },
        [setSearchParams],
    );

    const handleDataSubTabChange = useCallback(
        (nextSub: DataHygieneSubTab) => {
            setStoredTab('data');
            setStoredDataSubTab(nextSub);
            setSearchParams(
                prev => {
                    const next = new URLSearchParams(prev);
                    next.set('tab', 'data');
                    next.set('sub', nextSub);
                    return next;
                },
                { replace: true },
            );
        },
        [setSearchParams],
    );

    // ─── Email draft & server sync state (preserved across tab switches) ───
    const [config, setConfigState] = useState<AppConfig>(getConfig);
    const [savedConfig, setSavedConfig] = useState<AppConfig>(getConfig);
    const [touched, setTouched] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [saveError, setSaveError] = useState<string | null>(null);
    const savedResetTimerRef = useRef<number | null>(null);

    const clearSavedTimer = useCallback(() => {
        if (savedResetTimerRef.current !== null) {
            window.clearTimeout(savedResetTimerRef.current);
            savedResetTimerRef.current = null;
        }
    }, []);

    useEffect(() => clearSavedTimer, [clearSavedTimer]);

    const emailValidation = useMemo(() => validateEmailConfig(config), [config]);
    const hasChanges = useMemo(
        () => touched && !areEmailConfigsEqual(config, savedConfig),
        [touched, config, savedConfig],
    );
    const canSave = (hasChanges || saveStatus === 'error') && emailValidation.allValid && !saving;

    // Hydrate from server config when AuthContext finishes loading (without clobbering unsaved drafts)
    useEffect(() => {
        return onConfigUpdated(nextConfig => {
            if (!hasChanges) {
                clearSavedTimer();
                setConfigState(nextConfig);
                setSavedConfig(nextConfig);
                setTouched(false);
                setSaveStatus('idle');
                setSaveError(null);
            }
        });
    }, [hasChanges, clearSavedTimer]);

    const handleChangeConfig = useCallback(
        (updater: (prev: AppConfig) => AppConfig) => {
            clearSavedTimer();
            setTouched(true);
            setSaveStatus('idle');
            setSaveError(null);
            setConfigState(updater);
        },
        [clearSavedTimer],
    );

    const handleSave = useCallback(async () => {
        if (saving) return;
        if (!validateEmailConfig(config).allValid) return;

        clearSavedTimer();
        setSaving(true);
        setSaveError(null);
        try {
            const res = await saveConfig(pickEmailConfig(config));
            if (res.synced) {
                setConfigState(res.config);
                setSavedConfig(res.config);
                setTouched(false);
                setSaveStatus('saved');
                toast.success('Email settings saved');
                savedResetTimerRef.current = window.setTimeout(() => {
                    setSaveStatus('idle');
                    savedResetTimerRef.current = null;
                }, 3000);
            } else {
                const message = res.error || 'Could not sync email settings to the server';
                setSaveStatus('error');
                setSaveError(message);
                toast.error(`Saved locally, but sync failed: ${message}`);
            }
        } finally {
            setSaving(false);
        }
    }, [config, saving, clearSavedTimer]);

    const handleDiscard = useCallback(() => {
        clearSavedTimer();
        setConfigState(savedConfig);
        setTouched(false);
        setSaveStatus('idle');
        setSaveError(null);
        toast.info('Unsaved email changes discarded');
    }, [savedConfig, clearSavedTimer]);

    const handleResetAll = useCallback(async () => {
        if (saving) return;
        clearSavedTimer();
        setSaving(true);
        setSaveError(null);
        try {
            const res = await resetEmailConfig();
            setConfigState(res.config);
            if (res.synced) {
                setSavedConfig(res.config);
                setTouched(false);
                setSaveStatus('saved');
                toast.success('Email settings reset to defaults');
                savedResetTimerRef.current = window.setTimeout(() => {
                    setSaveStatus('idle');
                    savedResetTimerRef.current = null;
                }, 3000);
            } else {
                const message = res.error || 'Could not sync default email settings to the server';
                setTouched(true);
                setSaveStatus('error');
                setSaveError(message);
                toast.error(`Reset locally, but sync failed: ${message}`);
            }
        } finally {
            setSaving(false);
        }
    }, [saving, clearSavedTimer]);

    // Ctrl/Cmd+S saves email settings; warn before closing browser tab with unsaved edits
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                if (activeTab === 'emails' || (hasChanges && canSave)) {
                    e.preventDefault();
                    if (canSave) void handleSave();
                }
            }
        };
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            if (!hasChanges) return;
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('beforeunload', onBeforeUnload);
        };
    }, [activeTab, hasChanges, canSave, handleSave]);

    // ─── Live badge counts for top tabs ───
    const certificatesQuery = useCertificateTemplates();
    const certificatesCount =
        certificatesQuery.data?.available === false
            ? undefined
            : certificatesQuery.data?.templates.length;

    const optOutsQuery = useQuery<EmailOptOut[]>({
        queryKey: ['email_opt_outs'],
        queryFn: listEmailOptOutsSafe,
    });
    const [duplicatesCount, setDuplicatesCount] = useState<number | undefined>(undefined);
    const unsubscribedCount = optOutsQuery.data?.length;
    const dataHygieneCount =
        unsubscribedCount === undefined && duplicatesCount === undefined
            ? undefined
            : (unsubscribedCount ?? 0) + (duplicatesCount ?? 0);

    const usersQuery = useQuery<AppUser[]>({
        queryKey: ['app_users'],
        queryFn: fetchAppUsers,
        retry: false,
    });
    const usersCount = usersQuery.data?.length;

    const tabs = useMemo<UnderlineTab<SettingsTabKey>[]>(
        () => [
            {
                value: 'general',
                label: 'General',
                icon: SlidersHorizontal,
            },
            {
                value: 'emails',
                label: 'Emails',
                icon: Mail,
                dot: emailValidation.allValid ? (hasChanges ? 'bg-warning' : undefined) : 'bg-danger',
                dotLabel: !emailValidation.allValid
                    ? 'Template warnings need attention'
                    : hasChanges
                        ? 'Unsaved email changes'
                        : undefined,
            },
            {
                value: 'certificates',
                label: 'Certificates',
                icon: Award,
                count: certificatesCount,
            },
            {
                value: 'data',
                label: 'Data & Hygiene',
                icon: Database,
                count: dataHygieneCount,
                countTone: duplicatesCount && duplicatesCount > 0 ? 'warning' : 'default',
            },
            {
                value: 'users',
                label: 'Users & Roles',
                icon: ShieldCheck,
                count: usersCount,
            },
        ],
        [
            emailValidation.allValid,
            hasChanges,
            certificatesCount,
            dataHygieneCount,
            duplicatesCount,
            usersCount,
        ],
    );

    const activeTabLabel = tabs.find(t => t.value === activeTab)?.label ?? 'Settings';

    return (
        <div className="flex-1 flex flex-col gap-5 sm:gap-6 pb-12 w-full max-w-[1600px] mx-auto">
            <UnderlineTabs<SettingsTabKey>
                tabs={tabs}
                value={activeTab}
                onChange={handleTabChange}
                ariaLabel="Settings sections"
            />

            <div
                key={activeTab}
                role="tabpanel"
                aria-label={activeTabLabel}
                className={`animate-fadeIn ${activeTab === 'emails' ? 'w-full max-w-[1600px]' : 'w-full max-w-5xl'}`}
            >
                {activeTab === 'general' && (
                    <GeneralTab
                        darkMode={darkMode}
                        onDarkModeChange={onDarkModeChange}
                        density={density}
                        onDensityChange={onDensityChange}
                    />
                )}
                {activeTab === 'emails' && (
                    <EmailsTab
                        config={config}
                        savedConfig={savedConfig}
                        hasChanges={hasChanges}
                        saving={saving}
                        saveStatus={saveStatus}
                        saveError={saveError}
                        onChangeConfig={handleChangeConfig}
                        onSave={handleSave}
                        onDiscard={handleDiscard}
                        onResetAll={handleResetAll}
                    />
                )}
                {activeTab === 'certificates' && <CertificatesTab />}
                {activeTab === 'data' && (
                    <DataHygieneTab
                        activeSubTab={activeDataSubTab}
                        onSubTabChange={handleDataSubTabChange}
                        onDuplicatesCountChange={setDuplicatesCount}
                    />
                )}
                {activeTab === 'users' && <UsersRolesTab />}
            </div>
        </div>
    );
}
