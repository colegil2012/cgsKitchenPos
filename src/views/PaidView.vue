<script setup lang="ts">
import {computed} from 'vue';
import AppButton from '../components/AppButton.vue';
import {money} from '../lib/format';

const props = defineProps<{
  method: 'cash' | 'card';
  queued: boolean;
  totalCents: number;
}>();
defineEmits<{(e: 'new-order'): void}>();

// Three real outcomes, derived from method + queued (card is online-only,
// so there is no card-queued case):
//   cash + online  -> Paid, cash
//   cash + offline -> Saved offline, will sync
//   card           -> Paid, card
const view = computed(() => {
  if (props.queued) {
    return {
      state: 'queued' as const,
      icon: '⤴',
      title: 'Saved offline',
      note: 'Cash order saved. It will sync automatically when the connection returns.',
    };
  }
  if (props.method === 'card') {
    return {
      state: 'card' as const,
      icon: '✓',
      title: 'Card approved',
      note: 'Order sent to the kitchen.',
    };
  }
  return {
    state: 'cash' as const,
    icon: '✓',
    title: 'Cash received',
    note: 'Order sent to the kitchen.',
  };
});
</script>

<template>
  <div class="overlay">
    <div class="center">
      <div class="circle" :class="view.state">
        <span>{{ view.icon }}</span>
      </div>
      <h1>{{ view.title }}</h1>
      <p class="amount">{{ money(totalCents) }}</p>
      <p class="note" :class="{ok: view.state !== 'queued'}">{{ view.note }}</p>
    </div>
    <div class="footer">
      <AppButton label="New Order" @click="$emit('new-order')" />
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: absolute;
  inset: 0;
  background: var(--color-paper);
  display: flex;
  flex-direction: column;
  z-index: 30;
}
.center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
}
.circle {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  color: var(--color-white);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 44px;
  font-weight: 800;
  margin-bottom: 12px;
}
/* cash = grass, card = orange (matches the pay buttons), queued = gold */
.circle.cash {
  background: var(--color-grass);
}
.circle.card {
  background: var(--color-gold-dark);
}
.circle.queued {
  background: var(--color-orange-dim);
}
h1 {
  font-size: 30px;
}
.amount {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 800;
  color: var(--color-gold-dark);
  margin: 4px 0;
}
.note {
  color: var(--color-muted);
  text-align: center;
  max-width: 32ch;
}
.note.ok {
  color: var(--color-grass);
}
.footer {
  padding: 16px 16px 20px;
}
.footer :deep(.btn) {
  width: 100%;
}
</style>