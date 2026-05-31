<script setup lang="ts">
import {onMounted} from 'vue';
import {useMenuStore} from '../stores/menu';
import {useCartStore} from '../stores/cart';
import type {MenuItemView} from '../types/menu';
import MenuCard from '../components/MenuCard.vue';
import AppButton from '../components/AppButton.vue';
import {money} from '../lib/format';

defineEmits<{
  (e: 'select', item: MenuItemView): void;
  (e: 'open-cart'): void;
}>();

const menu = useMenuStore();
const cart = useCartStore();

onMounted(() => {
  if (menu.items.length === 0) menu.load();
});
</script>

<template>
  <div class="view">
    <div v-if="menu.stale" class="stale">
      Showing cached menu — may be out of date. Will refresh when back online.
    </div>

    <div v-if="menu.loading && menu.items.length === 0" class="center">
      <div class="spinner" />
      <p>Loading menu…</p>
    </div>

    <div v-else-if="menu.error && menu.items.length === 0" class="center">
      <h2>Menu unavailable</h2>
      <p class="muted">{{ menu.error }}</p>
      <AppButton label="Retry" @click="menu.load()" />
    </div>

    <div v-else class="scroll body">
      <section v-for="section in menu.sections" :key="section.categoryName" class="section">
        <h2 class="section-title">{{ section.categoryName }}</h2>
        <div class="grid">
          <div v-for="mi in section.items" :key="mi.id" class="cell">
            <MenuCard :item="mi" @select="$emit('select', $event)" />
          </div>
        </div>
      </section>
    </div>

    <div v-if="cart.count > 0" class="cartbar">
      <div>
        <div class="cb-count">{{ cart.count }} {{ cart.count === 1 ? 'item' : 'items' }}</div>
        <div class="cb-total">{{ money(cart.totalCents) }} total</div>
      </div>
      <AppButton label="View Order ›" @click="$emit('open-cart')" />
    </div>
  </div>
</template>

<style scoped>
.view {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.stale {
  background: var(--color-honey);
  color: var(--color-ink);
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  padding: 8px 16px;
}
.center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.muted {
  color: var(--color-muted);
  text-align: center;
  max-width: 30ch;
}
.body {
  flex: 1;
  padding-bottom: 120px;
  padding-left: 16px;
}
.section {
  margin-bottom: 16px;
}
.section-title {
  font-size: 22px;
  color: var(--color-gold-dark);
  padding: 16px 16px 4px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  padding: 0 12px;
}
.cartbar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px 20px;
  background: var(--color-paper-2);
  border-top: 1px solid var(--color-border);
}
.cartbar :deep(.btn) {
  flex: 1;
}
.cb-count {
  font-size: 14px;
  color: var(--color-muted);
}
.cb-total {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
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