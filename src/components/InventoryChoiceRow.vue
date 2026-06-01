<script setup lang="ts">
import {computed} from 'vue';
import type {OptionChoiceView} from '../types/menu';
import {useInventoryStore} from '../stores/inventory';
import {useConnectivityStore} from '../stores/connectivity';

const props = defineProps<{groupId: string; choice: OptionChoiceView}>();

const inventory = useInventoryStore();
const connectivity = useConnectivityStore();

const busy = computed(() => inventory.working.has(props.choice.id));
const disabled = computed(() => busy.value || !connectivity.online);

function toggle() {
  const currentlyAvailable = props.choice.available;
  let reason: string | undefined;
  if (currentlyAvailable) {
    // 86'ing — offer an optional, skippable reason.
    const entered = window.prompt(
      'Optional reason (e.g. "out of lamb") — leave blank to skip:',
      '',
    );
    if (entered === null) return; // cancelled
    reason = entered.trim() || undefined;
  }
  inventory.toggleChoice(
    props.groupId,
    props.choice.id,
    !currentlyAvailable,
    reason,
  );
}
</script>

<template>
  <div class="choice" :class="{off: !choice.available}">
    <div class="info">
      <span class="name">{{ choice.label }}</span>
      <span v-if="!choice.available && choice.unavailableReason" class="reason">
        {{ choice.unavailableReason }}
      </span>
    </div>
    <button
      class="toggle tap"
      :class="choice.available ? 'on' : 'off'"
      :disabled="disabled"
      @click="toggle">
      {{ busy ? '…' : choice.available ? 'On' : "86" }}
    </button>
  </div>
</template>

<style scoped>
.choice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.choice.off {
  background: var(--color-paper-2);
  opacity: 0.85;
}
.info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.name {
  font-weight: 600;
  color: var(--color-ink);
  font-size: 14px;
}
.reason {
  font-size: 12px;
  color: var(--color-danger);
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