<script setup lang="ts">
import {onMounted, ref} from 'vue';
import {useMenuStore} from '../stores/menu';
import {useCartStore} from '../stores/cart';
import type {MenuItemView} from '../types/menu';
import MenuCard from '../components/MenuCard.vue';
import EventStatusStrip from '../components/EventStatusStrip.vue';
import AppButton from '../components/AppButton.vue';
import {money} from '../lib/format';

defineEmits<{
  (e: 'select', item: MenuItemView): void;
  (e: 'open-cart'): void;
}>();

const menu = useMenuStore();
const cart = useCartStore();

const bodyEl = ref<HTMLElement | null>(null);

/** Scroll a category section into view when its chip is tapped. */
function jumpTo(categoryName: string) {
  const el = bodyEl.value?.querySelector(
    `[data-cat="${CSS.escape(categoryName)}"]`,
  );
  el?.scrollIntoView({behavior: 'smooth', block: 'start'});
}

onMounted(() => {
  if (menu.items.length === 0) menu.load();
});
</script>

<template>
  <div class="view">
    <EventStatusStrip />
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

    <template v-else>
      <!-- Search + category quick-jump: the two rush-time navigation aids. -->
      <div class="toolbar">
        <div class="search">
          <span class="search-icon" aria-hidden="true">⌕</span>
          <input
            v-model="menu.search"
            class="search-input"
            type="text"
            inputmode="search"
            placeholder="Search menu…"
            aria-label="Search menu" />
          <button
            v-if="menu.search"
            class="search-clear tap"
            aria-label="Clear search"
            @click="menu.search = ''">
            ✕
          </button>
        </div>
        <div v-if="!menu.search && menu.categoryNames.length > 1" class="chips">
          <button
            v-for="cat in menu.categoryNames"
            :key="cat"
            class="chip tap"
            @click="jumpTo(cat)">
            {{ cat }}
          </button>
        </div>
      </div>

      <div ref="bodyEl" class="scroll body">
        <section
          v-for="section in menu.sections"
          :key="section.categoryName"
          :data-cat="section.categoryName"
          class="section">
          <h2 class="section-title">{{ section.categoryName }}</h2>
          <div class="grid">
            <div v-for="mi in section.items" :key="mi.id" class="cell">
              <MenuCard :item="mi" @select="$emit('select', $event)" />
            </div>
          </div>
        </section>

        <div v-if="menu.sections.length === 0" class="center no-results">
          <p class="muted">No items match “{{ menu.search }}”.</p>
          <AppButton label="Clear search" variant="ghost" @click="menu.search = ''" />
        </div>
      </div>
    </template>

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
.toolbar {
  padding: 12px 12px 8px;
  background: var(--color-paper);
  border-bottom: 1px solid var(--color-border);
}
.search {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--color-white);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0 12px;
  height: 48px;
}
.search-icon {
  font-size: 20px;
  color: var(--color-muted);
}
.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 16px;
  color: var(--color-ink);
  outline: none;
  height: 100%;
}
.search-clear {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: var(--color-muted);
  font-size: 14px;
}
.chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-top: 10px;
  scrollbar-width: none;
}
.chips::-webkit-scrollbar {
  display: none;
}
.chip {
  flex: 0 0 auto;
  padding: 8px 14px;
  background: var(--color-paper-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-ink);
  white-space: nowrap;
}
.no-results {
  padding-top: 48px;
  gap: 16px;
}
.body {
  flex: 1;
  padding-bottom: 120px;
}
.section {
  padding-bottom: 22px;
}
.section-title {
  font-size: 22px;
  color: var(--color-ink);
  font-family: var(--font-display);
  letter-spacing: 0.15em;
  text-transform: uppercase;
  background: var(--color-paper);
  padding: 18px;
  margin-bottom: 22px;
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