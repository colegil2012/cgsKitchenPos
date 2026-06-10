<script setup lang="ts">
import {computed} from 'vue';
import type {MenuItemView} from '../types/menu';
import {useInventoryStore} from '../stores/inventory';
import {useConnectivityStore} from '../stores/connectivity';
import {money} from '../lib/format';

const props = defineProps<{item: MenuItemView}>();

const inventory = useInventoryStore();
const connectivity = useConnectivityStore();

const itemBusy = computed(() => inventory.working.has(props.item.id));
const disabled = computed(() => itemBusy.value || !connectivity.online);
</script>

<template>
  <div class="row" :class="{off: !item.available}">
    <div class="info">
      <span class="name">{{ item.name }}</span>
      <span class="price">{{ item.priceDisplay || money(item.priceCents) }}</span>
    </div>
    <button
      class="toggle tap"
      :class="item.available ? 'on' : 'off'"
      :disabled="disabled"
      @click="inventory.toggleItem(item)">
      {{ itemBusy ? '…' : item.available ? 'In' : "Out" }}
    </button>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
}
.row.off {
  background: var(--color-paper-2);
  opacity: 0.8;
}
.info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.name {
  font-weight: 600;
  color: var(--color-ink);
}
.price {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--color-muted);
}
.toggle {
  flex-shrink: 0;
  min-width: 72px;
  height: 44px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 14px;
  border: 1.5px solid transparent;
}
.toggle.on {
  background: var(--color-grass);
  color: var(--color-white);
}
.toggle.off {
  background: transparent;
  color: var(--color-danger);
  border-color: var(--color-danger);
}
.toggle:disabled {
  opacity: 0.4;
}
</style>