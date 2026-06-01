<script setup lang="ts">
import {computed} from 'vue';
import type {OrderView} from '../types/menu';
import {useOrdersStore} from '../stores/orders';
import {useConnectivityStore} from '../stores/connectivity';
import {money} from '../lib/format';

const props = defineProps<{order: OrderView}>();

const ordersStore = useOrdersStore();
const connectivity = useConnectivityStore();

const step = computed(() => ordersStore.nextStep(props.order));
const busy = computed(() => ordersStore.working.has(props.order.id));
const disabled = computed(() => busy.value || !connectivity.online);

const shortId = computed(() => props.order.id.slice(-6).toUpperCase());

const itemCount = computed(() =>
  props.order.items.reduce((n, i) => n + i.quantity, 0),
);

/** Minutes since the order was created — a rough "age" for kitchen triage. */
const ageMin = computed(() => {
  const created = new Date(props.order.createdAt).getTime();
  if (Number.isNaN(created)) return null;
  return Math.max(0, Math.round((Date.now() - created) / 60000));
});
</script>

<template>
  <div class="card">
    <div class="head">
      <span class="id">#{{ shortId }}</span>
      <span v-if="ageMin !== null" class="age" :class="{old: ageMin >= 15}">
        {{ ageMin }}m
      </span>
    </div>

    <div class="items">
      <div v-for="(it, i) in order.items" :key="i" class="item">
        <span class="qty">{{ it.quantity }}×</span>
        <span class="name">{{ it.name }}</span>
      </div>
    </div>

    <div class="meta">
      <span>{{ itemCount }} {{ itemCount === 1 ? 'item' : 'items' }}</span>
      <span class="total">{{ money(order.totalCents) }}</span>
    </div>

    <div class="actions">
      <button
        v-if="step"
        class="advance tap"
        :disabled="disabled"
        @click="ordersStore.advance(order)">
        {{ busy ? '…' : step.label }}
      </button>
      <button
        class="cancel tap"
        :disabled="disabled"
        @click="ordersStore.cancel(order)"
        aria-label="Cancel order">
        ✕
      </button>
    </div>
  </div>
</template>

<style scoped>
.card {
  background: var(--color-white);
  border: 2px solid var(--color-ink);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.id {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.5px;
  color: var(--color-ink);
}
.age {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-muted);
}
.age.old {
  color: var(--color-danger);
  font-weight: 700;
}
.items {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.item {
  display: flex;
  gap: 6px;
  font-size: 14px;
  line-height: 1.3;
}
.qty {
  color: var(--color-orange);
  font-weight: 700;
  font-family: var(--font-mono);
}
.name {
  color: var(--color-ink);
}
.meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--color-muted);
  border-top: 1px solid var(--color-border);
  padding-top: 8px;
}
.total {
  font-family: var(--font-mono);
  font-weight: 700;
  color: var(--color-ink);
}
.actions {
  display: flex;
  gap: 8px;
}
.advance {
  flex: 1;
  background: var(--color-grass-dark);
  color: var(--color-white);
  border-radius: var(--radius-sm);
  font-weight: 700;
  font-size: 14px;
  min-height: 44px;
  transition: filter 0.12s ease, transform 0.06s ease;
}
.advance:active:not(:disabled) {
  transform: scale(0.98);
  filter: brightness(0.92);
}
.cancel {
  width: 44px;
  min-height: 44px;
  background: transparent;
  color: var(--color-danger);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: 16px;
}
.advance:disabled,
.cancel:disabled {
  opacity: 0.4;
}
</style>