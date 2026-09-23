import { createContext, useContext, ReactNode } from 'react';
import { useNetworkSyncStatus, type NetworkSyncStatus } from '../hooks/useNetworkSyncStatus';

/**
 * Runs the network / realtime health monitor exactly once for the whole app.
 * Several status indicators are mounted at the same time (mobile + desktop headers);
 * without this each of them opened its own "system_health" channel and reacted to
 * every focus event independently.
 */
const NetworkStatusContext = createContext<NetworkSyncStatus | null>(null);

export function NetworkStatusProvider({ children }: { children: ReactNode }) {
    const status = useNetworkSyncStatus();
    return <NetworkStatusContext.Provider value={status}>{children}</NetworkStatusContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSharedNetworkStatus(): NetworkSyncStatus | null {
    return useContext(NetworkStatusContext);
}
