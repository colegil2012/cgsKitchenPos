<script setup lang="ts">
import {ref, onBeforeUnmount} from 'vue';
import {useCartStore} from '../stores/cart';
import {useConnectivityStore} from '../stores/connectivity';
import {useSyncStore} from '../stores/sync';
import {useEventStore} from '../stores/event';
import {
  lookupCustomer,
  collectCardPayment,
  cancelCardPayment,
  fetchOrder,
  ApiError,
} from '../api/client';
import {
  selectionSummary,
  unitPriceCents,
  lineTotalCents,
} from '../lib/cart';
import AppButton from '../components/AppButton.vue';
import {money} from '../lib/format';

const emit = defineEmits<{
  (e: 'close'): void;
  (
    e: 'paid',
    info: {method: 'cash' | 'card'; queued: boolean; totalCents: number},
  ): void;
}>();

const cart = useCartStore();
const connectivity = useConnectivityStore();
const sync = useSyncStore();
const eventStore = useEventStore();
const submitting = ref(false);

// ---- optional customer attachment (email lookup) ----
const showLookup = ref(false);
const email = ref('');
const looking = ref(false);
const lookupMsg = ref<string | null>(null);
const attached = ref<{userId: string; customerName: string | null} | null>(null);

async function doLookup() {
  const e = email.value.trim();
  if (!e) return;
  looking.value = true;
  lookupMsg.value = null;
  try {
    const match = await lookupCustomer(e);
    if (match) {
      attached.value = {userId: match.userId, customerName: match.displayName};
      lookupMsg.value = null;
    } else {
      attached.value = null;
      lookupMsg.value = 'No registered customer with that email.';
    }
  } catch {
    lookupMsg.value = 'Lookup failed — check the connection.';
  } finally {
    looking.value = false;
  }
}

function clearCustomer() {
  attached.value = null;
  email.value = '';
  lookupMsg.value = null;
  showLookup.value = false;
}

async function payCash() {
  if (cart.lines.length === 0) return;
  // No live event → no valid eventId → the server would reject the order.
  // Block at the UI with a clear message rather than letting it fail.
  if (!eventStore.activeEventId) {
    return;
  }
  submitting.value = true;
  try {
    const total = cart.totalCents;
    // Capture the active eventId at ring-up. For offline orders this rides
    // in the queued op, binding the sale to its event even if flushed later.
    // attached (if set) attributes the sale to a registered customer.
    const req = cart.toOrderRequest(eventStore.activeEventId, attached.value);
    await sync.enqueueCashOrder(req);
    // "Queued" means THIS sale couldn't reach the server and is waiting to
    // sync — i.e. we're offline. It must NOT depend on unrelated items already
    // in the queue (an online sale is still an online sale even if the queue
    // holds older entries).
    const queued = !connectivity.online;
    cart.clear();
    clearCustomer();
    emit('paid', {method: 'cash', queued, totalCents: total});
  } finally {
    submitting.value = false;
  }
}

// ---- card payment (server-driven Terminal / S710) -----------------------
// Card is ONLINE-ONLY and asynchronous: create the order, push it to the
// reader, then poll the order until the webhook flips it to PAID.

type CardPhase =
  | 'idle'
  | 'creating'   // creating the order on the server
  | 'collecting' // reader is prompting; customer taps/inserts
  | 'failed';
const cardPhase = ref<CardPhase>('idle');
const cardError = ref<string | null>(null);
let pollTimer: number | undefined;
let pollDeadline = 0;
let activeCardOrderId: string | null = null;

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 90000; // ~90s for the customer to present a card

function stopPolling() {
  if (pollTimer !== undefined) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
}

async function payCard() {
  if (cart.lines.length === 0) return;
  if (!eventStore.activeEventId) return;
  // Card needs connectivity — no offline queueing.
  if (!connectivity.online) {
    cardError.value = 'Card payments need a connection. Use cash while offline.';
    cardPhase.value = 'failed';
    return;
  }

  cardError.value = null;
  cardPhase.value = 'creating';
  const total = cart.totalCents;

  try {
    // 1) Create the order on the server (PENDING_PAYMENT). Cart is preserved
    //    until the card actually succeeds, so a decline is recoverable.
    const orderId = await cart.createCardOrder(
      eventStore.activeEventId,
      attached.value,
    );
    activeCardOrderId = orderId;

    // 2) Push the intent to the reader.
    cardPhase.value = 'collecting';
    await collectCardPayment(orderId);

    // 3) Poll the order until the webhook marks it PAID (or we time out).
    pollDeadline = Date.now() + POLL_TIMEOUT_MS;
    stopPolling();
    pollTimer = window.setInterval(async () => {
      if (Date.now() > pollDeadline) {
        stopPolling();
        cardError.value =
          'Timed out waiting for payment. Check the reader, or cancel and retry.';
        cardPhase.value = 'failed';
        return;
      }
      try {
        const order = await fetchOrder(orderId);
        if (order.status === 'PAID') {
          stopPolling();
          cart.clear();
          clearCustomer();
          activeCardOrderId = null;
          cardPhase.value = 'idle';
          emit('paid', {method: 'card', queued: false, totalCents: total});
        } else if (
          order.status === 'CANCELLED' ||
          order.status === 'REFUNDED'
        ) {
          stopPolling();
          cardError.value = 'Payment was cancelled.';
          cardPhase.value = 'failed';
        }
        // else still PENDING_PAYMENT — keep polling.
      } catch {
        // Transient fetch error — keep polling until the deadline.
      }
    }, POLL_INTERVAL_MS);
  } catch (e) {
    const msg =
      e instanceof ApiError
        ? e.status === 0
          ? 'Lost connection during card payment.'
          : e.message
        : 'Could not start the card payment.';
    cardError.value = msg;
    cardPhase.value = 'failed';
  }
}

/** Cashier aborts: clear the reader prompt and reset. The order stays
 *  PENDING_PAYMENT on the server (can be paid by cash or retried). */
async function cancelCard() {
  stopPolling();
  try {
    await cancelCardPayment();
  } catch {
    /* reader may already be idle — ignore */
  }
  activeCardOrderId = null;
  cardPhase.value = 'idle';
  cardError.value = null;
}

function dismissCardError() {
  cardPhase.value = 'idle';
  cardError.value = null;
}

onBeforeUnmount(stopPolling);
</script>

<template>
  <div class="overlay">
    <!-- Card payment status overlay (server-driven Terminal / S710) -->
    <div v-if="cardPhase !== 'idle'" class="card-modal">
      <div class="card-box">
        <template v-if="cardPhase === 'creating'">
          <div class="spinner" />
          <p class="card-head">Starting payment…</p>
        </template>
        <template v-else-if="cardPhase === 'collecting'">
          <div class="reader-pulse" />
          <p class="card-head">Present card on reader</p>
          <p class="card-sub">Tap, insert, or swipe on the terminal.</p>
          <button class="card-cancel tap" @click="cancelCard">Cancel</button>
        </template>
        <template v-else-if="cardPhase === 'failed'">
          <p class="card-head fail">Payment not completed</p>
          <p class="card-sub">{{ cardError }}</p>
          <div class="card-actions">
            <button class="card-retry tap" @click="payCard">Try again</button>
            <button class="card-dismiss tap" @click="dismissCardError">
              Back to order
            </button>
          </div>
        </template>
      </div>
    </div>

    <div class="topbar">
      <button class="link tap" @click="emit('close')">‹ Menu</button>
      <span class="title">Current Order</span>
      <button
        v-if="cart.lines.length"
        class="link clear tap"
        @click="cart.clear()">
        Clear
      </button>
      <span v-else class="link" />
    </div>

    <div v-if="cart.lines.length === 0" class="empty">
      <p>No items yet</p>
      <AppButton label="Browse Menu" variant="ghost" @click="emit('close')" />
    </div>

    <template v-else>
      <div class="scroll list">
        <div v-for="line in cart.lines" :key="line.lineId" class="line">
          <div class="main">
            <div class="name">{{ line.item.name }}</div>
            <div v-if="selectionSummary(line)" class="opts">
              {{ selectionSummary(line).trim() }}
            </div>
            <div class="unit">{{ money(unitPriceCents(line)) }} each</div>
          </div>
          <div class="right">
            <div class="total">{{ money(lineTotalCents(line)) }}</div>
            <div class="stepper">
              <button class="step tap" @click="cart.setQty(line.lineId, line.quantity - 1)">−</button>
              <span class="qv">{{ line.quantity }}</span>
              <button class="step tap" @click="cart.setQty(line.lineId, line.quantity + 1)">+</button>
            </div>
            <button class="remove tap" @click="cart.remove(line.lineId)">Remove</button>
          </div>
        </div>
      </div>

      <div class="footer">
        <div class="row"><span>Subtotal</span><span>{{ money(cart.subtotalCents) }}</span></div>
        <div class="row"><span>Tax (7%)</span><span>{{ money(cart.taxCents) }}</span></div>
        <div class="row grand"><span>Total</span><span class="gv">{{ money(cart.totalCents) }}</span></div>

        <!-- Optional customer attachment -->
        <div class="customer">
          <div v-if="attached" class="cust-attached">
            <span class="cust-name">
              ✓ {{ attached.customerName || 'Registered customer' }}
            </span>
            <button class="cust-clear" @click="clearCustomer">Remove</button>
          </div>
          <template v-else>
            <button v-if="!showLookup" class="cust-add" @click="showLookup = true">
              + Attach customer
            </button>
            <div v-else class="cust-lookup">
              <input
                v-model="email"
                class="cust-input"
                type="email"
                placeholder="Customer email"
                @keyup.enter="doLookup" />
              <button class="cust-go" :disabled="looking" @click="doLookup">
                {{ looking ? '…' : 'Find' }}
              </button>
              <button class="cust-cancel" @click="clearCustomer">✕</button>
            </div>
            <p v-if="lookupMsg" class="cust-msg">{{ lookupMsg }}</p>
          </template>
        </div>

        <p v-if="!connectivity.online" class="offline-note">
          Offline — order will be saved and synced when the connection returns.
        </p>
        <p v-if="!eventStore.activeEventId" class="no-event-note">
          No active event — activate one on the Events tab before taking orders.
        </p>
        <div class="pay-btn-container">
          <AppButton
            :label="`Pay Cash · ${money(cart.totalCents)}`"
            variant="success"
            :loading="submitting"
            :disabled="!eventStore.activeEventId"
            @click="payCash" />
          <AppButton
            :label="`Pay Card · ${money(cart.totalCents)}`"
            variant="primary"
            :disabled="!eventStore.activeEventId || !connectivity.online"
            @click="payCard" />
        </div>
        <p
          v-if="!connectivity.online"
          class="card-offline-note">
          Card needs a connection — cash only while offline.
        </p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.overlay {
  position: absolute;
  inset: 0;
  background: var(--color-paper);
  display: flex;
  flex-direction: column;
  z-index: 20;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
}
.link {
  min-width: 64px;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-orange);
}
.clear {
  color: var(--color-danger);
  text-align: right;
}
.title {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
}
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--color-muted);
}
.list {
  flex: 1;
  padding: 16px;
}
.line {
  display: flex;
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 12px;
}
.main {
  flex: 1;
  padding-right: 12px;
}
.name {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
}
.opts {
  font-size: 14px;
  color: var(--color-gold-dark);
  margin-top: 2px;
}
.unit {
  font-size: 12px;
  color: var(--color-muted);
  margin-top: 4px;
}
.right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
}
.total {
  font-size: 18px;
  font-weight: 700;
}
.stepper {
  display: flex;
  align-items: center;
  background: var(--color-paper-2);
  border-radius: var(--radius-sm);
  margin: 8px 0;
}
.step {
  width: 44px;
  height: 44px;
  font-size: 24px;
  font-weight: 800;
  color: var(--color-orange);
}
.qv {
  min-width: 32px;
  text-align: center;
  font-size: 18px;
  font-weight: 700;
}
.remove {
  font-size: 14px;
  color: var(--color-danger);
}
.footer {
  padding: 16px 16px 20px;
  border-top: 1px solid var(--color-border);
  background: var(--color-white);
}
.row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  color: var(--color-muted);
}
.grand {
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
  color: var(--color-ink);
}
.grand span:first-child {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
}
.gv {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 800;
  color: var(--color-gold-dark);
}
.offline-note {
  font-size: 13px;
  color: var(--color-gold-dark);
  text-align: center;
  margin: 0 0 12px;
}
.customer {
  margin: 12px 0;
  padding: 12px 0;
  border-top: 1px solid var(--color-border);
}
.cust-add {
  background: transparent;
  color: var(--color-orange);
  font-weight: 600;
  font-size: 14px;
  padding: 4px 0;
}
.cust-lookup {
  display: flex;
  gap: 8px;
  align-items: center;
}
.cust-input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font: inherit;
  font-size: 14px;
  background: var(--color-white);
  color: var(--color-ink);
}
.cust-go {
  min-height: 40px;
  padding: 0 16px;
  background: var(--color-orange);
  color: var(--color-white);
  border-radius: var(--radius-sm);
  font-weight: 700;
  font-size: 14px;
}
.cust-go:disabled {
  opacity: 0.5;
}
.cust-cancel {
  width: 40px;
  height: 40px;
  background: transparent;
  color: var(--color-muted);
  font-size: 16px;
}
.cust-attached {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.cust-name {
  color: var(--color-grass);
  font-weight: 600;
  font-size: 14px;
}
.cust-clear {
  background: transparent;
  color: var(--color-danger);
  font-size: 13px;
}
.cust-msg {
  font-size: 13px;
  color: var(--color-muted);
  margin: 8px 0 0;
}
.no-event-note {
  font-size: 13px;
  color: var(--color-danger);
  text-align: center;
  margin: 0 0 12px;
}
.footer :deep(.btn) {
  width: 100%;
}
.card-offline-note {
  font-size: 12px;
  color: var(--color-muted);
  text-align: center;
  margin: 8px 0 0;
}
/* Card payment overlay */
.card-modal {
  position: absolute;
  inset: 0;
  background: rgba(38, 24, 18, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 40;
  padding: 24px;
}
.card-box {
  background: var(--color-paper);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 28px 24px;
  width: 100%;
  max-width: 360px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.card-head {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 700;
  color: var(--color-ink);
  margin: 0;
}
.card-head.fail {
  color: var(--color-danger);
}
.card-sub {
  font-size: 14px;
  color: var(--color-muted);
  margin: 0;
}
.reader-pulse {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--color-orange);
  animation: pulse 1.2s ease-in-out infinite;
}
.pay-btn-container {
  display: flex;
  flex-direction: row;
  gap: 12px;
}
/* Override the footer's default full-width button rule so the two pay
   buttons share the row evenly. :deep pierces into AppButton's root. */
.pay-btn-container :deep(.btn) {
  flex: 1 1 0;
  width: auto;
  min-width: 0;
}
@keyframes pulse {
  0%, 100% { transform: scale(0.85); opacity: 0.6; }
  50% { transform: scale(1.1); opacity: 1; }
}
.card-cancel {
  margin-top: 8px;
  min-height: 44px;
  padding: 0 20px;
  background: transparent;
  color: var(--color-danger);
  border: 1.5px solid var(--color-danger);
  border-radius: var(--radius-sm);
  font-weight: 700;
  font-size: 14px;
}
.card-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  margin-top: 8px;
}
.card-retry {
  min-height: 48px;
  background: var(--color-orange);
  color: var(--color-white);
  border-radius: var(--radius-sm);
  font-weight: 700;
  font-size: 16px;
}
.card-dismiss {
  min-height: 44px;
  background: transparent;
  color: var(--color-muted);
  font-weight: 600;
  font-size: 14px;
}
</style>