import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { subscribeWithRetry } from './realtimeSync';
import { supabase } from './supabase';

vi.mock('./supabase', () => ({ supabase: { removeChannel: vi.fn() } }));

/** A fake channel whose status callback the test drives. */
function fakeChannels() {
    const made: { channel: RealtimeChannel; emit: (status: string) => void }[] = [];
    const build = vi.fn(() => {
        let onStatus: (status: string) => void = () => {};
        const channel = { subscribe: vi.fn((cb: (status: string) => void) => { onStatus = cb; return channel; }) } as unknown as RealtimeChannel;
        made.push({ channel, emit: status => onStatus(status) });
        return channel;
    });
    return { build, made };
}

describe('subscribeWithRetry', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
    });
    afterEach(() => vi.useRealTimers());

    it('rebuilds the channel some time after an error, removing the failed one', () => {
        const { build, made } = fakeChannels();
        const stop = subscribeWithRetry(build, 'test', 5000);

        made[0].emit('CHANNEL_ERROR');
        expect(build).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(5000);

        expect(build).toHaveBeenCalledTimes(2);
        expect(supabase.removeChannel).toHaveBeenCalledWith(made[0].channel);
        stop();
    });

    it('ignores the CLOSED status of a channel it replaced itself', () => {
        const { build, made } = fakeChannels();
        const stop = subscribeWithRetry(build, 'test', 5000);
        window.dispatchEvent(new Event('crm:realtime-reconnect'));
        expect(build).toHaveBeenCalledTimes(2);

        made[0].emit('CLOSED');
        vi.advanceTimersByTime(10_000);
        expect(build).toHaveBeenCalledTimes(2);
        stop();
    });

    it('stops for good on cleanup', () => {
        const { build, made } = fakeChannels();
        const stop = subscribeWithRetry(build, 'test', 5000);
        made[0].emit('TIMED_OUT');
        stop();

        vi.advanceTimersByTime(10_000);
        window.dispatchEvent(new Event('crm:realtime-reconnect'));
        expect(build).toHaveBeenCalledTimes(1);
        expect(supabase.removeChannel).toHaveBeenCalledWith(made[0].channel);
    });
});
