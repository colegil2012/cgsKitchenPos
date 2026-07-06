<script setup lang="ts">
import {computed} from 'vue';
import type {PendingOrder} from '../stores/orders';
import {money} from '../lib/format';

const props = defineProps<{order: PendingOrder}>();

const itemCount = computed(() =>
  props.order.items.reduce((n, i) => n + i.quantity, 0),
);

const shortId = computed(() =>
  props.order.clientId.slice(-6).toUpperCase(),
);

/** Minutes since the order was queued. */
const ageMin = computed(() => {
  const t = new Date(props.order.enqueuedAt).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 60000));
});
</script>

<template>
  <div class="card pending">
    <div class="head">
      <span class="id">#{{ shortId }}</span>
      <span class="badge">PENDING SYNC</span>
    </div>

    <div class="items">
      <div v-for="(it, i) in order.items" :key="i" class="item">
        <span class="qty">{{ it.quantity }}×</span>
        <span class="name">{{ it.name }}</span>
      </div>
    </div>

    <div class="meta">
      <span>{{ itemCount }} {{ itemCount === 1 ? 'item' : 'items' }}</span>
      <span class="total">~{{ money(order.totalCents) }}</span>
    </div>

    <p class="hint">
      Saved offline<span v-if="ageMin !== null"> · {{ ageMin }}m ago</span>.
      Will sync and become workable when the connection returns.
    </p>
  </div>
</template>

<style scoped>
.card {
  background: var(--color-paper);
  border: 2px dashed var(--color-gold-darker);
  border-radius: var(--radius-md);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  opacity: 0.92;
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
.badge {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--color-white);
  background: var(--color-gold-dark);
  padding: 3px 7px;
  border-radius: var(--radius-full);
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
.hint {
  font-size: 11px;
  color: var(--color-muted);
  margin: 0;
  line-height: 1.35;
}
</style>