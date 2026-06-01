<script setup lang="ts">
import {ref, onMounted, watch} from 'vue';
import type {MenuItemView} from './types/menu';
import {useConnectivityStore} from './stores/connectivity';
import {useSyncStore} from './stores/sync';
import {useEventStore} from './stores/event';
import StatusBadge from './components/StatusBadge.vue';
import MenuView from './views/MenuView.vue';
import OrdersView from './views/OrdersView.vue';
import InventoryView from './views/InventoryView.vue';
import ItemDetailView from './views/ItemDetailView.vue';
import CartView from './views/CartView.vue';
import PaidView from './views/PaidView.vue';
import EventsView from './views/EventsView.vue';
import logoUrl from './assets/header_logo.png';

type Tab = 'menu' | 'orders' | 'inventory' | 'events';

const connectivity = useConnectivityStore();
const sync = useSyncStore();
const eventStore = useEventStore();

const tab = ref<Tab>('menu');
const selectedItem = ref<MenuItemView | null>(null);
const cartOpen = ref(false);
const paid = ref<{queued: boolean; totalCents: number} | null>(null);

onMounted(async () => {
  await sync.refresh();
  connectivity.start();
  eventStore.start();
});

watch(
  () => connectivity.online,
  online => {
    if (online) sync.flush();
  },
);

const navItems: {key: Tab; label: string; icon: string}[] = [
  {key: 'menu', label: 'Menu', icon: 'M10 4.5C8.5 3.5 5.5 3.5 4 4v10c1.5 -0.5 4.5 -0.5 6 0.5 1.5 -1 4.5 -1 6 -0.5V4c-1.5 -0.5 -4.5 -0.5 -6 0.5zM10 4.5v10'},
  {key: 'orders', label: 'Orders', icon: 'M4 3h10l2 3v11H4zM7 8h6M7 11h6M7 14h4'},
  {key: 'inventory', label: 'Inventory', icon: 'M6 6V5a2 2 0 0 1 4 0v1M6 6h8l1 10H5zM7 6V5a3 3 0 0 1 6 0v1'},
  {key: 'events', label: 'Events', icon: 'M4 5h12v11H4zM4 8h12M7 3v3M13 3v3M7 11h2M11 11h2'},
];
</script>


<template>
  <div class="app">
    <nav class="rail">
      <div class="brand">
        <img :src="logoUrl" class="header-logo" alt="Logo" />
        <div class="brand-sub">POSI</div>
      </div>

      <div class="tabs">
        <button
          v-for="item in navItems"
          :key="item.key"
          class="tab tap"
          :class="{active: tab === item.key}"
          @click="tab = item.key">
          <svg viewBox="0 0 20 20" class="icon" aria-hidden="true">
            <path :d="item.icon" fill="none" stroke="currentColor"
              stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span class="tab-label">{{ item.label }}</span>
        </button>
      </div>

      <div class="rail-foot">
        <StatusBadge />
      </div>
    </nav>

    <main class="stage">
      <MenuView
        v-show="tab === 'menu'"
        @select="selectedItem = $event"
        @open-cart="cartOpen = true" />

      <OrdersView v-if="tab === 'orders'" />

      <InventoryView v-if="tab === 'inventory'" />

      <EventsView v-if="tab === 'events'" />

      <ItemDetailView
        v-if="selectedItem"
        :item="selectedItem"
        @close="selectedItem = null" />

      <CartView
        v-if="cartOpen"
        @close="cartOpen = false"
        @paid="
          info => {
            cartOpen = false;
            paid = info;
          }
        " />

      <PaidView
        v-if="paid"
        :queued="paid.queued"
        :total-cents="paid.totalCents"
        @new-order="paid = null" />
    </main>
  </div>
</template>


<style scoped>
.app {
  height: 100%;
  display: flex;
}
.rail {
  width: 96px;
  flex-shrink: 0;
  background: var(--color-ink);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: 16px 8px;
  gap: 24px;
}
.brand {
  text-align: center;
}
.header-logo {
  max-width: 70px;
  max-height: auto;
 }
.brand-sub {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--color-gold-dark);
  text-transform: uppercase;
  letter-spacing: 3px;
  margin-top: 2px;
}
.tabs {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}
.tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 4px;
  border-radius: var(--radius-md);
  color: var(--color-paper-2);
  background: transparent;
  transition: background 0.12s ease, color 0.12s ease;
}
.tab.active {
  background: var(--color-grass-dark);
  color: var(--color-white);
}
.tab:not(.active):active {
  background: var(--color-ink-soft);
}
.icon {
  width: 24px;
  height: 24px;
}
.tab-label {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.rail-foot {
  display: flex;
  justify-content: center;
}
.stage {
  position: relative;
  flex: 1;
  overflow: hidden;
}
</style>