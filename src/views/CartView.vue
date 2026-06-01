<script setup lang="ts">
import {ref} from 'vue';
import {useCartStore} from '../stores/cart';
import {useConnectivityStore} from '../stores/connectivity';
import {useSyncStore} from '../stores/sync';
import {useEventStore} from '../stores/event';
import {lookupCustomer} from '../api/client';
import {
  selectionSummary,
  unitPriceCents,
  lineTotalCents,
} from '../lib/cart';
import AppButton from '../components/AppButton.vue';
import {money} from '../lib/format';

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'paid', info: {queued: boolean; totalCents: number}): void;
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
    const queued = !connectivity.online || sync.pendingCount > 0;
    cart.clear();
    clearCustomer();
    emit('paid', {queued, totalCents: total});
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="overlay">
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
        <AppButton
          :label="`Pay Cash · ${money(cart.totalCents)}`"
          variant="success"
          :loading="submitting"
          :disabled="!eventStore.activeEventId"
          @click="payCash" />
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
</style>