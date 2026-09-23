/* eslint-disable react-refresh/only-export-components -- test helpers, never hot-reloaded */
import React from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, useLocation } from 'react-router-dom';
import { GlobalToaster } from '../Toast';

function LocationProbe() {
    const location = useLocation();
    return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

/** Renders viewer pages inside a router (at `path`) + React Query + the global toaster. */
export function renderViewer(routes: React.ReactElement, path: string) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const result = render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={[path]}>
                <Routes>{routes}</Routes>
                <LocationProbe />
            </MemoryRouter>
            <GlobalToaster />
        </QueryClientProvider>
    );
    return { ...result, queryClient };
}

export function isoFromToday(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

