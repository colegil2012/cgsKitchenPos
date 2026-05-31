<script setup lang="ts">
import type {MenuItemView} from '../types/menu';
import {money} from '../lib/format';

const props = defineProps<{item: MenuItemView}>();
defineEmits<{(e: 'select', item: MenuItemView): void}>();

const hasOptions = props.item.optionGroups.length > 0;
</script>

<template>
  <button class="card tap" @click="$emit('select', item)">
    <div class="top">
      <span
        v-if="item.badgeLabel"
        class="badge"
        :style="{background: item.badgeColor || 'var(--color-gold-dark)'}">
        {{ item.badgeLabel.toUpperCase() }}
      </span>
      <span v-else />
      <span class="price">{{ item.priceDisplay || money(item.priceCents) }}</span>
    </div>
    <div class="name">{{ item.name }}</div>
    <div v-if="item.description" class="desc">{{ item.description }}</div>
    <div class="cta">{{ hasOptions ? 'Customize ›' : 'Add ›' }}</div>
  </button>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  text-align: left;
  width: 100%;
  min-height: 150px;
  padding: 16px;
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}
.card:active {
  background: var(--color-paper-3);
  border-color: var(--color-orange);
}
.top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.badge {
  padding: 3px 8px;
  border-radius: var(--radius-full);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.6px;
  color: var(--color-white);
}
.price {
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 800;
  color: var(--color-gold-dark);
}
.name {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  margin-top: 12px;
}
.desc {
  font-size: 14px;
  color: var(--color-muted);
  margin-top: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.cta {
  margin-top: 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-orange);
}
</style>