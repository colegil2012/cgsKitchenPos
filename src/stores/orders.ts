import {defineStore} from 'pinia';
import {ref, computed} from 'vue';
import {fetchActiveOrders, updateOrderStatus, ApiError} from '../api/client';
import type {OrderView} from '../types/menu';
import {useConnectivityStore} from './connectivity';

/**
 * Kitchen board state. Polls GET /api/orders/active and groups orders into
 * the three working columns. Transitions go through the validated
 * /status endpoint, so the server's OrderStateTransitions matrix is the
 * source of truth — we mirror just enough of it here to label buttons and
 * disable illegal actions before the round-trip.
 *
 * Transitions are ONLINE-ONLY: unlike cash order creation, advancing a
 * kitchen order is not safe to queue offline (a stale "mark ready" applied
 * hours later is wrong). Buttons disable when offline.
 */

export type BoardColumn = 'PAID' | 'IN_KITCHEN' | 'READY';

/** The single forward step the board offers for each column's orders. */
interface NextStep {
    status: string;
    label: string;
}

export const useOrdersStore = defineStore('orders', () => {
    const orders = ref<OrderView[]>([]);
    const loading = ref(false);
    const error = ref<string | null>(null);
    const lastUpdated = ref<number | null>(null);
    /** Order ids currently mid-transition, to disable their buttons. */
    const working = ref<Set<string>>(new Set());

    let timer: number | undefined;

    const byColumn = computed<Record<BoardColumn, OrderView[]>>(() => {
        const cols: Record<BoardColumn, OrderView[]> = {
            PAID: [],
            IN_KITCHEN: [],
            READY: [],
        };
        for (const o of orders.value) {
            if (o.status === 'PAID') cols.PAID.push(o);
            else if (o.status === 'IN_KITCHEN') cols.IN_KITCHEN.push(o);
            else if (o.status === 'READY') cols.READY.push(o);
            // OUT_FOR_DELIVERY (also returned by /active) intentionally not shown
            // on the kitchen board — it's past the kitchen's hands.
        }
        return cols;
    });

    /**
     * The forward step for an order, honoring the fulfillment-specific rule
     * from OrderStateTransitions: READY → COMPLETED for pickup/dine-in,
     * READY → OUT_FOR_DELIVERY for delivery.
     */
    function nextStep(o: OrderView): NextStep | null {
        switch (o.status) {
            case 'PAID':
                return {status: 'IN_KITCHEN', label: 'Start cooking'};
            case 'IN_KITCHEN':
                return {status: 'READY', label: 'Mark ready'};
            case 'READY':
                return o.fulfillment === 'DELIVERY'
                    ? {status: 'OUT_FOR_DELIVERY', label: 'Out for delivery'}
                    : {status: 'COMPLETED', label: 'Complete order'};
            default:
                return null;
        }
    }

    async function load(showSpinner = false) {
        if (showSpinner) loading.value = true;
        error.value = null;
        try {
            orders.value = await fetchActiveOrders();
            lastUpdated.value = Date.now();
        } catch (e) {
            error.value =
                e instanceof ApiError && e.status === 0
                    ? 'Offline — showing last known orders.'
                    : 'Could not load orders.';
        } finally {
            loading.value = false;
        }
    }

    function startPolling(intervalMs = 10000) {
        if (timer !== undefined) return;
        load(true);
        timer = window.setInterval(() => load(false), intervalMs);
    }

    function stopPolling() {
        if (timer !== undefined) {
            clearInterval(timer);
            timer = undefined;
        }
    }

    async function advance(o: OrderView): Promise<void> {
        const step = nextStep(o);
        if (!step) return;
        await transition(o.id, step.status, 'advanced via kitchen board');
    }

    async function cancel(o: OrderView): Promise<void> {
        await transition(o.id, 'CANCELLED', 'cancelled via kitchen board');
    }

    async function transition(
        orderId: string,
        status: string,
        note: string,
    ): Promise<void> {
        const connectivity = useConnectivityStore();
        if (!connectivity.online) {
            error.value = 'Offline — order actions need a connection.';
            return;
        }
        working.value = new Set(working.value).add(orderId);
        error.value = null;
        try {
            const updated = await updateOrderStatus(orderId, status, note);
            // Optimistically reflect, then reconcile on next poll.
            const idx = orders.value.findIndex(o => o.id === orderId);
            if (idx >= 0) {
                if (
                    updated.status === 'CANCELLED' ||
                    updated.status === 'COMPLETED' ||
                    updated.status === 'OUT_FOR_DELIVERY'
                ) {
                    // Leaves the kitchen board entirely.
                    orders.value = orders.value.filter(o => o.id !== orderId);
                } else {
                    orders.value = orders.value.map(o =>
                        o.id === orderId ? updated : o,
                    );
                }
            }
        } catch (e) {
            error.value =
                e instanceof ApiError && e.status === 400
                    ? `Rejected: ${e.message}`
                    : e instanceof ApiError && e.status === 0
                        ? 'Offline — could not reach the server.'
                        : 'Action failed.';
            // Re-sync truth from the server.
            void load(false);
        } finally {
            const next = new Set(working.value);
            next.delete(orderId);
            working.value = next;
        }
    }

    return {
        orders,
        loading,
        error,
        lastUpdated,
        working,
        byColumn,
        nextStep,
        load,
        startPolling,
        stopPolling,
        advance,
        cancel,
    };
});