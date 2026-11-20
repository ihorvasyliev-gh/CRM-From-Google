import { hasConfirmationTag, type AppConfig } from '../../lib/appConfig';

export type SettingsTabKey = 'general' | 'emails' | 'certificates' | 'data' | 'users';
export type DataHygieneSubTab = 'duplicates' | 'unsubscribed';
export type Density = 'comfortable' | 'compact';
export type SaveStatus = 'idle' | 'saved' | 'error';

export const SETTINGS_TABS: readonly SettingsTabKey[] = ['general', 'emails', 'certificates', 'data', 'users'];

export function isSettingsTabKey(value: string | null | undefined): value is SettingsTabKey {
    return !!value && (SETTINGS_TABS as readonly string[]).includes(value);
}

export function isDataHygieneSubTab(value: string | null | undefined): value is DataHygieneSubTab {
    return value === 'duplicates' || value === 'unsubscribed';
}

export function hasStatusTag(template: string | null | undefined): boolean {
    if (!template) return false;
    return template.includes('{statusButton}') || template.includes('{statusLink}');
}

export interface EmailConfigValidation {
    highEnglishValid: boolean;
    standardValid: boolean;
    graduatesValid: boolean;
    outreachValid: boolean;
    allValid: boolean;
}

export function validateEmailConfig(config: AppConfig): EmailConfigValidation {
    const highEnglishValid = hasConfirmationTag(config.htmlEmailTemplate || '');
    const standardValid = hasConfirmationTag(config.htmlEmailTemplateStandard || '');
    const graduatesValid = hasStatusTag(config.statusEmailTemplate);
    const outreachValid = hasStatusTag(config.outreachEmailTemplate);
    return {
        highEnglishValid,
        standardValid,
        graduatesValid,
        outreachValid,
        allValid: highEnglishValid && standardValid && graduatesValid && outreachValid,
    };
}

export interface GeneralTabProps {
    darkMode: boolean;
    onDarkModeChange: (dark: boolean) => void;
    density: Density;
    onDensityChange: (density: Density) => void;
}

export interface EmailsTabProps {
    config: AppConfig;
    savedConfig: AppConfig;
    hasChanges: boolean;
    saving: boolean;
    saveStatus: SaveStatus;
    saveError: string | null;
    onChangeConfig: (updater: (prev: AppConfig) => AppConfig) => void;
    onSave: () => Promise<void>;
    onDiscard: () => void;
    onResetAll: () => Promise<void>;
}

export interface DataHygieneTabProps {
    activeSubTab: DataHygieneSubTab;
    onSubTabChange: (sub: DataHygieneSubTab) => void;
    onDuplicatesCountChange?: (count: number | undefined) => void;
}
