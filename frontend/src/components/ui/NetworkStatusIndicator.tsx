import React from 'react';
import { useNetworkSyncStatus } from '../../hooks/useNetworkSyncStatus';
import { CustomTooltip } from './Tooltip';
import { RefreshCw } from 'lucide-react';

interface Props {
    showLabel?: boolean;
    className?: string;
}

export default function NetworkStatusIndicator({ showLabel = false, className = '' }: Props) {
    const { status, statusText, reconnect, isReconnecting } = useNetworkSyncStatus();
    const isInteractive = status !== 'online';

    const handleClick = () => {
        if (isInteractive) {
            reconnect();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (isInteractive && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            reconnect();
        }
    };

    return (
        <CustomTooltip content={statusText}>
            <div
                role={isInteractive ? 'button' : undefined}
                tabIndex={isInteractive ? 0 : undefined}
                onClick={handleClick}
                onKeyDown={handleKeyDown}
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-xl text-xs font-semibold transition-all select-none ${
                    status === 'online'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : status === 'reconnecting'
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse cursor-pointer hover:bg-amber-500/20 active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-500/40'
                        : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 animate-pulse cursor-pointer hover:bg-red-500/20 active:scale-95 focus:outline-none focus:ring-2 focus:ring-red-500/40'
                } ${className}`}
                aria-label={statusText}
            >
                <span className="relative flex h-2 w-2 items-center justify-center">
                    {status === 'online' && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    )}
                    {isReconnecting ? (
                        <RefreshCw className="h-2.5 w-2.5 animate-spin text-amber-500" />
                    ) : (
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${
                            status === 'online'
                                ? 'bg-emerald-500'
                                : status === 'reconnecting'
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                        }`} />
                    )}
                </span>

                {showLabel ? (
                    <span className="text-[11px] font-medium tracking-tight">
                        {status === 'online' ? 'Online' : status === 'reconnecting' ? (isReconnecting ? 'Connecting...' : 'Reconnecting') : 'Offline'}
                    </span>
                ) : (
                    <span className="sr-only">{statusText}</span>
                )}
            </div>
        </CustomTooltip>
    );
}
