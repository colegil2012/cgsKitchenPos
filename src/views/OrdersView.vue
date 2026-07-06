<script setup lang="ts">
import {onMounted, onUnmounted} from 'vue';
import {useOrdersStore, type BoardColumn} from '../stores/orders';
import {useConnectivityStore} from '../stores/connectivity';
import OrderCard from '../components/OrderCard.vue';
import PendingOrderCard from '../components/PendingOrderCard.vue';

const orders = useOrdersStore();
const connectivity = useConnectivityStore();

const columns: {key: BoardColumn; title: string}[] = [
  {key: 'PAID', title: 'New'},
  {key: 'IN_KITCHEN', title: 'In Kitchen'},
  {key: 'READY', title: 'Ready'},
];

onMounted(() => orders.startPolling());
onUnmounted(() => orders.stopPolling());
</script>

<template>
  <div class="view">
    <header class="bar">
      <h2 class="title">Orders</h2>
      <button class="refresh tap" @click="orders.load(true)" aria-label="Refresh">
        ↻
      </button>
    </header>

    <p v-if="!connectivity.online" class="offline">
      Offline — order actions are paused until the connection returns.
    </p>
    <p v-if="orders.error" class="err">{{ orders.error }}</p>

    <div v-if="orders.loading && orders.orders.length === 0" class="center">
      <div class="spinner" />
      <p>Loading orders…</p>
    </div>

    <div v-else class="board">
      <section v-for="col in columns" :key="col.key" class="column">
        <div class="col-head">
          <span class="col-title">{{ col.title }}</span>
          <span class="count">
            {{ orders.byColumn[col.key].length +
               (col.key === 'PAID' ? orders.pendingOrders.length : 0) }}
          </span>
        </div>
        <div class="scroll col-body">
          <!-- Queued offline orders sit at the top of the New column,
               read-only until they sync and become real server orders. -->
          <template v-if="col.key === 'PAID'">
            <PendingOrderCard
              v-for="p in orders.pendingOrders"
              :key="p.clientId"
              :order="p" />
          </template>
          <OrderCard
            v-for="o in orders.byColumn[col.key]"
            :key="o.id"
            :order="o" />
          <p
            v-if="orders.byColumn[col.key].length === 0 &&
                  !(col.key === 'PAID' && orders.pendingOrders.length)"
            class="empty">
            None
          </p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.view {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
}
.title {
  font-size: var(--fs-3xl);
}
.refresh {
  width: 44px;
  height: 44px;
  font-size: 20px;
  color: var(--color-orange);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-white);
}
.offline {
  background: var(--color-honey);
  color: var(--color-ink);
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  padding: 8px 16px;
  margin: 0;
}
.err {
  background: var(--color-danger);
  color: var(--color-white);
  font-size: 13px;
  text-align: center;
  padding: 8px 16px;
  margin: 0;
}
.center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--color-muted);
}
.board {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding: 0 16px 16px;
  min-height: 0;
}
.column {
  display: flex;
  flex-direction: column;
  background: var(--color-paper-2);
  border-radius: var(--radius-md);
  min-height: 0;
}
.col-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid var(--color-border);
}
.col-title {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--color-ink);
}
.count {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  color: var(--color-white);
  background: var(--color-gold-dark);
  min-width: 22px;
  height: 22px;
  border-radius: var(--radius-full);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
}
.col-body {
  flex: 1;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.empty {
  color: var(--color-muted);
  font-size: 13px;
  text-align: center;
  padding: 12px 0;
  margin: 0;
}
.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--color-paper-2);
  border-top-color: var(--color-orange);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>