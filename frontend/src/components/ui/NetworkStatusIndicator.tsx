import { useNetworkSyncStatus } from '../../hooks/useNetworkSyncStatus';
import { CustomTooltip } from './Tooltip';

interface Props {
    showLabel?: boolean;
    className?: string;
}

export default function NetworkStatusIndicator({ showLabel = false, className = '' }: Props) {
    const { status, statusText } = useNetworkSyncStatus();

    return (
        <CustomTooltip content={statusText}>
            <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-xl text-xs font-semibold transition-all select-none ${
                status === 'online'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                    : status === 'reconnecting'
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse'
                    : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 animate-pulse'
            } ${className}`}>
                <span className="relative flex h-2 w-2">
                    {status === 'online' && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    )}
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${
                        status === 'online'
                            ? 'bg-emerald-500'
                            : status === 'reconnecting'
                            ? 'bg-amber-500'
                            : 'bg-red-500'
                    }`} />
                </span>

                {showLabel ? (
                    <span className="text-[11px] font-medium tracking-tight">
                        {status === 'online' ? 'Online' : status === 'reconnecting' ? 'Reconnecting' : 'Offline'}
                    </span>
                ) : (
                    <span className="sr-only">{statusText}</span>
                )}
            </div>
        </CustomTooltip>
    );
}
