<script setup lang="ts">
import {computed} from 'vue';
import type {OptionGroupView} from '../types/menu';
import {money} from '../lib/format';

const props = defineProps<{
  group: OptionGroupView;
  selected: string[];
}>();
const emit = defineEmits<{(e: 'change', ids: string[]): void}>();

const hint = computed(() => {
  const g = props.group;
  if (g.selectionType === 'SINGLE') {
    return g.required ? 'Required · pick one' : 'Pick one';
  }
  return g.maxSelections > 0 ? `Pick up to ${g.maxSelections}` : 'Pick any';
});

function toggle(choiceId: string, available: boolean) {
  if (!available) return;
  const g = props.group;
  if (g.selectionType === 'SINGLE') {
    emit('change', [choiceId]);
    return;
  }
  const sel = props.selected;
  if (sel.includes(choiceId)) {
    emit(
      'change',
      sel.filter(id => id !== choiceId),
    );
  } else if (g.maxSelections > 0 && sel.length >= g.maxSelections) {
    // At cap — FIFO replace so a tap still responds.
    emit('change', [...sel.slice(1), choiceId]);
  } else {
    emit('change', [...sel, choiceId]);
  }
}
</script>

<template>
  <div class="group">
    <div class="head">
      <span class="label">{{ group.label }}</span>
      <span class="hint">{{ hint }}</span>
    </div>
    <div class="choices">
      <button
        v-for="choice in group.choices"
        :key="choice.id"
        class="choice tap"
        :class="{
          sel: selected.includes(choice.id),
          unavail: !choice.available,
        }"
        @click="toggle(choice.id, choice.available)">
        <span>
          {{ choice.label }}
          <template v-if="!choice.available">
            — {{ choice.unavailableReason || "86\u2019d" }}
          </template>
        </span>
        <span v-if="choice.priceDeltaCents !== 0 && choice.available" class="delta">
          {{ choice.priceDeltaCents > 0 ? '+' : '' }}{{ money(choice.priceDeltaCents) }}
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.group {
  margin-bottom: 24px;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 12px;
}
.label {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
}
.hint {
  font-family: var(--font-mono);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-muted);
}
.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.choice {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--color-paper-2);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 16px;
  font-weight: 600;
  color: var(--color-ink);
}
.choice.sel {
  background: var(--color-gold-darker);
  border-color: var(--color-gold-darker);
  color: var(--color-white);
}
.choice.unavail {
  opacity: 0.4;
  border-style: dashed;
  color: var(--color-muted);
  pointer-events: none;
}
.delta {
  font-size: 14px;
  font-weight: 800;
  color: var(--color-gold-dark);
}
.choice.sel .delta {
  color: var(--color-white);
}
</style>