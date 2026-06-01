import {defineStore} from 'pinia';
import {ref, computed} from 'vue';
import {
    fetchEventStatus,
    activateEvent,
    ApiError,
    type EventView,
} from '../api/client';
import {useConnectivityStore} from './connectivity';

/**
 * Event lifecycle for the POS.
 *
 *  - Polls GET /api/events/status for the live event + next scheduled.
 *  - Exposes activeEventId, which the cart stamps onto every order so
 *    nothing is orphaned. (Captured at ring-up; for offline orders it
 *    travels in the queued op, binding the sale to the event it belongs
 *    to even if flushed after the event ends.)
 *  - Gates the Activate button: enabled once now >= startAt - 15min, or
 *    any time after start. Mirrors the server's gate; the server re-checks.
 *  - Rolls forward automatically: when the live event ends the server stops
 *    returning it as live and surfaces the next one on the next poll.
 */

const ACTIVATION_LEAD_MS = 15 * 60 * 1000;

export const useEventStore = defineStore('event', () => {
    const live = ref<EventView | null>(null);
    const next = ref<EventView | null>(null);
    const loading = ref(false);
    const error = ref<string | null>(null);
    const activating = ref(false);
    /** Ticks every 30s so time-based gating re-evaluates without a poll. */
    const nowTick = ref<number>(Date.now());

    let pollTimer: number | undefined;
    let tickTimer: number | undefined;

    /** True when an event is live and orders may be rung up. */
    const eventLive = computed(() => live.value !== null);

    /** The id to stamp on orders. Null when no event is live. */
    const activeEventId = computed(() => live.value?.id ?? null);

    /**
     * Whether the next event's Activate button should be enabled. Recomputes
     * off nowTick so it flips on as the 15-min window opens, without needing
     * the network poll to land.
     */
    const canActivateNext = computed(() => {
        const n = next.value;
        if (!n) return false;
        if (n.recurring && !n.startAt) return true; // server computes the slot
        if (!n.startAt) return false;
        const start = new Date(n.startAt).getTime();
        return nowTick.value >= start - ACTIVATION_LEAD_MS;
    });

    /** Human countdown until the next event can be activated (or null). */
    const activatesInMs = computed(() => {
        const n = next.value;
        if (!n || !n.startAt) return null;
        const openAt = new Date(n.startAt).getTime() - ACTIVATION_LEAD_MS;
        const delta = openAt - nowTick.value;
        return delta > 0 ? delta : 0;
    });

    async function load(showSpinner = false) {
        if (showSpinner) loading.value = true;
        error.value = null;
        try {
            const status = await fetchEventStatus();
            live.value = status.active;
            next.value = status.next;
        } catch (e) {
            error.value =
                e instanceof ApiError && e.status === 0
                    ? null // offline — keep last known silently
                    : 'Could not load event status.';
        } finally {
            loading.value = false;
        }
    }

    async function activate(eventId: string): Promise<boolean> {
        const connectivity = useConnectivityStore();
        if (!connectivity.online) {
            error.value = 'Offline — cannot activate an event.';
            return false;
        }
        activating.value = true;
        error.value = null;
        try {
            await activateEvent(eventId);
            await load(); // refresh — the activated event should now be live
            return true;
        } catch (e) {
            error.value =
                e instanceof ApiError ? e.message : 'Activation failed.';
            return false;
        } finally {
            activating.value = false;
        }
    }

    function start(pollMs = 20000) {
        if (pollTimer !== undefined) return;
        load(true);
        pollTimer = window.setInterval(() => load(false), pollMs);
        tickTimer = window.setInterval(() => {
            nowTick.value = Date.now();
        }, 30000);
    }

    function stop() {
        if (pollTimer !== undefined) {
            clearInterval(pollTimer);
            pollTimer = undefined;
        }
        if (tickTimer !== undefined) {
            clearInterval(tickTimer);
            tickTimer = undefined;
        }
    }

    return {
        live,
        next,
        loading,
        error,
        activating,
        eventLive,
        activeEventId,
        canActivateNext,
        activatesInMs,
        load,
        activate,
        start,
        stop,
    };
});