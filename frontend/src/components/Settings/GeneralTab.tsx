import { useCallback, useEffect, useState } from 'react';
import {
    AlertTriangle,
    Bell,
    BellOff,
    BellRing,
    Check,
    Cloud,
    Info,
    Moon,
    Palette,
    Sun,
    User,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { staffNameOf } from '../../lib/documentUtils';
import {
    getPushStatus,
    subscribeUserToPush,
    unsubscribeUserFromPush,
    type PushStatus,
} from '../../lib/pushNotifications';
import { toast } from '../../lib/toast';
import StaffNameField from '../StaffNameField';
import Badge from '../ui/Badge';
import { Button } from '../ui/Button';
import Card from '../ui/Card';
import { calloutCls, panelCls, toneChipCls } from '../ui/styles';
import type { Density, GeneralTabProps } from './types';

function getUserInitials(name: string, email?: string | null): string {
    const cleanName = name.trim();
    if (cleanName) {
        const parts = cleanName.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
        }
        return parts[0].slice(0, 2).toUpperCase();
    }
    const local = (email ?? '').split('@')[0]?.trim();
    if (local) {
        const parts = local.split(/[._\-\s]+/).filter(Boolean);
        if (parts.length >= 2) {
            return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        }
        return local.slice(0, 2).toUpperCase();
    }
    return 'A';
}

function ThemeSchematic({ dark }: { dark: boolean }) {
    const palette = dark
        ? {
              canvas: '#111827',
              surface: '#1f2937',
              border: '#374151',
              accent: '#818cf8',
              accentSoft: 'rgba(129, 140, 248, 0.22)',
              barStrong: '#9ca3af',
              barMuted: '#4b5563',
          }
        : {
              canvas: '#f8fafc',
              surface: '#ffffff',
              border: '#e2e8f0',
              accent: '#6366f1',
              accentSoft: 'rgba(99, 102, 241, 0.16)',
              barStrong: '#94a3b8',
              barMuted: '#cbd5e1',
          };

    return (
        <div
            aria-hidden="true"
            className="h-24 w-full rounded-lg border overflow-hidden flex select-none"
            style={{ backgroundColor: palette.canvas, borderColor: palette.border }}
        >
            {/* Miniature sidebar */}
            <div
                className="w-11 shrink-0 p-2 flex flex-col gap-1.5 border-r"
                style={{ backgroundColor: palette.surface, borderColor: palette.border }}
            >
                <div className="w-3.5 h-3.5 rounded-md" style={{ backgroundColor: palette.accent }} />
                <div className="mt-1 space-y-1">
                    <div className="h-1.5 w-full rounded-full" style={{ backgroundColor: palette.accentSoft }} />
                    <div className="h-1.5 w-5/6 rounded-full" style={{ backgroundColor: palette.barMuted }} />
                    <div className="h-1.5 w-4/6 rounded-full" style={{ backgroundColor: palette.barMuted }} />
                </div>
            </div>

            {/* Miniature main area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header strip */}
                <div
                    className="h-5 px-2 flex items-center justify-between border-b shrink-0"
                    style={{ backgroundColor: palette.surface, borderColor: palette.border }}
                >
                    <div className="h-1.5 w-12 rounded-full" style={{ backgroundColor: palette.barStrong }} />
                    <div className="h-2 w-6 rounded-full" style={{ backgroundColor: palette.accent }} />
                </div>

                {/* Two content bars */}
                <div className="flex-1 p-2 flex flex-col justify-center gap-1.5">
                    <div
                        className="rounded-md border px-2 py-1.5 flex items-center gap-2"
                        style={{ backgroundColor: palette.surface, borderColor: palette.border }}
                    >
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: palette.accent }} />
                        <div className="flex-1 space-y-1 min-w-0">
                            <div className="h-1.5 w-3/4 rounded-full" style={{ backgroundColor: palette.barStrong }} />
                            <div className="h-1 w-1/2 rounded-full" style={{ backgroundColor: palette.barMuted }} />
                        </div>
                    </div>
                    <div
                        className="rounded-md border px-2 py-1.5 flex items-center gap-2"
                        style={{ backgroundColor: palette.surface, borderColor: palette.border }}
                    >
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: palette.accentSoft }} />
                        <div className="h-1.5 w-2/3 rounded-full" style={{ backgroundColor: palette.barMuted }} />
                        <div className="h-1.5 w-6 ml-auto rounded-full" style={{ backgroundColor: palette.accent }} />
                    </div>
                </div>
            </div>
        </div>
    );
}

function DensitySchematic({ compact }: { compact: boolean }) {
    if (compact) {
        return (
            <div
                aria-hidden="true"
                className="h-20 w-full rounded-lg bg-surface-elevated/70 border border-border-subtle p-2 flex flex-col justify-center gap-1 select-none"
            >
                {[0, 1, 2, 3].map(i => (
                    <div
                        key={i}
                        className="h-3.5 rounded-sm bg-surface border border-border-subtle px-1.5 flex items-center gap-1.5"
                    >
                        <span className="w-2 h-2 rounded-full bg-brand-500/40 shrink-0" />
                        <span
                            className="h-1.5 rounded-full bg-primary/20"
                            style={{ width: i % 2 === 0 ? '54%' : '42%' }}
                        />
                        <span className="h-1.5 w-5 ml-auto rounded-full bg-success/45 shrink-0" />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div
            aria-hidden="true"
            className="h-20 w-full rounded-lg bg-surface-elevated/70 border border-border-subtle p-2.5 flex flex-col justify-center gap-2 select-none"
        >
            {[0, 1].map(i => (
                <div
                    key={i}
                    className="h-6 rounded-md bg-surface border border-border-subtle px-2.5 flex items-center gap-2"
                >
                    <span className="w-3 h-3 rounded-full bg-brand-500/40 shrink-0" />
                    <span
                        className="h-2 rounded-full bg-primary/20"
                        style={{ width: i === 0 ? '52%' : '40%' }}
                    />
                    <span className="h-2 w-7 ml-auto rounded-full bg-success/45 shrink-0" />
                </div>
            ))}
        </div>
    );
}

const THEME_OPTIONS: readonly {
    dark: boolean;
    label: string;
    description: string;
    Icon: typeof Sun;
}[] = [
    {
        dark: false,
        label: 'Light',
        description: 'Crisp light surfaces suited to bright workspaces.',
        Icon: Sun,
    },
    {
        dark: true,
        label: 'Dark',
        description: 'Low-glare dark surfaces for reduced eye strain.',
        Icon: Moon,
    },
];

const DENSITY_OPTIONS: readonly {
    value: Density;
    label: string;
    isDefault?: boolean;
    description: string;
}[] = [
    {
        value: 'comfortable',
        label: 'Comfortable',
        isDefault: true,
        description: 'Spacious cards and generous padding for everyday viewing.',
    },
    {
        value: 'compact',
        label: 'Compact',
        description: 'Tighter rows and margins to scan more records at once.',
    },
];

export default function GeneralTab({
    darkMode,
    onDarkModeChange,
    density,
    onDensityChange,
}: GeneralTabProps) {
    const { user } = useAuth();
    const staffName = staffNameOf(user);
    const initials = getUserInitials(staffName, user?.email);

    const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
    const [pushBusy, setPushBusy] = useState(false);

    const refreshPushStatus = useCallback(async () => {
        const status = await getPushStatus();
        setPushStatus(status);
    }, []);

    useEffect(() => {
        let cancelled = false;
        getPushStatus().then(status => {
            if (!cancelled) setPushStatus(status);
        });

        const handleFocus = () => {
            void refreshPushStatus();
        };
        const handleVisibility = () => {
            if (!document.hidden) void refreshPushStatus();
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            cancelled = true;
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [refreshPushStatus]);

    const handleEnablePush = async () => {
        if (!user?.id || pushBusy) return;
        setPushBusy(true);
        try {
            const ok = await subscribeUserToPush(user.id);
            const next = await getPushStatus();
            setPushStatus(next);
            if (ok) {
                toast.success('Browser notifications enabled on this device');
            } else if (next.permission === 'denied') {
                toast.error('Notifications are blocked in your browser site settings');
            } else {
                toast.error('Notifications were not enabled on this device');
            }
        } finally {
            setPushBusy(false);
        }
    };

    const handleDisablePush = async () => {
        if (!user?.id || pushBusy) return;
        setPushBusy(true);
        try {
            const ok = await unsubscribeUserFromPush(user.id);
            const next = await getPushStatus();
            setPushStatus(next);
            if (ok) {
                toast.success('Browser notifications disabled on this device');
            } else {
                toast.error('Could not disable notifications on this device');
            }
        } finally {
            setPushBusy(false);
        }
    };

    const isSubscribed = Boolean(pushStatus?.subscribed && pushStatus.permission === 'granted');

    const pushStatusBadge = (() => {
        if (!pushStatus) {
            return <Badge tone="neutral">Checking…</Badge>;
        }
        if (!pushStatus.supported) {
            return <Badge tone="neutral">Not supported</Badge>;
        }
        if (pushStatus.permission === 'denied') {
            return <Badge tone="warning">Blocked in browser</Badge>;
        }
        if (isSubscribed) {
            return <Badge tone="success">Enabled</Badge>;
        }
        return <Badge tone="neutral">Off</Badge>;
    })();

    return (
        <div className="max-w-4xl space-y-6">
            {/* 1. Account & Profile */}
            <Card
                title="Account & Profile"
                subtitle="Your signed-in account and display name for generated documents"
                icon={User}
                tone="brand"
                divided
            >
                <div className="space-y-5">
                    {/* Compact identity strip */}
                    <div className={`${panelCls} p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
                        <div className="flex items-center gap-3 min-w-0">
                            <div
                                aria-hidden="true"
                                className="w-10 h-10 rounded-full bg-linear-to-br from-brand-500 via-brand-600 to-violet-500 text-white text-sm font-bold flex items-center justify-center shadow-xs ring-1 ring-inset ring-white/15 shrink-0"
                            >
                                {initials}
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                    <p className="text-sm font-semibold text-primary truncate">
                                        {staffName || user?.email || 'Administrator'}
                                    </p>
                                    <Badge tone="brand">Admin</Badge>
                                </div>
                                {staffName && user?.email && (
                                    <p className="text-xs text-muted truncate mt-0.5">{user.email}</p>
                                )}
                            </div>
                        </div>

                        <p className="inline-flex items-center gap-1.5 text-xs text-muted shrink-0">
                            <Cloud size={13} className="text-brand-500/80 shrink-0" aria-hidden="true" />
                            <span>Synced to your sign-in across devices</span>
                        </p>
                    </div>

                    <div className="border-t border-border-subtle pt-4">
                        <StaffNameField embedded />
                    </div>
                </div>
            </Card>

            {/* 2. Appearance */}
            <Card
                title="Appearance"
                subtitle="Choose how the workspace looks and feels on this screen"
                icon={Palette}
                tone="info"
                divided
            >
                <div className="space-y-6">
                    {/* Theme */}
                    <div>
                        <div className="mb-3">
                            <h4 className="text-[13px] font-semibold text-primary">Theme</h4>
                            <p className="text-xs text-muted mt-0.5">
                                Switch between light and dark surfaces.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {THEME_OPTIONS.map(opt => {
                                const active = darkMode === opt.dark;
                                const Icon = opt.Icon;
                                return (
                                    <button
                                        key={opt.label}
                                        type="button"
                                        aria-pressed={active}
                                        onClick={() => onDarkModeChange(opt.dark)}
                                        className={`group rounded-xl border p-3 text-left transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                                            active
                                                ? 'border-brand-500 ring-1 ring-brand-500 bg-brand-500/[0.05]'
                                                : 'border-border-subtle bg-surface hover:border-border-strong hover:bg-surface-elevated/30'
                                        }`}
                                    >
                                        <ThemeSchematic dark={opt.dark} />
                                        <div className="mt-3 flex items-start justify-between gap-2.5">
                                            <div className="min-w-0">
                                                <span className="flex items-center gap-1.5 text-[13px] font-semibold text-primary">
                                                    <Icon
                                                        size={14}
                                                        className={active ? 'text-brand-500' : 'text-muted'}
                                                        aria-hidden="true"
                                                    />
                                                    {opt.label}
                                                </span>
                                                <span className="block text-xs text-muted mt-0.5 leading-snug">
                                                    {opt.description}
                                                </span>
                                            </div>
                                            <span
                                                aria-hidden="true"
                                                className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                                                    active
                                                        ? 'bg-brand-500 text-white'
                                                        : 'border border-border-strong/80 bg-surface'
                                                }`}
                                            >
                                                {active && <Check size={12} strokeWidth={2.5} />}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="border-t border-border-subtle" />

                    {/* Interface density */}
                    <div>
                        <div className="mb-3">
                            <h4 className="text-[13px] font-semibold text-primary">Interface density</h4>
                            <p className="text-xs text-muted mt-0.5">
                                Choose the layout density that best fits your display and workflow.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {DENSITY_OPTIONS.map(opt => {
                                const active = density === opt.value;
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        aria-pressed={active}
                                        onClick={() => onDensityChange(opt.value)}
                                        className={`group rounded-xl border p-3 text-left transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                                            active
                                                ? 'border-brand-500 ring-1 ring-brand-500 bg-brand-500/[0.05]'
                                                : 'border-border-subtle bg-surface hover:border-border-strong hover:bg-surface-elevated/30'
                                        }`}
                                    >
                                        <DensitySchematic compact={opt.value === 'compact'} />
                                        <div className="mt-3 flex items-start justify-between gap-2.5">
                                            <div className="min-w-0">
                                                <span className="block text-[13px] font-semibold text-primary">
                                                    {opt.label}
                                                    {opt.isDefault && (
                                                        <span className="text-muted font-normal"> (default)</span>
                                                    )}
                                                </span>
                                                <span className="block text-xs text-muted mt-0.5 leading-snug">
                                                    {opt.description}
                                                </span>
                                            </div>
                                            <span
                                                aria-hidden="true"
                                                className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                                                    active
                                                        ? 'bg-brand-500 text-white'
                                                        : 'border border-border-strong/80 bg-surface'
                                                }`}
                                            >
                                                {active && <Check size={12} strokeWidth={2.5} />}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <p className="flex items-center gap-1.5 text-xs text-muted pt-0.5">
                        <Info size={13} className="shrink-0" aria-hidden="true" />
                        <span>Theme and density apply to this browser only.</span>
                    </p>
                </div>
            </Card>

            {/* 3. Browser Notifications */}
            <Card
                title="Browser Notifications"
                subtitle="Real-time alerts on this device when students confirm courses"
                icon={Bell}
                tone="success"
                divided
                action={pushStatusBadge}
            >
                <div className="space-y-4">
                    <p className="text-[13px] text-muted leading-relaxed">
                        Receive instant browser alerts on this device whenever a student confirms their place on a course.
                    </p>

                    {pushStatus && !pushStatus.supported ? (
                        <div className={`${calloutCls.info} p-3.5 flex items-start gap-2.5 text-xs leading-relaxed`}>
                            <Info size={15} className="text-status-invited shrink-0 mt-0.5" aria-hidden="true" />
                            <div>
                                <p className="font-semibold text-primary">
                                    Web Push notifications are not supported in this browser
                                </p>
                                <p className="text-muted mt-0.5">
                                    Open the CRM in a current desktop browser (Chrome, Edge, Firefox or Safari) to receive instant confirmation alerts.
                                </p>
                            </div>
                        </div>
                    ) : pushStatus?.permission === 'denied' ? (
                        <div className={`${calloutCls.warning} p-3.5 flex items-start gap-2.5 text-xs leading-relaxed`}>
                            <AlertTriangle size={15} className="text-status-requested shrink-0 mt-0.5" aria-hidden="true" />
                            <div>
                                <p className="font-semibold text-primary">
                                    Notifications are blocked in your browser&apos;s site settings
                                </p>
                                <p className="text-muted mt-0.5">
                                    Open the lock or site settings icon in your address bar, set Notifications to Allow for this site, and reload the page.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className={`${panelCls} p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
                            <div className="flex items-center gap-3 min-w-0">
                                <span
                                    aria-hidden="true"
                                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                        isSubscribed ? toneChipCls.success : toneChipCls.neutral
                                    }`}
                                >
                                    {isSubscribed ? <BellRing size={16} /> : <BellOff size={16} />}
                                </span>
                                <div className="min-w-0">
                                    <p className="text-[13px] font-semibold text-primary">
                                        {isSubscribed
                                            ? 'Alerts are enabled on this device'
                                            : 'Alerts are turned off on this device'}
                                    </p>
                                    <p className="text-xs text-muted mt-0.5">
                                        {isSubscribed
                                            ? 'You will receive a push notification as soon as a student confirms.'
                                            : 'Enable notifications to hear about confirmed places straight away.'}
                                    </p>
                                </div>
                            </div>

                            {isSubscribed ? (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    loading={pushBusy}
                                    disabled={!user?.id}
                                    onClick={() => void handleDisablePush()}
                                    className="shrink-0"
                                >
                                    {!pushBusy && <BellOff size={14} />}
                                    Disable on this device
                                </Button>
                            ) : (
                                <Button
                                    variant="primary"
                                    size="sm"
                                    loading={pushBusy}
                                    disabled={!user?.id || pushStatus === null}
                                    onClick={() => void handleEnablePush()}
                                    className="shrink-0"
                                >
                                    {!pushBusy && <Bell size={14} />}
                                    Enable notifications
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
}
