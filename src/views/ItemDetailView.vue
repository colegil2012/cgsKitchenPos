<script setup lang="ts">
import {ref, computed} from 'vue';
import type {MenuItemView} from '../types/menu';
import {
  type CartLine,
  defaultSelections,
  newLineId,
  unitPriceCents,
  upchargeCents,
  validateSelections,
} from '../lib/cart';
import {useCartStore} from '../stores/cart';
import OptionGroupSelector from '../components/OptionGroupSelector.vue';
import AppButton from '../components/AppButton.vue';
import {money} from '../lib/format';

const props = defineProps<{item: MenuItemView}>();
const emit = defineEmits<{(e: 'close'): void}>();

const cart = useCartStore();
const selections = ref<Record<string, string[]>>(defaultSelections(props.item));
const qty = ref(1);

const previewLine = computed<CartLine>(() => ({
  lineId: 'preview',
  item: props.item,
  selections: selections.value,
  quantity: qty.value,
}));

const unit = computed(() => unitPriceCents(previewLine.value));
const upcharge = computed(() => upchargeCents(previewLine.value));
const validationError = computed(() =>
  validateSelections(props.item, selections.value),
);

function setGroup(groupId: string, ids: string[]) {
  selections.value = {...selections.value, [groupId]: ids};
}

function add() {
  if (validationError.value) return;
  cart.add({
    lineId: newLineId(),
    item: props.item,
    selections: selections.value,
    quantity: qty.value,
  });
  emit('close');
}
</script>

<template>
  <div class="overlay">
    <div class="topbar">
      <button class="close tap" @click="emit('close')">✕</button>
      <span class="title">{{ item.name }}</span>
      <span class="close" />
    </div>

    <div class="scroll content">
      <div class="header">
        <h1>{{ item.name }}</h1>
        <p v-if="item.description" class="desc">{{ item.description }}</p>
        <div class="base">{{ item.priceDisplay || money(item.priceCents) }}</div>
      </div>

      <OptionGroupSelector
        v-for="group in item.optionGroups"
        :key="group.id"
        :group="group"
        :selected="selections[group.id] ?? []"
        @change="ids => setGroup(group.id, ids)" />

      <div class="qty-row">
        <span class="qty-label">Quantity</span>
        <div class="stepper">
          <button class="step tap" @click="qty = Math.max(1, qty - 1)">−</button>
          <span class="qty-val">{{ qty }}</span>
          <button class="step tap" @click="qty++">+</button>
        </div>
      </div>

      <p v-if="upcharge !== 0" class="upcharge">
        Options {{ upcharge > 0 ? '+' : '' }}{{ money(upcharge) }} · {{ money(unit) }} each
      </p>
    </div>

    <div class="footer">
      <p v-if="validationError" class="err">{{ validationError }}</p>
      <AppButton
        :label="`Add ${qty} · ${money(unit * qty)}`"
        :disabled="!!validationError"
        @click="add" />
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
  z-index: 20;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
}
.close {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  color: var(--color-muted);
}
.title {
  flex: 1;
  text-align: center;
  font-size: 18px;
}
.content {
  flex: 1;
  padding: 16px;
}
.header {
  margin-bottom: 24px;
}
.header h1 {
  font-size: 30px;
}
.desc {
  color: var(--color-muted);
  margin: 8px 0 0;
}
.base {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 800;
  color: var(--color-gold-dark);
  margin-top: 12px;
}
.qty-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 8px 0 16px;
}
.qty-label {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
}
.stepper {
  display: flex;
  align-items: center;
  background: var(--color-paper-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.step {
  width: 56px;
  height: 56px;
  font-size: 28px;
  font-weight: 800;
  color: var(--color-orange);
}
.qty-val {
  min-width: 44px;
  text-align: center;
  font-size: 22px;
  font-weight: 800;
}
.upcharge {
  text-align: center;
  color: var(--color-muted);
  font-size: 14px;
}
.footer {
  padding: 16px 16px 20px;
  border-top: 1px solid var(--color-border);
  background: var(--color-white);
}
.footer :deep(.btn) {
  width: 100%;
}
.err {
  color: var(--color-danger);
  text-align: center;
  font-size: 14px;
  margin: 0 0 12px;
}
</style>