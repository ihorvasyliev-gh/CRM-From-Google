import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { failedChunkUrl, isChunkLoadError, recoverStaleAssets, resetAssetRecovery } from '../lib/deployRecovery';

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): State {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // Code that failed to load after a deploy was already retried by lazyWithRetry
        console.error('Uncaught error in ErrorBoundary:', error, errorInfo);
    }

    /** Fetch the latest code past the browser cache, then reload. */
    private handleReload = () => {
        resetAssetRecovery();
        recoverStaleAssets(failedChunkUrl(this.state.error)).then(reloading => {
            if (!reloading) window.location.reload();
        });
    };

    public render() {
        if (this.state.hasError) {
            const chunkError = isChunkLoadError(this.state.error);

            return (
                <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 space-y-4">
                    <div className="w-16 h-16 bg-danger/10 rounded-full flex items-center justify-center text-danger mb-4">
                        <AlertTriangle size={32} />
                    </div>
                    <h1 className="text-2xl font-bold text-primary">
                        {chunkError ? 'App Update Required' : 'Something went wrong'}
                    </h1>
                    <p className="text-muted text-center max-w-md">
                        {chunkError
                            ? 'A new version of the app is available. Please reload the page to continue using the most up-to-date features.'
                            : 'We apologize, but an unexpected error occurred. You can try reloading the page. If the problem persists, please contact support.'}
                    </p>

                    {this.state.error && (
                        <div className="bg-surface-elevated border border-border-strong rounded-xl p-4 w-full max-w-2xl overflow-auto text-left opacity-80 mt-4">
                            <p className="text-sm font-mono text-danger mb-2 font-semibold">Error Details:</p>
                            <pre className="text-xs text-muted font-mono whitespace-pre-wrap">
                                {this.state.error.toString()}
                            </pre>
                        </div>
                    )}

                    <button
                        onClick={this.handleReload}
                        className="mt-6 flex items-center gap-2 px-6 py-3 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-xl transition-all shadow-xs"
                    >
                        <RefreshCw size={18} />
                        Reload Page
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
