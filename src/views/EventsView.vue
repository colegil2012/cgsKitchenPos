<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref, watch} from 'vue';
import {useEventStore} from '../stores/event';
import {useSummaryStore} from '../stores/summary';
import {useConnectivityStore} from '../stores/connectivity';
import {money} from '../lib/format';

const eventStore = useEventStore();
const summaryStore = useSummaryStore();
const connectivity = useConnectivityStore();

const live = computed(() => eventStore.live);
const next = computed(() => eventStore.next);

// ---- activation (when no event live) ----
const opensInLabel = computed(() => {
  const ms = eventStore.activatesInMs;
  if (ms === null || ms <= 0) return null;
  const mins = Math.ceil(ms / 60000);
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins} min`;
});

function fmtWindow(startAt: string | null, endAt: string | null): string {
  if (!startAt) return '';
  const s = new Date(startAt);
  const startStr = s.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
  if (!endAt) return startStr;
  const e = new Date(endAt);
  return `${startStr} – ${e.toLocaleString(undefined, {hour: 'numeric', minute: '2-digit'})}`;
}

async function onActivate() {
  if (!next.value) return;
  await eventStore.activate(next.value.id);
}

// ---- summary (when event live) ----
const orderSearch = ref('');

const filteredOrders = computed(() => {
  const s = summaryStore.summary;
  if (!s) return [];
  const q = orderSearch.value.trim().toLowerCase();
  if (!q) return s.income.orders;
  return s.income.orders.filter(o =>
    (o.customerName ?? '').toLowerCase().includes(q) ||
    o.orderId.toLowerCase().includes(q) ||
    o.paymentMethod.toLowerCase().includes(q) ||
    (o.fulfillment ?? '').toLowerCase().includes(q),
  );
});

const expandedItems = ref<Set<string>>(new Set());
function toggleItem(name: string) {
  const n = new Set(expandedItems.value);
  n.has(name) ? n.delete(name) : n.add(name);
  expandedItems.value = n;
}

function pmLabel(pm: string): string {
  switch (pm) {
    case 'CASH': return 'Cash';
    case 'CARD': return 'Card';
    case 'OTHER': return 'Other';
    default: return 'Unpaid';
  }
}
function shortId(id: string) { return id.slice(-6).toUpperCase(); }

// Load summary whenever a live event is present; refresh periodically.
let refreshTimer: number | undefined;
watch(
  () => live.value?.id,
  id => {
    if (id) summaryStore.load(id);
    else summaryStore.clear();
  },
  {immediate: true},
);

onMounted(() => {
  eventStore.load(true);
  refreshTimer = window.setInterval(() => {
    if (live.value?.id) summaryStore.load(live.value.id, false);
  }, 30000);
});
onUnmounted(() => {
  if (refreshTimer !== undefined) clearInterval(refreshTimer);
});
</script>

<template>
  <div class="view">
    <header class="bar">
      <h2 class="title">Events</h2>
      <button class="refresh tap" aria-label="Refresh"
        @click="live ? (live && summaryStore.load(live.id)) : eventStore.load(true)">
        ↻
      </button>
    </header>

    <p v-if="!connectivity.online" class="offline">
      Offline — event data is last-known; summary won't update until reconnected.
    </p>

    <div class="scroll body">
      <!-- ============ LIVE EVENT DASHBOARD ============ -->
      <template v-if="live">
        <!-- Current event header -->
        <section class="card header-card">
          <div class="status-row">
            <span class="dot" />
            <span class="status-label">Live now</span>
          </div>
          <div class="ev-title">{{ live.title }}</div>
          <div v-if="live.location" class="ev-loc">{{ live.location }}</div>
          <div class="ev-window">{{ fmtWindow(live.startAt, live.endAt) }}</div>
          <div v-if="live.recurring && live.recurrenceLabel" class="ev-recur">
            {{ live.recurrenceLabel }}
          </div>
        </section>

        <div class="dash-grid">
          <!-- Income -->
          <section class="card income-card">
            <div class="card-head">
              <span class="card-title">Income</span>
              <span class="counted">
                {{ summaryStore.summary?.income.countedOrders ?? 0 }} orders
              </span>
            </div>

            <input
              v-model="orderSearch"
              class="search"
              type="text"
              placeholder="Search orders…" />

            <div class="scroll order-list">
              <div v-if="summaryStore.loading && !summaryStore.summary" class="muted">
                Loading…
              </div>
              <div v-else-if="filteredOrders.length === 0" class="muted">
                No orders yet.
              </div>
              <div
                v-for="o in filteredOrders"
                :key="o.orderId"
                class="order-row"
                :class="{voided: !o.countedInTotal}">
                <div class="o-main">
                  <span class="o-name">
                    {{ o.customerName || ('#' + shortId(o.orderId)) }}
                  </span>
                  <span class="o-meta">
                    {{ pmLabel(o.paymentMethod) }}
                    <template v-if="o.fulfillment"> · {{ o.fulfillment }}</template>
                    <template v-if="!o.countedInTotal"> · {{ o.status }}</template>
                  </span>
                </div>
                <span class="o-total">{{ money(o.totalCents) }}</span>
              </div>
            </div>

            <div class="totals" v-if="summaryStore.summary">
              <div class="t-row">
                <span>Cash</span>
                <span>{{ money(summaryStore.summary.income.cashCents) }}</span>
              </div>
              <div class="t-row">
                <span>Card</span>
                <span>{{ money(summaryStore.summary.income.cardCents) }}</span>
              </div>
              <div class="t-row" v-if="summaryStore.summary.income.otherCents > 0">
                <span>Other</span>
                <span>{{ money(summaryStore.summary.income.otherCents) }}</span>
              </div>
              <div class="t-row grand">
                <span>Total</span>
                <span>{{ money(summaryStore.summary.income.totalCents) }}</span>
              </div>
            </div>
          </section>

          <!-- Items sold -->
          <section class="card items-card">
            <div class="card-head">
              <span class="card-title">Items Sold</span>
            </div>
            <div class="scroll item-list">
              <div v-if="summaryStore.loading && !summaryStore.summary" class="muted">
                Loading…
              </div>
              <div
                v-else-if="!summaryStore.summary || summaryStore.summary.itemsSold.length === 0"
                class="muted">
                Nothing sold yet.
              </div>
              <div
                v-for="item in summaryStore.summary?.itemsSold ?? []"
                :key="item.name"
                class="item-block">
                <button class="item-row tap" @click="toggleItem(item.name)">
                  <span class="i-qty">{{ item.quantity }}</span>
                  <span class="i-name">{{ item.name }}</span>
                  <span class="i-rev">{{ money(item.revenueCents) }}</span>
                  <span v-if="item.variants.length > 1" class="i-exp">
                    {{ expandedItems.has(item.name) ? '▾' : '▸' }}
                  </span>
                </button>
                <div
                  v-if="expandedItems.has(item.name) && item.variants.length > 1"
                  class="variants">
                  <div v-for="(v, i) in item.variants" :key="i" class="variant-row">
                    <span class="v-qty">{{ v.quantity }}</span>
                    <span class="v-mods">
                      {{ v.modifiers.length ? v.modifiers.join(', ') : 'plain' }}
                    </span>
                    <span class="v-rev">{{ money(v.revenueCents) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <p v-if="summaryStore.error" class="err">{{ summaryStore.error }}</p>
        <p class="reconcile-note">
          Reflects synced orders only — offline orders count once they upload.
        </p>
      </template>

      <!-- ============ NO LIVE EVENT — activation ============ -->
      <template v-else>
        <section v-if="next" class="card activate-card">
          <div class="eyebrow">Next event</div>
          <div class="ev-title">{{ next.title }}</div>
          <div v-if="next.location" class="ev-loc">{{ next.location }}</div>
          <div class="ev-window">
            {{ next.recurring && next.recurrenceLabel
              ? next.recurrenceLabel
              : fmtWindow(next.startAt, next.endAt) }}
          </div>
          <button
            class="activate tap"
            :disabled="!eventStore.canActivateNext || eventStore.activating || !connectivity.online"
            @click="onActivate">
            {{ eventStore.activating ? 'Activating…' : 'Activate Event' }}
          </button>
          <p v-if="!eventStore.canActivateNext && opensInLabel" class="hint">
            Activates in {{ opensInLabel }}
          </p>
          <p v-else-if="!connectivity.online" class="hint">
            Offline — reconnect to activate
          </p>
          <p v-if="eventStore.error" class="err">{{ eventStore.error }}</p>
        </section>

        <section v-else class="card empty-card">
          <div class="eyebrow">No event scheduled</div>
          <p class="muted">
            Nothing on the calendar. Orders can't be taken until an event is
            active. Schedule events from the admin portal.
          </p>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.view { height: 100%; display: flex; flex-direction: column; }
.bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px;
}
.title { font-size: var(--fs-3xl); }
.refresh {
  width: 44px; height: 44px; font-size: 20px;
  color: var(--color-orange); border: 1px solid var(--color-border);
  border-radius: var(--radius-sm); background: var(--color-white);
}
.offline {
  background: var(--color-honey); color: var(--color-ink);
  font-size: 13px; font-weight: 600; text-align: center;
  padding: 8px 16px; margin: 0;
}
.body { flex: 1; padding: 16px; }

.card {
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 20px;
}

/* header */
.header-card { border-color: var(--color-grass); text-align: center; margin-bottom: 16px; }
.status-row { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.dot {
  width: 9px; height: 9px; border-radius: 50%;
  background: var(--color-grass); animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
.status-label {
  font-family: var(--font-mono); font-size: 12px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.1em; color: var(--color-grass);
}
.ev-title { font-family: var(--font-display); font-size: var(--fs-3xl); color: var(--color-ink); }
.ev-loc { font-size: 15px; color: var(--color-muted); margin-top: 4px; }
.ev-window { font-family: var(--font-mono); font-size: 14px; color: var(--color-ink-soft); margin-top: 8px; }
.ev-recur { font-family: var(--font-mono); font-size: 12px; color: var(--color-muted); margin-top: 4px; }

/* dashboard grid: two half-screen cards side by side, stack on narrow */
.dash-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 760px) {
  .dash-grid { grid-template-columns: 1fr; }
}

.card-head {
  display: flex; align-items: baseline; justify-content: space-between;
  margin-bottom: 12px;
}
.card-title {
  font-family: var(--font-display); font-size: var(--fs-xl); color: var(--color-ink);
}
.counted { font-family: var(--font-mono); font-size: 12px; color: var(--color-muted); }

/* income */
.search {
  width: 100%; padding: 10px 12px; margin-bottom: 12px;
  border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  font: inherit; font-size: 14px; background: var(--color-paper);
  color: var(--color-ink);
}
.order-list { max-height: 320px; display: flex; flex-direction: column; gap: 6px; }
.order-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 10px; border-radius: var(--radius-sm);
  background: var(--color-paper-2);
}
.order-row.voided { opacity: 0.55; }
.o-main { display: flex; flex-direction: column; min-width: 0; }
.o-name { font-weight: 600; color: var(--color-ink); font-size: 14px; }
.o-meta { font-family: var(--font-mono); font-size: 11px; color: var(--color-muted); }
.o-total { font-family: var(--font-mono); font-weight: 700; color: var(--color-ink); }
.totals { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--color-border); }
.t-row {
  display: flex; justify-content: space-between; padding: 3px 0;
  font-size: 14px; color: var(--color-muted);
}
.t-row span:last-child { font-family: var(--font-mono); }
.t-row.grand {
  margin-top: 6px; padding-top: 8px; border-top: 1px solid var(--color-border);
  color: var(--color-ink); font-weight: 700; font-size: 16px;
}
.t-row.grand span:last-child { color: var(--color-gold-dark); }

/* items */
.item-list { max-height: 380px; display: flex; flex-direction: column; gap: 4px; }
.item-block { border-bottom: 1px solid var(--color-border); }
.item-row {
  width: 100%; display: grid;
  grid-template-columns: 40px 1fr auto 20px;
  align-items: center; gap: 8px; padding: 8px 4px; text-align: left;
}
.i-qty {
  font-family: var(--font-mono); font-weight: 700; color: var(--color-orange);
  text-align: center;
}
.i-name { color: var(--color-ink); font-size: 14px; }
.i-rev { font-family: var(--font-mono); font-size: 13px; color: var(--color-muted); }
.i-exp { color: var(--color-muted); font-size: 12px; }
.variants { padding: 0 4px 8px 48px; display: flex; flex-direction: column; gap: 4px; }
.variant-row {
  display: grid; grid-template-columns: 32px 1fr auto; gap: 8px;
  font-size: 13px; color: var(--color-ink-soft);
}
.v-qty { font-family: var(--font-mono); text-align: center; color: var(--color-muted); }
.v-mods { }
.v-rev { font-family: var(--font-mono); color: var(--color-muted); }

/* activation (no live event) */
.activate-card, .empty-card { max-width: 560px; margin: 0 auto; text-align: center; }
.eyebrow {
  font-family: var(--font-mono); font-size: 11px; text-transform: uppercase;
  letter-spacing: 0.15em; color: var(--color-muted);
}
.activate {
  margin-top: 20px; min-height: 56px; width: 100%; max-width: 340px;
  background: var(--color-orange); color: var(--color-white);
  border-radius: var(--radius-md); font-family: var(--font-display);
  font-size: 19px; font-weight: 700;
}
.activate:disabled { opacity: 0.4; }
.hint { font-family: var(--font-mono); font-size: 12px; color: var(--color-muted); margin: 10px 0 0; }

.muted { color: var(--color-muted); font-size: 14px; padding: 8px 0; }
.err { color: var(--color-danger); font-size: 13px; text-align: center; margin: 12px 0 0; }
.reconcile-note {
  font-family: var(--font-mono); font-size: 11px; color: var(--color-muted);
  text-align: center; margin: 16px 0 0;
}
</style>