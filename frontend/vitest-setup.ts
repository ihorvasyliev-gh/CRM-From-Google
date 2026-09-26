import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

vi.mock('@supabase/supabase-js', () => {
    return {
        createClient: () => ({
            auth: {
                getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
                onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
            },
            from: vi.fn().mockReturnValue({
                upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
        }),
    }
})

class MockIntersectionObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
}
window.IntersectionObserver = MockIntersectionObserver as any;

// jsdom has no matchMedia: evaluate (max-width: Npx) against innerWidth, fire 'change' on resize
window.matchMedia = (query: string) => {
    const max = /max-width:\s*(\d+)px/.exec(query)?.[1];
    const evaluate = () => max !== undefined && window.innerWidth <= Number(max);
    const mql = Object.assign(new EventTarget(), { media: query }) as MediaQueryList;
    Object.defineProperty(mql, 'matches', { get: evaluate });
    let last = evaluate();
    window.addEventListener('resize', () => {
        if (evaluate() !== last) { last = evaluate(); mql.dispatchEvent(new Event('change')); }
    });
    return mql;
};
