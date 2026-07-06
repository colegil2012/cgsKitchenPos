import {defineStore} from 'pinia';
import {ref, computed} from 'vue';
import {
    fetchEventStatus,
    activateEvent,
    activateSeries,
    closeShift,
    setOnlineOrdering as apiSetOnlineOrdering,
    ApiError,
    type EventView,
} from '../api/client';
import {useConnectivityStore} from './connectivity';
import {kvGet, kvSet} from '../lib/db';

/** IndexedDB key for the cached live event (survives offline + kiosk reload). */
const LIVE_EVENT_CACHE_KEY = 'live_event_cache';
/** Grace period after an event's endAt during which a cached event is still
 *  honored offline — covers late close-out / flush while parked at the event.
 *  Beyond this, a cached event is considered stale and ignored. */
const CACHE_STALE_GRACE_MS = 6 * 60 * 60 * 1000; // 6 hours

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
    /** Whether the live shift is currently within its customer-facing
     *  window (online ordering open). False during the post-window flush
     *  period when the shift is operator-open but customers can't order. */
    const customerOrderingOpen = ref(false);
    const closing = ref(false);
    /** True while an online-ordering toggle request is in flight. */
    const toggling = ref(false);
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
        // Series projection with no concrete window yet — server computes
        // the slot on activation, so allow the attempt (server re-gates).
        if (n.fromSeries && !n.startAt) return true;
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
            customerOrderingOpen.value = status.customerOrderingOpen;
            // Cache the live event so cash can still ring up if the backend
            // becomes unreachable or the kiosk reloads while offline. We only
            // overwrite the cache on a SUCCESSFUL poll, so a failed poll never
            // clobbers a good cached event.
            void kvSet(LIVE_EVENT_CACHE_KEY, {
                event: status.active,
                cachedAt: Date.now(),
            });
        } catch (e) {
            error.value =
                e instanceof ApiError && e.status === 0
                    ? null // offline — keep last known silently
                    : 'Could not load event status.';
        } finally {
            loading.value = false;
        }
    }

    /**
     * Activate the given candidate. Branches by type:
     *  - series projection (fromSeries && no concrete id) → series endpoint,
     *    which materializes + activates the current-slot occurrence
     *  - concrete one-time event (has id) → event endpoint
     *
     * Surfaces the server's 409 "shift already open" as a friendly message.
     */
    async function activate(candidate: EventView): Promise<boolean> {
        const connectivity = useConnectivityStore();
        if (!connectivity.online) {
            error.value = 'Offline — cannot activate an event.';
            return false;
        }
        activating.value = true;
        error.value = null;
        try {
            if (candidate.fromSeries && candidate.seriesId && !candidate.id) {
                await activateSeries(candidate.seriesId);
            } else if (candidate.id) {
                await activateEvent(candidate.id);
            } else if (candidate.seriesId) {
                // Defensive: series with an id present — still route to series.
                await activateSeries(candidate.seriesId);
            } else {
                error.value = 'Nothing to activate.';
                return false;
            }
            await load(); // refresh — the activated occurrence is now the live shift
            return true;
        } catch (e) {
            if (e instanceof ApiError && e.status === 409) {
                error.value = e.message || 'A shift is already open — close it first.';
            } else {
                error.value =
                    e instanceof ApiError ? e.message : 'Activation failed.';
            }
            return false;
        } finally {
            activating.value = false;
        }
    }

    /**
     * Close the currently-open shift (operator action). Ends the till
     * session: the event stops being operator-open, so no further orders
     * (including late offline flushes) attach to it. Reloads after, which
     * surfaces the next scheduled event.
     */
    async function close(): Promise<boolean> {
        const current = live.value;
        if (!current || !current.id) {
            error.value = 'No open shift to close.';
            return false;
        }
        const connectivity = useConnectivityStore();
        if (!connectivity.online) {
            error.value = 'Offline — cannot close the shift until reconnected.';
            return false;
        }
        closing.value = true;
        error.value = null;
        try {
            await closeShift(current.id);
            await load(); // refresh — shift is now closed, next event surfaces
            return true;
        } catch (e) {
            error.value =
                e instanceof ApiError ? e.message : 'Could not close the shift.';
            return false;
        } finally {
            closing.value = false;
        }
    }

    /**
     * Switch online ordering on/off for the live shift (operator override).
     * Subtractive only on the customer side — POS ring-up is unaffected.
     * Explicit set so the button can't race itself into an ambiguous state.
     * Reloads after so the derived customerOrderingOpen + stored flag agree.
     */
    async function setOnlineOrdering(enabled: boolean): Promise<boolean> {
        const current = live.value;
        if (!current || !current.id) {
            error.value = 'No open shift to update.';
            return false;
        }
        const connectivity = useConnectivityStore();
        if (!connectivity.online) {
            error.value = 'Offline — cannot change online ordering until reconnected.';
            return false;
        }
        toggling.value = true;
        error.value = null;
        try {
            await apiSetOnlineOrdering(current.id, enabled);
            await load(); // refresh — stored flag + derived window state realign
            return true;
        } catch (e) {
            error.value =
                e instanceof ApiError ? e.message : 'Could not change online ordering.';
            return false;
        } finally {
            toggling.value = false;
        }
    }

    /**
     * Hydrate the live event from IndexedDB cache on startup, BEFORE the
     * first network poll. This is what lets cash ring up offline: if the
     * backend is unreachable (or the kiosk just reloaded with no network),
     * we still know which event is live from the last successful poll.
     *
     * Staleness guard: a cached event whose endAt is more than
     * CACHE_STALE_GRACE_MS in the past is ignored — we don't want a sale
     * binding to last week's event. An event with no endAt (open-ended) is
     * always honored while cached.
     */
    async function hydrateFromCache(): Promise<void> {
        // Don't clobber a value a live poll may have already set.
        if (live.value) return;
        try {
            const cached = await kvGet<{event: EventView | null; cachedAt: number}>(
                LIVE_EVENT_CACHE_KEY,
            );
            if (!cached || !cached.event) return;
            const ev = cached.event;
            if (ev.endAt) {
                const endedAt = new Date(ev.endAt).getTime();
                if (Date.now() - endedAt > CACHE_STALE_GRACE_MS) {
                    // Stale — an old event we shouldn't ring against anymore.
                    return;
                }
            }
            live.value = ev;
        } catch {
            // Cache miss / read error — proceed; the poll will populate.
        }
    }

    function start(pollMs = 20000) {
        if (pollTimer !== undefined) return;
        // Hydrate cached event first so cash works even if the first poll
        // fails (backend down). The poll, when it succeeds, refreshes + re-caches.
        void hydrateFromCache().then(() => load(true));
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
        closing,
        toggling,
        customerOrderingOpen,
        eventLive,
        activeEventId,
        canActivateNext,
        activatesInMs,
        load,
        hydrateFromCache,
        activate,
        close,
        setOnlineOrdering,
        start,
        stop,
    };
});