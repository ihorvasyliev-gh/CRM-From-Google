import '@testing-library/jest-dom'
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
