import {defineStore} from 'pinia';
import {ref, computed} from 'vue';
import {
  queueAdd,
  queueAll,
  queueDelete,
  queuePut,
  type QueuedOp,
} from '../lib/db';
import {
  createPosOrder,
  confirmCashPayment,
  updateOrderStatus,
  ApiError,
} from '../api/client';
import {clientId} from '../lib/format';
import type {PosOrderRequest, OrderView} from '../types/menu';
import {useConnectivityStore} from './connectivity';

/**
 * Durable write queue. Mutating operations are persisted to IndexedDB and
 * flushed FIFO when connectivity is available, so a SIM7600 link drop never
 * loses a cash sale.
 *
 * IMPORTANT — card payments are NOT queueable: an M425 charge needs a live
 * round-trip to Stripe via the server. Only cash-path operations
 * (create_order, update_status->PAID for cash) go through this queue.
 * Card flows will call the server directly and require `online`.
 */

interface CreateOrderPayload {
  request: PosOrderRequest;
  /** Status to transition to after creation (cash → PAID). Optional. */
  thenStatus?: string;
  note?: string;
}

interface UpdateStatusPayload {
  orderId: string;
  status: string;
  note?: string;
}

export const useSyncStore = defineStore('sync', () => {
  const pending = ref<QueuedOp[]>([]);
  const flushing = ref(false);
  const lastError = ref<string | null>(null);

  const pendingCount = computed(() => pending.value.length);

  async function refresh() {
    pending.value = await queueAll();
  }

  /**
   * Enqueue a cash order (create, then optionally transition). Returns the
   * clientId so the UI can show an optimistic record. The real OrderView
   * arrives after flush; offline, the order exists only locally until then.
   */
  async function enqueueCashOrder(
      request: PosOrderRequest,
      note = 'cash payment (POS)',
  ): Promise<string> {
    const op: QueuedOp = {
      kind: 'create_order',
      enqueuedAt: new Date().toISOString(),
      payload: {request, thenStatus: 'PAID', note} as CreateOrderPayload,
      attempts: 0,
      clientId: clientId('order'),
    };
    await queueAdd(op);
    await refresh();
    // Best-effort immediate flush if we think we're online.
    void flush();
    return op.clientId;
  }

  async function enqueueStatus(
      orderId: string,
      status: string,
      note?: string,
  ): Promise<string> {
    const op: QueuedOp = {
      kind: 'update_status',
      enqueuedAt: new Date().toISOString(),
      payload: {orderId, status, note} as UpdateStatusPayload,
      attempts: 0,
      clientId: clientId('status'),
    };
    await queueAdd(op);
    await refresh();
    void flush();
    return op.clientId;
  }

  /** Process the queue in order. Stops on the first op that can't complete. */
  async function flush(): Promise<void> {
    if (flushing.value) return;
    const connectivity = useConnectivityStore();
    if (!connectivity.online) {
      // Verify before giving up — the flag may be stale.
      const ok = await connectivity.check();
      if (!ok) return;
    }

    flushing.value = true;
    lastError.value = null;
    try {
      const ops = await queueAll(); // already FIFO by autoIncrement seq
      for (const op of ops) {
        try {
          await runOp(op);
          if (op.seq !== undefined) await queueDelete(op.seq);
        } catch (e) {
          op.attempts += 1;
          if (op.seq !== undefined) await queuePut(op);
          const transient =
              e instanceof ApiError && (e.status === 0 || e.status >= 500);
          lastError.value =
              e instanceof Error ? e.message : 'Sync failed';
          if (transient) {
            // Network/server problem — stop, keep order, retry later.
            break;
          }
          // 4xx (bad request, auth) — non-transient. Leave it queued and
          // surface the error rather than spinning; a person must look.
          break;
        }
      }
    } finally {
      await refresh();
      flushing.value = false;
    }
  }

  async function runOp(op: QueuedOp): Promise<OrderView | void> {
    if (op.kind === 'create_order') {
      const p = op.payload as CreateOrderPayload;
      const created = await createPosOrder(p.request);
      if (p.thenStatus) {
        return confirmCashPayment(created.id, p.note);
      }
      return created;
    }
    if (op.kind === 'update_status') {
      const p = op.payload as UpdateStatusPayload;
      return updateOrderStatus(p.orderId, p.status, p.note);
    }
  }

  return {
    pending,
    pendingCount,
    flushing,
    lastError,
    refresh,
    enqueueCashOrder,
    enqueueStatus,
    flush,
  };
});