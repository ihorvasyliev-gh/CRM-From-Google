import { useCallback, useEffect, useState } from 'react';
import { readStorage, writeStorage } from '../lib/storage';

export type Density = 'comfortable' | 'compact';

/** Comfortable / compact layout, remembered in this browser and applied as a class on <html>. */
export function useDensity() {
    const [density, setDensity] = useState<Density>(() =>
        readStorage('view_density') === 'compact' ? 'compact' : 'comfortable'
    );

    useEffect(() => {
        document.documentElement.classList.toggle('density-compact', density === 'compact');
        writeStorage('view_density', density);
    }, [density]);

    const toggleDensity = useCallback(() => {
        setDensity(prev => prev === 'comfortable' ? 'compact' : 'comfortable');
    }, []);

    return { density, setDensity, toggleDensity };
}
