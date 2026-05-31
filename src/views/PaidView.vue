<script setup lang="ts">
import AppButton from '../components/AppButton.vue';
import {money} from '../lib/format';

defineProps<{queued: boolean; totalCents: number}>();
defineEmits<{(e: 'new-order'): void}>();
</script>

<template>
  <div class="overlay">
    <div class="center">
      <div class="circle" :class="{queued}">
        <span>{{ queued ? '⤴' : '✓' }}</span>
      </div>
      <h1>{{ queued ? 'Saved · Cash' : 'Paid · Cash' }}</h1>
      <p class="amount">{{ money(totalCents) }}</p>
      <p v-if="queued" class="note">
        Saved offline. It will sync automatically when the connection returns.
      </p>
      <p v-else class="note ok">Order sent to the kitchen.</p>
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
  background: var(--color-grass);
  color: var(--color-white);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 44px;
  font-weight: 800;
  margin-bottom: 12px;
}
.circle.queued {
  background: var(--color-gold-dark);
  color: var(--color-white);
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